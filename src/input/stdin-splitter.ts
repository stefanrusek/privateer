/**
 * Raw stdin chunk splitter (P9R-0014, Spec 01 §3.5).
 *
 * Ink's own key parser (`parseKeypress`) classifies a whole raw stdin read as
 * a *single* key: it matches the first escape sequence (or plain char) it
 * finds in the chunk and silently discards everything after it. Terminals
 * routinely deliver several complete key presses in one OS-level read —
 * held-key auto-repeat, or a burst of queued input flushed at once — so a
 * chunk like `\x1b[B\x1b[B\x1b[B` (three Downs) reaches Ink as ONE `down`
 * keypress, losing the other two. This module splits a raw chunk into its
 * constituent complete key/escape sequences so each can be delivered to Ink
 * as its own read (see `src/adapters/live/stdin-splitter-bridge.ts`, which
 * patches `stdin.read()` to drain one sequence at a time).
 *
 * A chunk can also end mid-sequence (e.g. `\x1b[` with the terminating
 * letter arriving in the *next* OS read) — `StdinSequenceSplitter` carries
 * that partial tail forward and completes it once more data arrives, or
 * flushes it as-is after a short timeout if nothing else arrives (a bare
 * Escape keypress never produces more bytes).
 */

import type { Clock, CancelHandle } from '../boundaries/clock.js';

// ---------------------------------------------------------------------------
// Pure chunk splitting
// ---------------------------------------------------------------------------

/**
 * Length of one complete input unit starting at `pos` in `chunk`, or `null`
 * if the chunk ends before the unit is complete (more bytes are needed).
 *
 * Every non-ESC byte is its own one-character unit (plain chars, Ctrl combos,
 * CR/LF/TAB/DEL — matches the single-char classification in
 * `src/input/keyboard.ts`). ESC-led sequences use the standard ANSI escape
 * grammar: CSI (`ESC [ params* intermediates* final`, final byte 0x40–0x7E —
 * this covers arrows, Shift+Tab, and SGR mouse reports alike) and SS3
 * (`ESC O <letter>`, e.g. F1–F4). A bare ESC not followed by `[` or `O` is its
 * own one-character unit (matches `parseOneKey`'s bare-ESC handling).
 */
function sequenceLength(chunk: string, pos: number): number | null {
  if (chunk[pos] !== '\x1b') {
    return 1;
  }
  // Lone ESC at the very end of the chunk — could be a standalone Escape
  // keypress or the start of a longer sequence; the caller must wait.
  if (pos + 1 >= chunk.length) {
    return null;
  }
  const next = chunk[pos + 1];
  if (next === 'O') {
    // SS3: ESC O <letter> — need the letter.
    if (pos + 2 >= chunk.length) {
      return null;
    }
    return 3;
  }
  if (next !== '[') {
    // Meta+key or unrecognized — ESC stands alone; `next` starts the next
    // unit on the following call.
    return 1;
  }
  // CSI: ESC [ <params 0x30-0x3F>* <intermediates 0x20-0x2F>* <final 0x40-0x7E>
  for (let i = pos + 2; i < chunk.length; i++) {
    const code = chunk.charCodeAt(i);
    if (code >= 0x40 && code <= 0x7e) {
      return i - pos + 1;
    }
  }
  return null; // final byte not seen yet — incomplete
}

/** The result of splitting one buffered string into complete units. */
export interface SplitResult {
  /** Complete key/escape sequences found, in order. */
  readonly pieces: readonly string[];
  /** A trailing incomplete sequence, held back for the next chunk. */
  readonly remainder: string;
}

/**
 * Split `buffered` into every complete key/escape sequence it contains, plus
 * any incomplete trailing sequence. Pure — no I/O, no timing.
 */
export function splitStdinChunk(buffered: string): SplitResult {
  const pieces: string[] = [];
  let i = 0;
  while (i < buffered.length) {
    const len = sequenceLength(buffered, i);
    if (len === null) {
      return { pieces, remainder: buffered.slice(i) };
    }
    pieces.push(buffered.slice(i, i + len));
    i += len;
  }
  return { pieces, remainder: '' };
}

// ---------------------------------------------------------------------------
// Stateful splitter (carries a partial tail across chunk boundaries)
// ---------------------------------------------------------------------------

/** How long to wait for a truncated sequence's remaining bytes before giving
 * up and flushing it as-is (e.g. a genuine standalone Escape keypress). */
const FLUSH_TIMEOUT_MS = 50;

/**
 * Feeds raw stdin chunks in, emits complete key/escape sequences out — one
 * `emit` call per sequence, in order, even when several arrive in one chunk
 * or a sequence is split across chunk boundaries.
 */
export class StdinSequenceSplitter {
  private pending = '';
  private cancelFlush: CancelHandle | null = null;

  constructor(
    private readonly clock: Clock,
    private readonly emit: (piece: string) => void,
  ) {}

  /** Feed one raw stdin read. */
  push(data: string): void {
    this.cancelPendingFlush();
    const { pieces, remainder } = splitStdinChunk(this.pending + data);
    this.pending = remainder;
    for (const piece of pieces) {
      this.emit(piece);
    }
    if (this.pending !== '') {
      this.scheduleFlush();
    }
  }

  private scheduleFlush(): void {
    this.cancelFlush = this.clock.setTimeout(() => {
      this.cancelFlush = null;
      const leftover = this.pending;
      this.pending = '';
      if (leftover !== '') {
        this.emit(leftover);
      }
    }, FLUSH_TIMEOUT_MS);
  }

  private cancelPendingFlush(): void {
    if (this.cancelFlush !== null) {
      this.cancelFlush();
      this.cancelFlush = null;
    }
  }
}
