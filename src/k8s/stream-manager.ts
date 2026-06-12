/**
 * StreamManager — two-tier watch stream policy (Spec 01 §3.1).
 *
 * Core set: always open, reconnected with backoff on drop.
 * On-demand set: opened on first view, idle-closed after timeout, periodic
 * LIST for badge counts.
 *
 * All time via injected Clock; all K8s ops via injected KubeClient.
 */

import type {
  KubeClient,
  WatchSubscription,
  KubeError,
} from '../boundaries/kube-client.js';
import type { Clock } from '../boundaries/clock.js';
import type { ResourceEvent } from '../core/types.js';

export type StreamEventHandler = (event: ResourceEvent) => void;
export type StreamErrorHandler = (kind: string, error: KubeError) => void;
export type BadgeCountHandler = (kind: string, count: number) => void;

export interface StreamManagerOptions {
  /** Idle timeout in seconds before closing an on-demand stream. Default: 300. */
  idleTimeoutSeconds?: number;
  /** Interval in seconds for periodic metadata LIST on on-demand kinds. Default: 60. */
  listIntervalSeconds?: number;
  /** Base backoff delay in ms. Default: 1000. */
  backoffBaseMs?: number;
  /** Max backoff delay in ms. Default: 30000. */
  backoffMaxMs?: number;
}

/** The fixed core set of kinds always watched at startup. */
const BUILTIN_CORE_KINDS: readonly string[] = [
  'Pod',
  'Deployment',
  'StatefulSet',
  'DaemonSet',
  'Node',
  'Namespace',
];

/** Kafka CRD kinds that are part of the core set when discovered. */
const KAFKA_KINDS: ReadonlySet<string> = new Set(['Kafka', 'KafkaTopic']);

interface ManagedStream {
  /** Logical key used as Map key (same as watchKind unless overridden). */
  key: string;
  /** Actual kind passed to client.watch(). */
  watchKind: string;
  /** Optional field selector for the watch. */
  fieldSelector: string | undefined;
  subscription: WatchSubscription | null;
  resourceVersion: string | undefined;
  backoffMs: number;
  reconnectCancel: (() => void) | null;
  /** null for core streams; epoch ms of last access for on-demand. */
  lastAccessedAt: number | null;
  /** For on-demand: cancel handle for the idle-close timer. */
  idleCancel: (() => void) | null;
  /** For on-demand: cancel handle for the periodic list interval. */
  listCancel: (() => void) | null;
}

export class StreamManager {
  private readonly client: KubeClient;
  private readonly clock: Clock;
  private readonly onEvent: StreamEventHandler;
  private readonly onError: StreamErrorHandler;
  private readonly onBadgeCount: BadgeCountHandler;
  private readonly idleTimeoutMs: number;
  private readonly listIntervalMs: number;
  private readonly backoffBaseMs: number;
  private readonly backoffMaxMs: number;

  private streams = new Map<string, ManagedStream>();
  private started = false;
  private stopped = false;

  constructor(
    client: KubeClient,
    clock: Clock,
    onEvent: StreamEventHandler,
    onError: StreamErrorHandler,
    onBadgeCount: BadgeCountHandler,
    options: StreamManagerOptions = {},
  ) {
    this.client = client;
    this.clock = clock;
    this.onEvent = onEvent;
    this.onError = onError;
    this.onBadgeCount = onBadgeCount;
    this.idleTimeoutMs = (options.idleTimeoutSeconds ?? 300) * 1000;
    this.listIntervalMs = (options.listIntervalSeconds ?? 60) * 1000;
    this.backoffBaseMs = options.backoffBaseMs ?? 1000;
    this.backoffMaxMs = options.backoffMaxMs ?? 30_000;
  }

  /**
   * Start all core streams. Pass detected Kafka kinds to include in core set.
   * Safe to call only once; subsequent calls are no-ops.
   */
  start(kafkaKinds: ReadonlySet<string> = new Set()): void {
    if (this.started || this.stopped) {
      return;
    }
    this.started = true;

    for (const kind of BUILTIN_CORE_KINDS) {
      this.openCoreStream(kind, kind, undefined);
    }

    for (const kind of kafkaKinds) {
      if (KAFKA_KINDS.has(kind)) {
        this.openCoreStream(kind, kind, undefined);
      }
    }

    // Warning events — cluster-wide, field-selected for type=Warning
    this.openCoreStream('WarningEvents', 'Event', 'type=Warning');
  }

  /**
   * Activate an on-demand stream for `kind`. Resets the idle timer if already
   * open; opens a new stream if not. Called when the user navigates to a kind.
   */
  activate(kind: string): void {
    if (this.stopped) {
      return;
    }

    const existing = this.streams.get(kind);
    if (existing !== undefined) {
      // Reset idle timer
      if (existing.idleCancel !== null) {
        existing.idleCancel();
      }
      existing.lastAccessedAt = this.clock.now();
      // Capture `existing` in the closure so teardown can access it directly
      const captured = existing;
      existing.idleCancel = this.clock.setTimeout(() => {
        this.teardownStream(captured);
        this.streams.delete(kind);
      }, this.idleTimeoutMs);
      return;
    }

    // Open new on-demand stream
    const stream: ManagedStream = {
      key: kind,
      watchKind: kind,
      fieldSelector: undefined,
      subscription: null,
      resourceVersion: undefined,
      backoffMs: this.backoffBaseMs,
      reconnectCancel: null,
      lastAccessedAt: this.clock.now(),
      idleCancel: null,
      listCancel: null,
    };
    this.streams.set(kind, stream);
    this.openOnDemandStream(stream);
  }

  /** Stop all streams and release all resources. */
  stop(): void {
    if (this.stopped) {
      return;
    }
    this.stopped = true;

    for (const stream of this.streams.values()) {
      this.teardownStream(stream);
    }
    this.streams.clear();
  }

  /** Number of currently open subscriptions (for test assertions). */
  openStreamCount(): number {
    let count = 0;
    for (const stream of this.streams.values()) {
      if (stream.subscription !== null) {
        count++;
      }
    }
    return count;
  }

  /** Keys of all currently tracked streams (open or reconnecting). */
  trackedKinds(): string[] {
    return [...this.streams.keys()];
  }

  // ---------------------------------------------------------------------------
  // Core stream management
  // ---------------------------------------------------------------------------

  private openCoreStream(
    key: string,
    watchKind: string,
    fieldSelector: string | undefined,
  ): void {
    const stream: ManagedStream = {
      key,
      watchKind,
      fieldSelector,
      subscription: null,
      resourceVersion: undefined,
      backoffMs: this.backoffBaseMs,
      reconnectCancel: null,
      lastAccessedAt: null,
      idleCancel: null,
      listCancel: null,
    };
    this.streams.set(key, stream);
    this.connectStream(stream);
  }

  // ---------------------------------------------------------------------------
  // On-demand stream management
  // ---------------------------------------------------------------------------

  private openOnDemandStream(stream: ManagedStream): void {
    this.connectStream(stream);
    // Periodic LIST for badge counts
    stream.listCancel = this.clock.setInterval(() => {
      void this.runBadgeList(stream.key);
    }, this.listIntervalMs);
    // Idle-close timer — captures `stream` directly to avoid the map lookup
    stream.idleCancel = this.clock.setTimeout(() => {
      this.teardownStream(stream);
      this.streams.delete(stream.key);
    }, this.idleTimeoutMs);
  }

  private runBadgeList(key: string): Promise<void> {
    return this.client.list(key, { metadataOnly: true }).then((result) => {
      if (!result.ok) {
        return;
      }
      const count =
        result.value.items.length + (result.value.remainingItemCount ?? 0);
      this.onBadgeCount(key, count);
    });
  }

  // ---------------------------------------------------------------------------
  // Stream connect / reconnect
  // ---------------------------------------------------------------------------

  private connectStream(stream: ManagedStream): void {
    const watchOptions = {
      ...(stream.fieldSelector !== undefined
        ? { fieldSelector: stream.fieldSelector }
        : {}),
      ...(stream.resourceVersion !== undefined
        ? { resourceVersion: stream.resourceVersion }
        : {}),
    };

    const subscription = this.client.watch(
      stream.watchKind,
      watchOptions,
      (event) => {
        // Track resourceVersion for resumption on reconnect
        const rv = event.object.metadata?.resourceVersion;
        if (rv !== undefined) {
          stream.resourceVersion = rv;
        }
        // Reset backoff on successful event
        stream.backoffMs = this.backoffBaseMs;
        this.onEvent(event);
      },
    );

    subscription.onError((error) => {
      // Close the subscription to clean up server-side resources.
      subscription.close();
      stream.subscription = null;
      this.onError(stream.key, error);
      // Schedule reconnect with current backoff
      const delayMs = stream.backoffMs;
      // Double backoff before scheduling so the next failure uses doubled value
      stream.backoffMs = Math.min(stream.backoffMs * 2, this.backoffMaxMs);
      stream.reconnectCancel = this.clock.setTimeout(() => {
        stream.reconnectCancel = null;
        this.connectStream(stream);
      }, delayMs);
    });

    stream.subscription = subscription;
  }

  private teardownStream(stream: ManagedStream): void {
    if (stream.subscription !== null) {
      stream.subscription.close();
      stream.subscription = null;
    }
    if (stream.reconnectCancel !== null) {
      stream.reconnectCancel();
      stream.reconnectCancel = null;
    }
    if (stream.idleCancel !== null) {
      stream.idleCancel();
      stream.idleCancel = null;
    }
    if (stream.listCancel !== null) {
      stream.listCancel();
      stream.listCancel = null;
    }
  }
}
