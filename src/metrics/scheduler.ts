/**
 * Polling scheduler for metrics contexts (Spec 06 §2.4).
 *
 * Per-context intervals:
 *   - list-sparklines     30 s
 *   - metrics-tab         10 s
 *   - dashboard           60 s
 *   - kafka-lag           15 s
 *   - off-screen          not polled
 *
 * Coalesces overlapping registrations for the same context; cancels cleanly.
 *
 * Boundaries consumed:
 *   - Clock — setInterval / cancel (no setTimeout / setInterval directly)
 */
import type { Clock, CancelHandle } from '../boundaries/clock.js';

/** Named polling contexts from Spec 06 §2.4. */
export type PollingContext =
  | 'list-sparklines'
  | 'metrics-tab'
  | 'dashboard'
  | 'kafka-lag';

/** Interval in ms for each context (Spec 06 §2.4). */
export const POLLING_INTERVALS_MS: Record<PollingContext, number> = {
  'list-sparklines': 30_000,
  'metrics-tab': 10_000,
  dashboard: 60_000,
  'kafka-lag': 15_000,
};

export type PollCallback = (context: PollingContext) => void;

/**
 * PollingScheduler registers and deregisters polling contexts. Each context
 * may have at most one active interval; starting the same context again
 * replaces the previous one.
 */
export class PollingScheduler {
  private active = new Map<PollingContext, CancelHandle>();

  constructor(private readonly clock: Clock) {}

  /**
   * Start polling for `context`, firing `callback` every interval. Replaces
   * any existing poll for that context.
   * Returns a cancel handle (also cancels via `stop(context)`).
   */
  start(context: PollingContext, callback: PollCallback): CancelHandle {
    this.stop(context);
    const intervalMs = POLLING_INTERVALS_MS[context];
    const cancel = this.clock.setInterval(() => {
      callback(context);
    }, intervalMs);
    this.active.set(context, cancel);
    return () => {
      this.stop(context);
    };
  }

  /** Stop polling for `context`. Idempotent. */
  stop(context: PollingContext): void {
    const cancel = this.active.get(context);
    if (cancel !== undefined) {
      cancel();
      this.active.delete(context);
    }
  }

  /** Stop all active polling contexts. */
  stopAll(): void {
    for (const context of [...this.active.keys()]) {
      this.stop(context);
    }
  }

  /** True if the given context is currently being polled. */
  isActive(context: PollingContext): boolean {
    return this.active.has(context);
  }

  /** Set of currently active contexts. */
  activeContexts(): ReadonlySet<PollingContext> {
    return new Set(this.active.keys());
  }
}
