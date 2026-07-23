// Stdin sequence-splitting bridge (coverage-excluded glue, P9R-0014).
//
// Ink drains keyboard input with a synchronous
// `while ((chunk = stdin.read()) !== null)` loop (see
// node_modules/ink/build/components/App.js), handing each `read()` result to
// its own parser, which recognizes only the FIRST key/escape sequence in
// that chunk and silently drops the rest. A terminal that delivers several
// complete keypresses in one OS-level read (held-key auto-repeat, or a burst
// of queued input flushed together) therefore loses every sequence after the
// first.
//
// The fix doesn't touch Ink or the controller: it patches `stdin.read` so
// each call returns exactly one complete key/escape sequence — pulled from a
// queue fed by the pure `StdinSequenceSplitter` (src/input/stdin-splitter.ts)
// — instead of Node's already-concatenated raw chunk. Ink's `while` loop then
// naturally calls `read()` once per sequence, so every keypress reaches the
// controller in order.

import { StdinSequenceSplitter } from '../../input/stdin-splitter.js';
import { SystemClock } from '../system.adapter.js';

let installed = false;

/**
 * Patch `stdin.read()` to hand Ink one complete key/escape sequence per call.
 * Idempotent — safe to call more than once (e.g. across chooser → live-app
 * transitions in the same process).
 */
export function installStdinSequenceSplitter(stdin: NodeJS.ReadStream): void {
  if (installed) {
    return;
  }
  installed = true;

  const queue: string[] = [];
  const splitter = new StdinSequenceSplitter(new SystemClock(), (piece) => {
    queue.push(piece);
  });
  const originalRead = stdin.read.bind(stdin);

  stdin.read = (size?: number): unknown => {
    // Only re-chunk the argument-less reads Ink performs; pass any sized
    // read straight through untouched.
    if (size !== undefined) {
      return originalRead(size);
    }
    if (queue.length > 0) {
      return queue.shift() ?? null;
    }
    const chunk: unknown = originalRead();
    if (typeof chunk !== 'string' || chunk === '') {
      return chunk ?? null;
    }
    splitter.push(chunk);
    return queue.length > 0 ? (queue.shift() ?? null) : null;
  };
}
