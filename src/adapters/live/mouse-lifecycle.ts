// Mouse-mode lifecycle (coverage-excluded glue, Spec 01 §3.5 / chunk 04 B04a).
//
// THE critical invariant: mouse reporting modes must be hard-disabled on EVERY
// exit/suspend path (quit, crash, SIGINT/SIGTERM, exec handover, $EDITOR
// pop-out) so escape sequences never leak into the user's shell (CLAUDE.md
// gotcha). All of those paths funnel through the single idempotent
// `tearDownMouse()` here. Re-asserted by chunk 07's suspend path.
//
// The mode strings live in the pure, covered `src/input/mouse.ts`
// (`MOUSE_ENABLE` = 1000h+1002h+1006h, 1003h OFF; `MOUSE_DISABLE` = every mode
// off). This module is the thin stdout/stdin/signal wiring around them.

import { MOUSE_DISABLE, MOUSE_ENABLE } from '../../input/mouse.js';

/** Test seam: where mode strings are written (defaults to the real stdout). */
export type MouseWriter = (s: string) => void;

const defaultWriter: MouseWriter = (s) => {
  process.stdout.write(s);
};

/**
 * Owns the mouse-mode lifecycle for one session. `enable()` turns reporting on;
 * `tearDown()` turns every mode off and is **idempotent** — calling it twice
 * (e.g. React cleanup + a SIGINT handler racing) writes the disable sequence at
 * most once, so a torn-down terminal is never re-poked.
 */
export class MouseLifecycle {
  private enabled = false;
  private tornDown = false;

  constructor(private readonly write: MouseWriter = defaultWriter) {}

  /** Turn on click + button-motion + SGR reporting (1003h stays off). */
  enable(): void {
    // Re-enabling after a teardown (exec handover returns) is allowed.
    this.tornDown = false;
    if (this.enabled) {
      return;
    }
    this.enabled = true;
    this.write(MOUSE_ENABLE);
  }

  /**
   * Hard-disable every mouse mode. Idempotent: a second call after a teardown
   * is a no-op until `enable()` runs again. Safe to call from any exit path.
   */
  tearDown(): void {
    if (this.tornDown) {
      return;
    }
    this.tornDown = true;
    this.enabled = false;
    this.write(MOUSE_DISABLE);
  }
}

/**
 * Register the process-level exit/signal handlers that guarantee teardown on a
 * crash or kill. `process.exit` covers normal and uncaught-exception exits;
 * SIGINT/SIGTERM are caught so a Ctrl-C or kill still restores the terminal
 * before the process dies. Returns a disposer that removes the handlers.
 */
export function installMouseExitGuards(lifecycle: MouseLifecycle): () => void {
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
  process.on('exit', onExit);
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
  return () => {
    process.removeListener('exit', onExit);
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
  };
}
