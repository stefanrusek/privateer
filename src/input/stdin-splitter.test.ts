import { describe, it, expect } from 'vitest';
import { FakeClock } from '../boundaries/clock.fake.js';
import { splitStdinChunk, StdinSequenceSplitter } from './stdin-splitter.js';

const DOWN = '\x1b[B';
const UP = '\x1b[A';
const LEFT = '\x1b[D';
const RIGHT = '\x1b[C';
const SHIFT_TAB = '\x1b[Z';
const MOUSE_DOWN = '\x1b[<0;60;24M';
const MOUSE_UP = '\x1b[<0;60;24m';

describe('splitStdinChunk', () => {
  it('splits a chunk containing multiple complete arrow sequences', () => {
    const { pieces, remainder } = splitStdinChunk(DOWN.repeat(7));
    expect(pieces).toEqual(Array(7).fill(DOWN));
    expect(remainder).toBe('');
  });

  it('splits 17 rapid Downs losslessly (regression: 17 moved only 13)', () => {
    const { pieces } = splitStdinChunk(DOWN.repeat(17));
    expect(pieces).toHaveLength(17);
  });

  it('splits a mixed chunk of arrows and plain chars in order', () => {
    const { pieces } = splitStdinChunk(`${DOWN}${DOWN}j${DOWN}`);
    expect(pieces).toEqual([DOWN, DOWN, 'j', DOWN]);
  });

  it('splits distinct arrow directions in order', () => {
    const { pieces } = splitStdinChunk(`${UP}${LEFT}${RIGHT}${DOWN}`);
    expect(pieces).toEqual([UP, LEFT, RIGHT, DOWN]);
  });

  it('splits Shift+Tab sequences', () => {
    const { pieces } = splitStdinChunk(SHIFT_TAB.repeat(3));
    expect(pieces).toEqual([SHIFT_TAB, SHIFT_TAB, SHIFT_TAB]);
  });

  it('keeps an SGR mouse report intact as one unit', () => {
    const { pieces } = splitStdinChunk(`${MOUSE_DOWN}${MOUSE_UP}`);
    expect(pieces).toEqual([MOUSE_DOWN, MOUSE_UP]);
  });

  it('splits a chunk mixing keys and mouse reports', () => {
    const { pieces } = splitStdinChunk(`${DOWN}${MOUSE_DOWN}${DOWN}`);
    expect(pieces).toEqual([DOWN, MOUSE_DOWN, DOWN]);
  });

  it('returns a plain single character chunk as one piece', () => {
    const { pieces, remainder } = splitStdinChunk('j');
    expect(pieces).toEqual(['j']);
    expect(remainder).toBe('');
  });

  it('splits a run of plain characters into individual pieces', () => {
    const { pieces } = splitStdinChunk('jj');
    expect(pieces).toEqual(['j', 'j']);
  });

  it('treats a bare ESC not followed by [ or O as its own unit', () => {
    const { pieces } = splitStdinChunk('\x1bq');
    expect(pieces).toEqual(['\x1b', 'q']);
  });

  it('holds a chunk ending in a bare ESC as an incomplete remainder', () => {
    const { pieces, remainder } = splitStdinChunk(`${DOWN}\x1b`);
    expect(pieces).toEqual([DOWN]);
    expect(remainder).toBe('\x1b');
  });

  it('holds a chunk ending mid-CSI-sequence as an incomplete remainder', () => {
    const { pieces, remainder } = splitStdinChunk(`${DOWN}\x1b[`);
    expect(pieces).toEqual([DOWN]);
    expect(remainder).toBe('\x1b[');
  });

  it('holds a chunk ending mid-SS3-sequence as an incomplete remainder', () => {
    const { pieces, remainder } = splitStdinChunk('\x1bO');
    expect(pieces).toEqual([]);
    expect(remainder).toBe('\x1bO');
  });

  it('completes an SS3 sequence once the letter is present', () => {
    const { pieces, remainder } = splitStdinChunk('\x1bOP');
    expect(pieces).toEqual(['\x1bOP']);
    expect(remainder).toBe('');
  });

  it('holds a chunk ending mid CSI-params as an incomplete remainder', () => {
    const { pieces, remainder } = splitStdinChunk('\x1b[<0;60');
    expect(pieces).toEqual([]);
    expect(remainder).toBe('\x1b[<0;60');
  });

  it('returns an empty result for an empty chunk', () => {
    const { pieces, remainder } = splitStdinChunk('');
    expect(pieces).toEqual([]);
    expect(remainder).toBe('');
  });
});

describe('StdinSequenceSplitter', () => {
  function makeSplitter() {
    const clock = new FakeClock();
    const emitted: string[] = [];
    const splitter = new StdinSequenceSplitter(clock, (piece) => {
      emitted.push(piece);
    });
    return { clock, emitted, splitter };
  }

  it('emits every sequence from a single chunk carrying several', () => {
    const { splitter, emitted } = makeSplitter();
    splitter.push(DOWN.repeat(5));
    expect(emitted).toEqual(Array(5).fill(DOWN));
  });

  it('completes a sequence split across two chunks', () => {
    const { splitter, emitted } = makeSplitter();
    splitter.push('\x1b[');
    expect(emitted).toEqual([]);
    splitter.push('B');
    expect(emitted).toEqual([DOWN]);
  });

  it('completes a sequence split across two chunks and continues with more input', () => {
    const { splitter, emitted } = makeSplitter();
    splitter.push(`${DOWN}\x1b`);
    expect(emitted).toEqual([DOWN]);
    splitter.push(`[B${DOWN}`);
    expect(emitted).toEqual([DOWN, DOWN, DOWN]);
  });

  it('flushes a genuinely standalone ESC after the timeout with no more data', () => {
    const { splitter, emitted, clock } = makeSplitter();
    splitter.push('\x1b');
    expect(emitted).toEqual([]);
    clock.advance(50);
    expect(emitted).toEqual(['\x1b']);
  });

  it('does not flush early when more data completes the sequence in time', () => {
    const { splitter, emitted, clock } = makeSplitter();
    splitter.push('\x1b[');
    clock.advance(10);
    splitter.push('A');
    clock.advance(50);
    // Only the completed sequence should have been emitted once, not a
    // stray flush of a leftover fragment.
    expect(emitted).toEqual([UP]);
  });

  it('cancels a pending flush timer once the sequence completes', () => {
    const { splitter, clock } = makeSplitter();
    splitter.push('\x1b[');
    expect(clock.pendingCount()).toBe(1);
    splitter.push('B');
    expect(clock.pendingCount()).toBe(0);
  });
});
