/**
 * Exec suspend-and-handover orchestrator (Spec 05 §4.3).
 *
 * Flow:
 * 1. Suspend the TTY (mouse off, leave raw mode, restore normal terminal).
 * 2. Wire TTY ↔ ExecSession: tty.onData → session.write, session.onData → tty.write.
 * 3. Forward tty.onResize → session.resize.
 * 4. On session close (clean or drop): print notice if drop, then tty.resume().
 */
import type { Tty } from '../boundaries/tty.js';
import type { ExecSession } from './exec-session.js';

export interface ExecHandoverDeps {
  tty: Tty;
  session: ExecSession;
}

/**
 * Start the exec handover. Returns a teardown function (called automatically
 * on session close, but also exposed for forced cleanup).
 */
export function startExecHandover(deps: ExecHandoverDeps): () => void {
  const { tty, session } = deps;

  // Step 1: Suspend the TUI.
  tty.suspend();

  // Step 2: Wire TTY input → session.
  const offData = tty.onData((chunk) => {
    session.write(chunk);
  });

  // Step 2b: Wire session output → TTY.
  const offSessionData = session.onData((data) => {
    tty.write(data);
  });

  // Step 3: Forward resize events.
  const offResize = tty.onResize((size) => {
    session.resize(size.columns, size.rows);
  });

  // Also send the initial terminal size so the remote PTY starts correctly.
  const initialSize = tty.size();
  session.resize(initialSize.columns, initialSize.rows);

  let torn = false;

  function teardown(): void {
    if (torn) {
      return;
    }
    torn = true;
    offData();
    offSessionData();
    offResize();
    session.close();
    tty.resume();
  }

  // Step 4: Handle session close (clean exit or connection drop).
  session.onClose((reason) => {
    if (reason !== undefined) {
      // Connection drop: print a notice before resuming.
      tty.write(`\r\n[p9r] connection dropped: ${reason}\r\n`);
    }
    teardown();
  });

  return teardown;
}
