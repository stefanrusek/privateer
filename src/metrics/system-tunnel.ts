/**
 * System port-forward tunnel for in-cluster Prometheus access (Spec 06 §2.2,
 * Spec 01 OQ-2). Distinct from user port-forwards (Spec 05 §5) — listed
 * separately as a system forward, never shown in the user's manager overlay.
 *
 * On failure: degrades to next source tier and retries with exponential
 * backoff, matching the watch-stream reconnect policy (Spec 01 §3.1).
 *
 * Boundaries consumed:
 *   - ProcessRunner — spawn kubectl port-forward
 *   - Clock         — backoff timer (no Date.now / setTimeout)
 */
import type { ProcessRunner } from '../boundaries/process-runner.js';
import type { Clock, CancelHandle } from '../boundaries/clock.js';

/** Readiness signal from kubectl port-forward stdout (same as user PF). */
const READY_SIGNAL = 'Forwarding from';

/** Backoff sequence in ms: 1s, 2s, 4s, 8s, 16s, capped at 32s. */
const BACKOFF_MS: readonly [number, number, number, number, number, number] = [
  1_000, 2_000, 4_000, 8_000, 16_000, 32_000,
];

export type TunnelStatus = 'starting' | 'active' | 'failed' | 'closed';

export interface SystemTunnelOptions {
  /** The pod or service resource spec, e.g. "service/prometheus-operated". */
  readonly resource: string;
  readonly namespace: string;
  readonly remotePort: number;
  readonly localPort: number;
}

export interface SystemTunnelState {
  readonly status: TunnelStatus;
  readonly localPort: number;
  /** Set when the tunnel fails before exhausting retries. */
  readonly failReason: string | undefined;
  /** Total retry attempts so far. */
  readonly retryCount: number;
}

/**
 * SystemTunnel manages a single kubectl port-forward subprocess for
 * Prometheus in-cluster access, with automatic backoff retries.
 */
export class SystemTunnel {
  private status: TunnelStatus = 'starting';
  private failReason: string | undefined = undefined;
  private retryCount = 0;
  private cancelBackoff: CancelHandle | null = null;
  private processRunning = false;
  private closed = false;
  private changeHandlers: (() => void)[] = [];

  constructor(
    private readonly runner: ProcessRunner,
    private readonly clock: Clock,
    private readonly options: SystemTunnelOptions,
  ) {}

  /** Start the tunnel. Idempotent — safe to call after construction. */
  open(): void {
    if (this.closed) {
      return;
    }
    this.spawn();
  }

  /** Subscribe to status changes. Returns an unsubscribe function. */
  onChange(handler: () => void): () => void {
    this.changeHandlers.push(handler);
    return () => {
      this.changeHandlers = this.changeHandlers.filter((h) => h !== handler);
    };
  }

  /** Current observable state snapshot. */
  getState(): SystemTunnelState {
    return {
      status: this.status,
      localPort: this.options.localPort,
      failReason: this.failReason,
      retryCount: this.retryCount,
    };
  }

  /** Permanently close the tunnel — no more retries. */
  close(): void {
    this.closed = true;
    this.status = 'closed';
    if (this.cancelBackoff !== null) {
      this.cancelBackoff();
      this.cancelBackoff = null;
    }
    this.notify();
  }

  private spawn(): void {
    this.status = 'starting';
    this.processRunning = true;
    this.notify();

    const handle = this.runner.spawn('kubectl', [
      'port-forward',
      this.options.resource,
      `${String(this.options.localPort)}:${String(this.options.remotePort)}`,
      '-n',
      this.options.namespace,
    ]);

    handle.onStdout((line) => {
      if (this.closed) {
        return;
      }
      if (line.includes(READY_SIGNAL)) {
        this.status = 'active';
        this.failReason = undefined;
        this.notify();
      }
    });

    handle.onStderr((line) => {
      if (this.closed) {
        return;
      }
      this.failReason = line.trim();
      this.notify();
    });

    handle.onExit((code) => {
      this.processRunning = false;
      if (this.closed) {
        return;
      }
      if (this.status === 'active' || this.status === 'starting') {
        const reason =
          code !== null ? `exited with code ${String(code)}` : 'terminated';
        this.failReason = this.failReason ?? reason;
        this.status = 'failed';
        this.notify();
        this.scheduleRetry();
      }
    });
  }

  private scheduleRetry(): void {
    const index: 0 | 1 | 2 | 3 | 4 | 5 = Math.min(
      this.retryCount,
      BACKOFF_MS.length - 1,
    ) as 0 | 1 | 2 | 3 | 4 | 5;
    const delayMs = BACKOFF_MS[index];
    this.cancelBackoff = this.clock.setTimeout(() => {
      this.cancelBackoff = null;
      if (!this.closed) {
        this.retryCount++;
        this.spawn();
      }
    }, delayMs);
  }

  private notify(): void {
    for (const handler of [...this.changeHandlers]) {
      handler();
    }
  }

  /** True when a process is currently running. */
  get isRunning(): boolean {
    return this.processRunning;
  }
}
