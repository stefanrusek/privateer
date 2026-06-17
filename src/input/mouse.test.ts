import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  parseSgrMouse,
  parseSgrMouseChunk,
  isLeakedMouseInput,
  MOUSE_ENABLE,
  MOUSE_DISABLE,
  suspendMouse,
  resumeMouse,
} from './mouse.js';

describe('parseSgrMouse', () => {
  describe('button press events (final=M)', () => {
    it('parses a left button down event', () => {
      const evt = parseSgrMouse('\x1b[<0;10;5M');
      expect(evt).not.toBeNull();
      expect(evt?.type).toBe('down');
      expect(evt?.button).toBe(0);
      expect(evt?.x).toBe(10);
      expect(evt?.y).toBe(5);
    });

    it('parses a middle button down event', () => {
      const evt = parseSgrMouse('\x1b[<1;3;7M');
      expect(evt?.type).toBe('down');
      expect(evt?.button).toBe(1);
    });

    it('parses a right button down event', () => {
      const evt = parseSgrMouse('\x1b[<2;1;1M');
      expect(evt?.type).toBe('down');
      expect(evt?.button).toBe(2);
    });
  });

  describe('button release events (final=m)', () => {
    it('parses a left button release', () => {
      const evt = parseSgrMouse('\x1b[<0;10;5m');
      expect(evt?.type).toBe('up');
      expect(evt?.button).toBe(0);
      expect(evt?.x).toBe(10);
      expect(evt?.y).toBe(5);
    });

    it('parses a right button release', () => {
      const evt = parseSgrMouse('\x1b[<2;20;15m');
      expect(evt?.type).toBe('up');
      expect(evt?.button).toBe(2);
    });
  });

  describe('motion events', () => {
    it('parses a move event (motion bit set, button=3 = no button held)', () => {
      // Cb = 32 (motion bit) | 3 (no button) = 35
      const evt = parseSgrMouse('\x1b[<35;20;15M');
      expect(evt?.type).toBe('move');
      expect(evt?.x).toBe(20);
      expect(evt?.y).toBe(15);
    });

    it('parses a drag event (motion bit set, left button held)', () => {
      // Cb = 32 (motion bit) | 0 (left button) = 32
      const evt = parseSgrMouse('\x1b[<32;20;15M');
      expect(evt?.type).toBe('drag');
      expect(evt?.button).toBe(0);
    });

    it('parses a drag event with middle button held', () => {
      // Cb = 32 | 1 = 33
      const evt = parseSgrMouse('\x1b[<33;5;5M');
      expect(evt?.type).toBe('drag');
      expect(evt?.button).toBe(1);
    });

    it('parses a drag event with right button held', () => {
      // Cb = 32 | 2 = 34
      const evt = parseSgrMouse('\x1b[<34;5;5M');
      expect(evt?.type).toBe('drag');
      expect(evt?.button).toBe(2);
    });
  });

  describe('scroll events', () => {
    it('parses a scroll up event', () => {
      // Cb = 64 (wheel bit) | 0 = 64
      const evt = parseSgrMouse('\x1b[<64;5;5M');
      expect(evt?.type).toBe('scrollUp');
    });

    it('parses a scroll down event', () => {
      // Cb = 64 | 1 = 65
      const evt = parseSgrMouse('\x1b[<65;5;5M');
      expect(evt?.type).toBe('scrollDown');
    });
  });

  describe('modifier bits', () => {
    it('decodes shift modifier (bit 2 = 4)', () => {
      // Cb = 0 | 4 = 4
      const evt = parseSgrMouse('\x1b[<4;10;5M');
      expect(evt?.shift).toBe(true);
      expect(evt?.meta).toBe(false);
      expect(evt?.ctrl).toBe(false);
    });

    it('decodes meta/alt modifier (bit 3 = 8)', () => {
      // Cb = 0 | 8 = 8
      const evt = parseSgrMouse('\x1b[<8;10;5M');
      expect(evt?.meta).toBe(true);
      expect(evt?.shift).toBe(false);
      expect(evt?.ctrl).toBe(false);
    });

    it('decodes ctrl modifier (bit 4 = 16)', () => {
      // Cb = 0 | 16 = 16
      const evt = parseSgrMouse('\x1b[<16;10;5M');
      expect(evt?.ctrl).toBe(true);
      expect(evt?.shift).toBe(false);
      expect(evt?.meta).toBe(false);
    });

    it('decodes combined modifiers', () => {
      // Cb = 0 | 4 | 8 | 16 = 28
      const evt = parseSgrMouse('\x1b[<28;1;1M');
      expect(evt?.shift).toBe(true);
      expect(evt?.meta).toBe(true);
      expect(evt?.ctrl).toBe(true);
    });
  });

  describe('malformed sequences', () => {
    it('returns null for empty string', () => {
      expect(parseSgrMouse('')).toBeNull();
    });

    it('returns null for plain text', () => {
      expect(parseSgrMouse('hello')).toBeNull();
    });

    it('returns null for incomplete sequence', () => {
      expect(parseSgrMouse('\x1b[<0;10')).toBeNull();
    });

    it('returns null for wrong prefix', () => {
      expect(parseSgrMouse('\x1b[0;10;5M')).toBeNull();
    });

    it('returns null for missing final byte', () => {
      expect(parseSgrMouse('\x1b[<0;10;5')).toBeNull();
    });

    it('returns null for wrong final byte', () => {
      expect(parseSgrMouse('\x1b[<0;10;5X')).toBeNull();
    });

    it('returns null for non-numeric cb', () => {
      expect(parseSgrMouse('\x1b[<a;10;5M')).toBeNull();
    });
  });

  describe('property-based round-trip', () => {
    it('round-trips valid (button, x, y, final) tuples', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 127 }), // Cb
          fc.integer({ min: 1, max: 500 }), // x
          fc.integer({ min: 1, max: 500 }), // y
          fc.constantFrom('M' as const, 'm' as const),
          (cb, x, y, final) => {
            const seq = `\x1b[<${cb.toString()};${x.toString()};${y.toString()}${final}`;
            const evt = parseSgrMouse(seq);
            expect(evt).not.toBeNull();
            expect(evt?.x).toBe(x);
            expect(evt?.y).toBe(y);
          },
        ),
      );
    });

    it('rejects non-SGR strings', () => {
      fc.assert(
        fc.property(
          fc
            .string({ minLength: 1 })
            .filter(
              (s) =>
                !new RegExp(
                  `^${String.fromCodePoint(0x1b)}\\[<\\d+;\\d+;\\d+[Mm]$`,
                ).test(s),
            ),
          (s) => {
            expect(parseSgrMouse(s)).toBeNull();
          },
        ),
      );
    });
  });
});

describe('parseSgrMouseChunk', () => {
  it('parses a single report in a chunk', () => {
    const events = parseSgrMouseChunk('\x1b[<0;10;5M');
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('down');
    expect(events[0]?.x).toBe(10);
  });

  it('parses multiple reports coalesced into one chunk (in order)', () => {
    // Terminals deliver rapid drags as one read; all must be extracted in order.
    const chunk = '\x1b[<32;10;5M\x1b[<32;11;6M\x1b[<0;11;6m';
    const events = parseSgrMouseChunk(chunk);
    expect(events.map((e) => e.type)).toEqual(['drag', 'drag', 'up']);
    expect(events[0]?.x).toBe(10);
    expect(events[1]?.x).toBe(11);
    expect(events[2]?.type).toBe('up');
  });

  it('ignores interleaved non-mouse bytes', () => {
    const chunk = 'noise\x1b[<0;3;4Mmore\x1b[<64;3;4Mtrailing';
    const events = parseSgrMouseChunk(chunk);
    expect(events.map((e) => e.type)).toEqual(['down', 'scrollUp']);
  });

  it('returns an empty array when the chunk has no mouse reports', () => {
    expect(parseSgrMouseChunk('just plain text\x1b[2J')).toEqual([]);
  });
});

describe('protocol strings (mouse mode lifecycle)', () => {
  it('MOUSE_ENABLE turns on click (1000h), button-motion (1002h), SGR (1006h)', () => {
    expect(MOUSE_ENABLE).toContain('\x1b[?1000h');
    expect(MOUSE_ENABLE).toContain('\x1b[?1002h');
    expect(MOUSE_ENABLE).toContain('\x1b[?1006h');
  });

  it('MOUSE_ENABLE does NOT turn on any-motion (1003h)', () => {
    // 1003h floods the stream and leaks on unclean exits (CLAUDE.md gotcha).
    expect(MOUSE_ENABLE).not.toContain('\x1b[?1003h');
  });

  it('MOUSE_DISABLE turns off every mouse mode (1000/1002/1003/1006/1015)', () => {
    expect(MOUSE_DISABLE).toContain('\x1b[?1000l');
    expect(MOUSE_DISABLE).toContain('\x1b[?1002l');
    expect(MOUSE_DISABLE).toContain('\x1b[?1003l');
    expect(MOUSE_DISABLE).toContain('\x1b[?1006l');
    expect(MOUSE_DISABLE).toContain('\x1b[?1015l');
  });

  it('MOUSE_DISABLE never re-enables a mode (no "h" toggles)', () => {
    expect(MOUSE_DISABLE).not.toMatch(/h/);
  });
});

describe('suspendMouse / resumeMouse', () => {
  it('suspendMouse writes MOUSE_DISABLE to the writer', () => {
    const written: string[] = [];
    suspendMouse((s) => written.push(s));
    expect(written).toEqual([MOUSE_DISABLE]);
  });

  it('resumeMouse writes MOUSE_ENABLE to the writer', () => {
    const written: string[] = [];
    resumeMouse((s) => written.push(s));
    expect(written).toEqual([MOUSE_ENABLE]);
  });
});

describe('isLeakedMouseInput', () => {
  it('drops a full bare SGR press body Ink delivers without the ESC', () => {
    // Ink strips the leading ESC; the click would otherwise be split into
    // chars and its digits misread as 1–6 tab jumps (B3a).
    expect(isLeakedMouseInput('[<0;60;24M')).toBe(true);
    expect(isLeakedMouseInput('[<0;60;24m')).toBe(true);
    expect(isLeakedMouseInput('[<35;1;1M')).toBe(true);
  });

  it('drops the lone introducer fragments Ink can split a read into', () => {
    expect(isLeakedMouseInput('[')).toBe(true);
    expect(isLeakedMouseInput('[<')).toBe(true);
    expect(isLeakedMouseInput('[<0')).toBe(true);
    expect(isLeakedMouseInput('[<0;60')).toBe(true);
  });

  it('keeps ordinary keyboard input', () => {
    for (const key of ['j', 'k', '1', '6', 'q', '/', 'G', 'g', '', 'jj']) {
      expect(isLeakedMouseInput(key)).toBe(false);
    }
  });

  it('keeps non-mouse escape-ish bracket text', () => {
    expect(isLeakedMouseInput('[A')).toBe(false);
    expect(isLeakedMouseInput('[<x;1;1M')).toBe(false);
    expect(isLeakedMouseInput('hello[<0;1;1M')).toBe(false);
  });
});
