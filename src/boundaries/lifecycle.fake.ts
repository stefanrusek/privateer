import type { Lifecycle, TerminationSignal } from './lifecycle.js';

/**
 * Test Lifecycle that records exit requests and lets tests drive signals,
 * instead of really terminating the process.
 */
export class FakeLifecycle implements Lifecycle {
  readonly exitCodes: number[] = [];
  private handlers = new Set<(signal: TerminationSignal) => void>();

  exit(code = 0): void {
    this.exitCodes.push(code);
  }

  onSignal(handler: (signal: TerminationSignal) => void): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  /** Whether `exit()` has been requested at least once. */
  get exited(): boolean {
    return this.exitCodes.length > 0;
  }

  /** The most recently requested exit code, or null if none. */
  get lastExitCode(): number | null {
    return this.exitCodes.at(-1) ?? null;
  }

  /** Drive a termination signal to all registered handlers. */
  emitSignal(signal: TerminationSignal): void {
    for (const handler of [...this.handlers]) {
      handler(signal);
    }
  }
}
