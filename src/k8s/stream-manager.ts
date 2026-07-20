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
/**
 * Fired when a kind's relist-recovery outcome changes: `true` when a re-list
 * attempt fails (stream is stale/degraded until recovery succeeds), `false`
 * when recovery succeeds. The caller surfaces this as a degraded-stream
 * indicator for that kind (Spec 01 §3.1).
 */
export type StreamDegradedHandler = (kind: string, degraded: boolean) => void;
/**
 * Fired after a successful relist for `kind` with the set of
 * `${namespace ?? '~'}/${name}` identities the fresh LIST returned, so the
 * caller can reconcile its store (drop resources missing from the list —
 * DELETED events that were missed while the watch was down).
 */
export type StreamRelistHandler = (
  kind: string,
  present: ReadonlySet<string>,
) => void;

export interface StreamManagerOptions {
  /** Idle timeout in seconds before closing an on-demand stream. Default: 300. */
  idleTimeoutSeconds?: number;
  /** Interval in seconds for periodic metadata LIST on on-demand kinds. Default: 60. */
  listIntervalSeconds?: number;
  /** Base backoff delay in ms. Default: 1000. */
  backoffBaseMs?: number;
  /** Max backoff delay in ms. Default: 30000. */
  backoffMaxMs?: number;
  /**
   * Max backoff delay in ms for relist retries after a 410/expired watch
   * error (Spec/ticket P9R-0009). Default: 120000 (2 min).
   */
  relistBackoffMaxMs?: number;
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
  /** True once a 410/expired error has triggered relist recovery, until it succeeds. */
  recoveringFromExpired: boolean;
  /** True while relist recovery is failing (degraded-stream indicator is active). */
  degraded: boolean;
  /** Backoff for relist retries after a 410/expired error, capped at relistBackoffMaxMs. */
  relistBackoffMs: number;
}

export class StreamManager {
  private readonly client: KubeClient;
  private readonly clock: Clock;
  private readonly onEvent: StreamEventHandler;
  private readonly onError: StreamErrorHandler;
  private readonly onBadgeCount: BadgeCountHandler;
  private readonly onDegraded: StreamDegradedHandler;
  private readonly onRelist: StreamRelistHandler;
  private readonly idleTimeoutMs: number;
  private readonly listIntervalMs: number;
  private readonly backoffBaseMs: number;
  private readonly backoffMaxMs: number;
  private readonly relistBackoffMaxMs: number;

  private streams = new Map<string, ManagedStream>();
  private started = false;
  private stopped = false;

  constructor(
    client: KubeClient,
    clock: Clock,
    onEvent: StreamEventHandler,
    onError: StreamErrorHandler,
    onBadgeCount: BadgeCountHandler,
    onDegraded: StreamDegradedHandler,
    onRelist: StreamRelistHandler,
    options: StreamManagerOptions = {},
  ) {
    this.client = client;
    this.clock = clock;
    this.onEvent = onEvent;
    this.onError = onError;
    this.onBadgeCount = onBadgeCount;
    this.onDegraded = onDegraded;
    this.onRelist = onRelist;
    this.idleTimeoutMs = (options.idleTimeoutSeconds ?? 300) * 1000;
    this.listIntervalMs = (options.listIntervalSeconds ?? 60) * 1000;
    this.backoffBaseMs = options.backoffBaseMs ?? 1000;
    this.backoffMaxMs = options.backoffMaxMs ?? 30_000;
    this.relistBackoffMaxMs = options.relistBackoffMaxMs ?? 120_000;
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
      recoveringFromExpired: false,
      degraded: false,
      relistBackoffMs: this.backoffBaseMs,
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
      recoveringFromExpired: false,
      degraded: false,
      relistBackoffMs: this.backoffBaseMs,
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

      if (error.kind === 'expired') {
        // 410/"too old resource version": the stale resourceVersion we hold
        // can never resume — retrying the same watch would loop forever
        // (P9R-0009). Recover via list-then-watch instead.
        stream.resourceVersion = undefined;
        if (!stream.recoveringFromExpired) {
          // Log/report exactly once on entry into recovery, not on every
          // relist retry, so debug.log gets one line instead of an
          // unbounded identical-error stream.
          stream.recoveringFromExpired = true;
          this.onError(stream.key, error);
        }
        this.relist(stream);
        return;
      }

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

  // ---------------------------------------------------------------------------
  // Relist recovery (410 / "too old resource version" — P9R-0009)
  // ---------------------------------------------------------------------------

  /**
   * Recover a stream from a 410/expired watch error: fresh LIST, replay the
   * items as ADDED events (upserts the store), reconcile removals via
   * `onRelist`, then resume watching from the list's resourceVersion. On
   * failure, retries with exponential backoff capped at `relistBackoffMaxMs`
   * and surfaces a degraded-stream indicator via `onDegraded` until it
   * succeeds.
   */
  private relist(stream: ManagedStream): void {
    void this.client.list(stream.watchKind, {}).then((result) => {
      if (!result.ok) {
        if (!stream.degraded) {
          stream.degraded = true;
          this.onDegraded(stream.key, true);
        }
        const delayMs = stream.relistBackoffMs;
        stream.relistBackoffMs = Math.min(
          stream.relistBackoffMs * 2,
          this.relistBackoffMaxMs,
        );
        stream.reconnectCancel = this.clock.setTimeout(() => {
          stream.reconnectCancel = null;
          this.relist(stream);
        }, delayMs);
        return;
      }

      const now = this.clock.now();
      const present = new Set<string>();
      for (const item of result.value.items) {
        const namespace = item.metadata?.namespace ?? null;
        const name = item.metadata?.name ?? '';
        present.add(`${namespace ?? '~'}/${name}`);
        this.onEvent({
          type: 'ADDED',
          apiVersion: item.apiVersion ?? '',
          kind: stream.watchKind,
          namespace,
          name,
          object: { ...item, kind: stream.watchKind },
          receivedAt: now,
        });
      }
      this.onRelist(stream.key, present);

      stream.resourceVersion = result.value.resourceVersion;
      stream.backoffMs = this.backoffBaseMs;
      stream.relistBackoffMs = this.backoffBaseMs;
      stream.recoveringFromExpired = false;
      if (stream.degraded) {
        stream.degraded = false;
        this.onDegraded(stream.key, false);
      }
      this.connectStream(stream);
    });
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
