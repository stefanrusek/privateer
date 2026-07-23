// Alternate-screen-buffer lifecycle (coverage-excluded glue, P9R-0013).
//
// Mirrors mouse-lifecycle.ts's invariant: the terminal must come back exactly
// the way the app found it on EVERY exit/suspend path (quit, crash,
// SIGINT/SIGTERM, exec handover) — leave the alternate screen buffer and show
// the cursor. `tearDown()` is idempotent for the same reason MouseLifecycle's
// is: React cleanup and a signal handler can race, and a torn-down terminal
// must never be re-poked.

import {
  ENTER_ALT_SCREEN,
  LEAVE_ALT_SCREEN,
  SHOW_CURSOR,
} from '../../input/screen.js';

/** Test seam: where control strings are written (defaults to the real stdout). */
export type ScreenWriter = (s: string) => void;

const defaultWriter: ScreenWriter = (s) => {
  process.stdout.write(s);
};

/**
 * Owns the alternate-screen lifecycle for one session. `enable()` switches
 * into the alternate screen; `tearDown()` switches back to the primary screen
 * (restoring whatever was there before — the shell prompt, its scrollback)
 * and shows the cursor. Idempotent like `MouseLifecycle.tearDown()`.
 */
export class ScreenLifecycle {
  private entered = false;
  private tornDown = false;

  constructor(private readonly write: ScreenWriter = defaultWriter) {}

  /** Enter the alternate screen buffer. Re-entering after a teardown is allowed. */
  enable(): void {
    this.tornDown = false;
    if (this.entered) {
      return;
    }
    this.entered = true;
    this.write(ENTER_ALT_SCREEN);
  }

  /**
   * Leave the alternate screen buffer and show the cursor. Idempotent: a
   * second call after a teardown is a no-op until `enable()` runs again.
   */
  tearDown(): void {
    if (this.tornDown) {
      return;
    }
    this.tornDown = true;
    this.entered = false;
    this.write(LEAVE_ALT_SCREEN + SHOW_CURSOR);
  }
}

/**
 * Register the process-level exit/signal/crash handlers that guarantee the
 * terminal is restored even when React's own cleanup never runs. Mirrors
 * `installMouseExitGuards`: `process.exit` covers normal exits,
 * SIGINT/SIGTERM cover Ctrl-C/kill, and `uncaughtException` covers a crash —
 * the alternate screen is left (and the cursor shown) *before* the error is
 * printed, so the crash message lands on the restored shell screen instead
 * of being swallowed by the still-live TUI frame. Returns a disposer that
 * removes the handlers.
 */
export function installScreenExitGuards(
  lifecycle: ScreenLifecycle,
): () => void {
  const onExit = (): void => {
    lifecycle.tearDown();
  };
  const onSignal = (signal: NodeJS.Signals): void => {
    lifecycle.tearDown();
    // Re-raise with the default disposition so the exit code is correct.
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
    process.kill(process.pid, signal);
  };
  const onUncaughtException = (err: unknown): void => {
    lifecycle.tearDown();
    process.removeListener('uncaughtException', onUncaughtException);
    // Re-throw onto a clean (primary) screen so the message is visible, then
    // let the process die with the conventional uncaught-exception exit code.
    // stderr is the correct sink once the terminal has been restored — this
    // is the one deliberate exception to the "never write stdout/stderr"
    // rule while Ink owns the terminal.
    console.error(err);
    process.exit(1);
  };
  process.on('exit', onExit);
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
  process.on('uncaughtException', onUncaughtException);
  return () => {
    process.removeListener('exit', onExit);
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
    process.removeListener('uncaughtException', onUncaughtException);
  };
}
