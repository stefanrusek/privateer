/**
 * Clock boundary (Spec 08 §5.1, §6.3). All time and scheduling flow through this
 * interface so that no module calls `Date.now()`, `setTimeout`, or `setInterval`
 * directly — every time-dependent branch becomes a constructible test input.
 */
export interface Clock {
  /** Current wall-clock time in epoch milliseconds. */
  now(): number;

  /**
   * Schedule `callback` to run after `delayMs`. Returns a handle that cancels
   * the pending callback when invoked. Equivalent to `setTimeout`.
   */
  setTimeout(callback: () => void, delayMs: number): CancelHandle;

  /**
   * Schedule `callback` to run every `intervalMs`. Returns a handle that stops
   * the interval when invoked. Equivalent to `setInterval`.
   */
  setInterval(callback: () => void, intervalMs: number): CancelHandle;
}

/** Cancels a scheduled timeout or interval. Idempotent. */
export type CancelHandle = () => void;
