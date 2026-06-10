import type { Clock, CancelHandle } from './clock.js';

interface ScheduledTask {
  id: number;
  runAt: number;
  intervalMs: number | null;
  callback: () => void;
  cancelled: boolean;
}

/**
 * Deterministic in-memory Clock for tests. Time only moves when `advance()` is
 * called; scheduled timeouts and intervals fire when their due time is reached.
 */
export class FakeClock implements Clock {
  private current: number;
  private nextId = 1;
  private tasks = new Map<number, ScheduledTask>();

  constructor(start = 0) {
    this.current = start;
  }

  now(): number {
    return this.current;
  }

  setTimeout(callback: () => void, delayMs: number): CancelHandle {
    return this.schedule(callback, delayMs, null);
  }

  setInterval(callback: () => void, intervalMs: number): CancelHandle {
    return this.schedule(callback, intervalMs, intervalMs);
  }

  private schedule(
    callback: () => void,
    delayMs: number,
    intervalMs: number | null,
  ): CancelHandle {
    const id = this.nextId++;
    const task: ScheduledTask = {
      id,
      runAt: this.current + delayMs,
      intervalMs,
      callback,
      cancelled: false,
    };
    this.tasks.set(id, task);
    return () => {
      task.cancelled = true;
      this.tasks.delete(id);
    };
  }

  /**
   * Advance time by `ms`, firing every task whose due time is reached, in
   * chronological order. Intervals re-arm for their next tick within the same
   * advance window.
   */
  advance(ms: number): void {
    const target = this.current + ms;
    for (;;) {
      const due = this.nextDueTask(target);
      if (due === null) {
        break;
      }
      this.current = due.runAt;
      if (due.intervalMs === null) {
        this.tasks.delete(due.id);
      } else {
        due.runAt += due.intervalMs;
      }
      due.callback();
    }
    this.current = target;
  }

  private nextDueTask(target: number): ScheduledTask | null {
    let earliest: ScheduledTask | null = null;
    for (const task of this.tasks.values()) {
      if (task.cancelled || task.runAt > target) {
        continue;
      }
      if (earliest === null || task.runAt < earliest.runAt) {
        earliest = task;
      }
    }
    return earliest;
  }

  /** Number of tasks still scheduled — for assertions about cleanup. */
  pendingCount(): number {
    return this.tasks.size;
  }
}
