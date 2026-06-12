import { describe, it, expect } from 'vitest';
import { parseKeys, KeySequenceBuffer, ModalState } from './keyboard.js';
import { FakeClock } from '../boundaries/clock.fake.js';

// ---------------------------------------------------------------------------
// parseKeys
// ---------------------------------------------------------------------------

describe('parseKeys', () => {
  describe('printable characters', () => {
    it('parses a single letter', () => {
      const keys = parseKeys('a');
      expect(keys).toHaveLength(1);
      expect(keys[0]?.key).toBe('a');
      expect(keys[0]?.ctrl).toBe(false);
      expect(keys[0]?.shift).toBe(false);
    });

    it('parses multiple printable characters', () => {
      const keys = parseKeys('abc');
      expect(keys).toHaveLength(3);
      expect(keys.map((k) => k.key)).toEqual(['a', 'b', 'c']);
    });

    it('parses uppercase letters as printable', () => {
      const keys = parseKeys('G');
      expect(keys[0]?.key).toBe('G');
      expect(keys[0]?.ctrl).toBe(false);
    });

    it('parses special printable characters', () => {
      expect(parseKeys('/')[0]?.key).toBe('/');
      expect(parseKeys('?')[0]?.key).toBe('?');
      expect(parseKeys(' ')[0]?.key).toBe(' ');
    });
  });

  describe('arrow keys', () => {
    it('parses up arrow', () => {
      expect(parseKeys('\x1b[A')[0]?.key).toBe('up');
    });

    it('parses down arrow', () => {
      expect(parseKeys('\x1b[B')[0]?.key).toBe('down');
    });

    it('parses right arrow', () => {
      expect(parseKeys('\x1b[C')[0]?.key).toBe('right');
    });

    it('parses left arrow', () => {
      expect(parseKeys('\x1b[D')[0]?.key).toBe('left');
    });

    it('emits no ctrl/shift for arrow keys', () => {
      const key = parseKeys('\x1b[A')[0];
      expect(key?.ctrl).toBe(false);
      expect(key?.shift).toBe(false);
      expect(key?.meta).toBe(false);
    });
  });

  describe('special keys', () => {
    it('parses Enter (CR)', () => {
      expect(parseKeys('\r')[0]?.key).toBe('return');
    });

    it('parses Enter (LF)', () => {
      expect(parseKeys('\n')[0]?.key).toBe('return');
    });

    it('parses Escape (bare ESC)', () => {
      expect(parseKeys('\x1b')[0]?.key).toBe('escape');
    });

    it('parses Tab', () => {
      expect(parseKeys('\t')[0]?.key).toBe('tab');
    });

    it('parses Shift+Tab', () => {
      const key = parseKeys('\x1b[Z')[0];
      expect(key?.key).toBe('tab');
      expect(key?.shift).toBe(true);
    });

    it('parses Backspace (DEL 0x7F)', () => {
      expect(parseKeys('\x7f')[0]?.key).toBe('backspace');
    });
  });

  describe('Ctrl combos', () => {
    it('parses Ctrl+C (0x03)', () => {
      const key = parseKeys('\x03')[0];
      expect(key?.key).toBe('c');
      expect(key?.ctrl).toBe(true);
    });

    it('parses Ctrl+F (0x06)', () => {
      const key = parseKeys('\x06')[0];
      expect(key?.key).toBe('f');
      expect(key?.ctrl).toBe(true);
    });

    it('parses Ctrl+B (0x02)', () => {
      const key = parseKeys('\x02')[0];
      expect(key?.key).toBe('b');
      expect(key?.ctrl).toBe(true);
    });

    it('parses Ctrl+S (0x13)', () => {
      const key = parseKeys('\x13')[0];
      expect(key?.key).toBe('s');
      expect(key?.ctrl).toBe(true);
    });

    it('parses Ctrl+A (0x01)', () => {
      const key = parseKeys('\x01')[0];
      expect(key?.key).toBe('a');
      expect(key?.ctrl).toBe(true);
    });

    it('parses Ctrl+Z (0x1A)', () => {
      const key = parseKeys('\x1a')[0];
      expect(key?.key).toBe('z');
      expect(key?.ctrl).toBe(true);
    });
  });

  describe('unknown control codes', () => {
    it('skips unknown control codes below 0x01', () => {
      // 0x00 is NUL — nothing printable
      const keys = parseKeys('\x00');
      expect(keys).toHaveLength(0);
    });
  });

  describe('mixed input', () => {
    it('parses a mix of printable and special keys', () => {
      const keys = parseKeys('j\x1b[A');
      expect(keys).toHaveLength(2);
      expect(keys[0]?.key).toBe('j');
      expect(keys[1]?.key).toBe('up');
    });
  });
});

// ---------------------------------------------------------------------------
// KeySequenceBuffer
// ---------------------------------------------------------------------------

describe('KeySequenceBuffer', () => {
  function makeBuffer() {
    const clock = new FakeClock();
    const emitted: { key: string; ctrl: boolean }[] = [];
    const sequences: string[] = [];
    const buf = new KeySequenceBuffer(clock, (key) =>
      emitted.push({ key: key.key, ctrl: key.ctrl }),
    );
    buf.registerSequence(['g', 'g'], () => sequences.push('gg'));
    return { clock, emitted, sequences, buf };
  }

  it('emits a non-sequence key immediately', () => {
    const { buf, emitted } = makeBuffer();
    buf.feed({ key: 'j', ctrl: false, shift: false, meta: false });
    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.key).toBe('j');
  });

  it('buffers first key of a sequence without emitting', () => {
    const { buf, emitted } = makeBuffer();
    buf.feed({ key: 'g', ctrl: false, shift: false, meta: false });
    expect(emitted).toHaveLength(0);
  });

  it('fires the gg sequence when second g arrives within 500ms', () => {
    const { buf, emitted, sequences } = makeBuffer();
    buf.feed({ key: 'g', ctrl: false, shift: false, meta: false });
    buf.feed({ key: 'g', ctrl: false, shift: false, meta: false });
    expect(sequences).toHaveLength(1);
    expect(sequences[0]).toBe('gg');
    expect(emitted).toHaveLength(0);
  });

  it('flushes buffered key as single key when timeout expires', () => {
    const { clock, buf, emitted, sequences } = makeBuffer();
    buf.feed({ key: 'g', ctrl: false, shift: false, meta: false });
    clock.advance(500);
    expect(sequences).toHaveLength(0);
    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.key).toBe('g');
  });

  it('does not flush before 500ms have elapsed', () => {
    const { clock, buf, emitted } = makeBuffer();
    buf.feed({ key: 'g', ctrl: false, shift: false, meta: false });
    clock.advance(499);
    expect(emitted).toHaveLength(0);
  });

  it('flushes buffered key and emits the non-matching key when sequence fails', () => {
    const { buf, emitted, sequences } = makeBuffer();
    buf.feed({ key: 'g', ctrl: false, shift: false, meta: false });
    buf.feed({ key: 'j', ctrl: false, shift: false, meta: false });
    expect(sequences).toHaveLength(0);
    expect(emitted).toHaveLength(2);
    expect(emitted[0]?.key).toBe('g');
    expect(emitted[1]?.key).toBe('j');
  });

  it('resets the timeout when second key arrives and re-extends the window', () => {
    // If a 3-key sequence were registered, the second key resets the timer
    const clock = new FakeClock();
    const emitted: string[] = [];
    const sequences: string[] = [];
    const buf = new KeySequenceBuffer(clock, (k) => emitted.push(k.key));
    buf.registerSequence(['g', 'g', 'x'], () => sequences.push('ggx'));
    buf.feed({ key: 'g', ctrl: false, shift: false, meta: false });
    clock.advance(400);
    buf.feed({ key: 'g', ctrl: false, shift: false, meta: false });
    clock.advance(400); // still within 500ms of second key
    expect(emitted).toHaveLength(0); // not yet flushed
    clock.advance(101); // now 501ms since last key
    expect(emitted).toHaveLength(2);
  });

  it('flush() emits all buffered keys immediately', () => {
    const { buf, emitted } = makeBuffer();
    buf.feed({ key: 'g', ctrl: false, shift: false, meta: false });
    buf.flush();
    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.key).toBe('g');
  });

  it('flush() cancels the pending timeout', () => {
    const { clock, buf, emitted } = makeBuffer();
    buf.feed({ key: 'g', ctrl: false, shift: false, meta: false });
    buf.flush();
    clock.advance(1000); // timeout should not fire again
    expect(emitted).toHaveLength(1);
  });

  it('handles multiple separate single-key inputs', () => {
    const { buf, emitted } = makeBuffer();
    buf.feed({ key: 'j', ctrl: false, shift: false, meta: false });
    buf.feed({ key: 'k', ctrl: false, shift: false, meta: false });
    buf.feed({ key: 'l', ctrl: false, shift: false, meta: false });
    expect(emitted).toHaveLength(3);
    expect(emitted.map((e) => e.key)).toEqual(['j', 'k', 'l']);
  });

  it('supports registering multiple sequences', () => {
    const clock = new FakeClock();
    const sequences: string[] = [];
    const buf = new KeySequenceBuffer(clock, () => undefined);
    buf.registerSequence(['g', 'g'], () => sequences.push('gg'));
    buf.registerSequence(['g', 'G'], () => sequences.push('gG'));
    buf.feed({ key: 'g', ctrl: false, shift: false, meta: false });
    buf.feed({ key: 'G', ctrl: false, shift: false, meta: false });
    expect(sequences).toEqual(['gG']);
  });
});

// ---------------------------------------------------------------------------
// ModalState
// ---------------------------------------------------------------------------

describe('ModalState', () => {
  it('starts in normal mode', () => {
    const m = new ModalState();
    expect(m.mode).toBe('normal');
  });

  it('transitions to search mode', () => {
    const m = new ModalState();
    m.transition('search');
    expect(m.mode).toBe('search');
  });

  it('transitions to command mode', () => {
    const m = new ModalState();
    m.transition('command');
    expect(m.mode).toBe('command');
  });

  it('transitions to edit mode', () => {
    const m = new ModalState();
    m.transition('edit');
    expect(m.mode).toBe('edit');
  });

  it('transitions back to normal from any mode', () => {
    const m = new ModalState();
    m.transition('edit');
    m.transition('normal');
    expect(m.mode).toBe('normal');
  });

  it('transitions between non-normal modes', () => {
    const m = new ModalState();
    m.transition('search');
    m.transition('command');
    expect(m.mode).toBe('command');
  });
});
