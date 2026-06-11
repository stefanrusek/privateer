/**
 * Keyboard input parser, key-sequence buffer, and modal model.
 * Spec 01 §3.5, Spec 02 §8.
 */

import type { Clock, CancelHandle } from '../boundaries/clock.js';

// ---------------------------------------------------------------------------
// Key event
// ---------------------------------------------------------------------------

export type SpecialKey =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'return'
  | 'escape'
  | 'tab'
  | 'backspace'
  | 'delete';

export interface Key {
  /** The key name: a printable character string or a SpecialKey name. */
  key: string;
  ctrl: boolean;
  shift: boolean;
  meta: boolean;
}

// ---------------------------------------------------------------------------
// Raw key parser
// ---------------------------------------------------------------------------

/**
 * Parse a raw stdin chunk into zero or more Key events.
 *
 * The parser handles:
 * - Printable characters (direct)
 * - Ctrl combos (0x01–0x1A, excluding handled ESC/TAB/CR/DEL)
 * - ESC sequences: arrows, Shift+Tab, Escape
 * - CR → return
 * - TAB → tab
 * - DEL (0x7F) → backspace
 */
export function parseKeys(chunk: string): Key[] {
  const results: Key[] = [];
  let i = 0;

  while (i < chunk.length) {
    const advance = parseOneKey(chunk, i, results);
    i += advance;
  }

  return results;
}

/**
 * Parse one key starting at position `pos` in `chunk`. Push the result into
 * `out` and return the number of characters consumed.
 */
function parseOneKey(chunk: string, pos: number, out: Key[]): number {
  // pos is always < chunk.length when called from parseKeys — rest is non-empty
  const rest = chunk.slice(pos);
  const firstCode = rest.charCodeAt(0); // NaN only if rest is empty (never happens here)
  const ch = String.fromCodePoint(firstCode);

  if (ch === '\x1b') {
    // Shift+Tab: ESC [ Z
    if (rest.startsWith('\x1b[Z')) {
      out.push({ key: 'tab', ctrl: false, shift: true, meta: false });
      return 3;
    }

    // CSI sequences: ESC [ <letter> — need at least 3 chars
    if (rest.length >= 3 && rest[1] === '[') {
      const letter = rest[2];
      if (letter === 'A') {
        out.push({ key: 'up', ctrl: false, shift: false, meta: false });
        return 3;
      }
      if (letter === 'B') {
        out.push({ key: 'down', ctrl: false, shift: false, meta: false });
        return 3;
      }
      if (letter === 'C') {
        out.push({ key: 'right', ctrl: false, shift: false, meta: false });
        return 3;
      }
      if (letter === 'D') {
        out.push({ key: 'left', ctrl: false, shift: false, meta: false });
        return 3;
      }
    }

    // Bare ESC (no recognized sequence follows)
    out.push({ key: 'escape', ctrl: false, shift: false, meta: false });
    return 1;
  }

  if (ch === '\r' || ch === '\n') {
    out.push({ key: 'return', ctrl: false, shift: false, meta: false });
    return 1;
  }

  if (ch === '\t') {
    out.push({ key: 'tab', ctrl: false, shift: false, meta: false });
    return 1;
  }

  if (ch === '\x7f') {
    out.push({ key: 'backspace', ctrl: false, shift: false, meta: false });
    return 1;
  }

  // Ctrl combos: 0x01–0x1A (A=1..Z=26), excluding already-handled bytes
  if (firstCode >= 0x01 && firstCode <= 0x1a) {
    const letter = String.fromCodePoint(firstCode + 0x60); // 0x01→'a', 0x02→'b', …
    out.push({ key: letter, ctrl: true, shift: false, meta: false });
    return 1;
  }

  // Printable character
  if (firstCode >= 0x20) {
    out.push({ key: ch, ctrl: false, shift: false, meta: false });
    return 1;
  }

  // Unknown control code — skip
  return 1;
}

// ---------------------------------------------------------------------------
// Sequence registration and buffer
// ---------------------------------------------------------------------------

export type KeySequenceHandler = () => void;
export type KeyHandler = (key: Key) => void;

/** How long (ms) to wait for the second key in a multi-key sequence. */
const SEQUENCE_WINDOW_MS = 500;

interface RegisteredSequence {
  keys: readonly string[];
  handler: KeySequenceHandler;
}

/**
 * Key-sequence buffer that supports multi-key sequences (e.g. `gg`) with a
 * 500ms window. Registered sequences are matched greedily; unmatched buffered
 * keys are flushed individually to the fallback handler.
 */
export class KeySequenceBuffer {
  private sequences: RegisteredSequence[] = [];
  private buffer: Key[] = [];
  private cancelTimeout: CancelHandle | null = null;

  constructor(
    private readonly clock: Clock,
    private readonly onKey: KeyHandler,
  ) {}

  /**
   * Register a multi-key sequence. `keys` must have at least 2 elements.
   * All keys in the sequence are matched by their `key` property only (modifiers
   * are ignored during sequence matching — a sequence is a series of key names).
   */
  registerSequence(keys: readonly string[], handler: KeySequenceHandler): void {
    this.sequences.push({ keys, handler });
  }

  /**
   * Feed a parsed Key event. If the key could start or extend a registered
   * sequence, buffer it and start/reset the 500ms window. Otherwise emit
   * immediately.
   */
  feed(key: Key): void {
    const candidate = [...this.buffer, key];

    if (this.couldExtendSequence(candidate)) {
      // Might be building a sequence — buffer it
      this.buffer = candidate;
      this.resetTimeout();

      // Check if we have a complete match
      const match = this.findCompleteMatch(candidate);
      if (match !== null) {
        this.cancelPendingTimeout();
        this.buffer = [];
        match.handler();
      }
    } else {
      // Can't extend any sequence — flush buffer then emit current key
      this.flush();
      this.onKey(key);
    }
  }

  /** Flush all buffered keys individually and cancel any pending timeout. */
  flush(): void {
    this.cancelPendingTimeout();
    const toFlush = this.buffer;
    this.buffer = [];
    for (const k of toFlush) {
      this.onKey(k);
    }
  }

  private couldExtendSequence(candidate: Key[]): boolean {
    const names = candidate.map((k) => k.key);
    for (const seq of this.sequences) {
      if (names.length <= seq.keys.length) {
        let matches = true;
        for (let i = 0; i < names.length; i++) {
          if (names[i] !== seq.keys[i]) {
            matches = false;
            break;
          }
        }
        if (matches) {
          return true;
        }
      }
    }
    return false;
  }

  private findCompleteMatch(candidate: Key[]): RegisteredSequence | null {
    const names = candidate.map((k) => k.key);
    for (const seq of this.sequences) {
      if (seq.keys.length === names.length) {
        let matches = true;
        for (let i = 0; i < names.length; i++) {
          if (names[i] !== seq.keys[i]) {
            matches = false;
            break;
          }
        }
        if (matches) {
          return seq;
        }
      }
    }
    return null;
  }

  private resetTimeout(): void {
    this.cancelPendingTimeout();
    this.cancelTimeout = this.clock.setTimeout(() => {
      this.cancelTimeout = null;
      this.flush();
    }, SEQUENCE_WINDOW_MS);
  }

  private cancelPendingTimeout(): void {
    if (this.cancelTimeout !== null) {
      this.cancelTimeout();
      this.cancelTimeout = null;
    }
  }
}

// ---------------------------------------------------------------------------
// Modal model
// ---------------------------------------------------------------------------

/** The four input modes from Spec 02 §8.1. */
export type Mode = 'normal' | 'search' | 'command' | 'edit';

/** Simple mode holder. */
export class ModalState {
  private _mode: Mode = 'normal';

  get mode(): Mode {
    return this._mode;
  }

  transition(next: Mode): void {
    this._mode = next;
  }
}
