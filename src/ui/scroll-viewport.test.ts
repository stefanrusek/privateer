import { describe, it, expect } from 'vitest';
import {
  type ScrollState,
  type ViewLine,
  clampOffset,
  visibleSlice,
  scrollBy,
  pageBy,
  toTop,
  toBottom,
  scrollbar,
  atBottom,
  maxOffset,
  resetOffset,
  logsLiveAfterScroll,
} from './scroll-viewport.js';

// A tall synthetic content list: 10 lines.
const lines: ViewLine[] = Array.from({ length: 10 }, (_, i) => ({
  text: `line-${String(i)}`,
}));

function st(offset: number): ScrollState {
  return { offset };
}

describe('maxOffset', () => {
  it('is content beyond the viewport', () => {
    expect(maxOffset(10, 4)).toBe(6);
  });

  it('is zero when content fits', () => {
    expect(maxOffset(4, 4)).toBe(0);
    expect(maxOffset(3, 4)).toBe(0);
  });

  it('is zero for empty content', () => {
    expect(maxOffset(0, 4)).toBe(0);
  });

  it('treats a non-positive viewport as showing nothing scrollable past total', () => {
    // viewportHeight <= 0 → every line is "below the fold"; clamp keeps it sane.
    expect(maxOffset(10, 0)).toBe(10);
    expect(maxOffset(10, -3)).toBe(10);
  });
});

describe('clampOffset', () => {
  it('keeps an in-range offset', () => {
    expect(clampOffset(3, 10, 4)).toBe(3);
  });

  it('floors a negative offset at zero', () => {
    expect(clampOffset(-5, 10, 4)).toBe(0);
  });

  it('caps an over-large offset at maxOffset', () => {
    expect(clampOffset(99, 10, 4)).toBe(6);
  });

  it('clamps to zero when content fits', () => {
    expect(clampOffset(2, 3, 4)).toBe(0);
  });
});

describe('visibleSlice', () => {
  it('returns the window starting at the offset', () => {
    const slice = visibleSlice(lines, 2, 3);
    expect(slice.map((l) => l.text)).toEqual(['line-2', 'line-3', 'line-4']);
  });

  it('clamps the offset before slicing (over-large)', () => {
    const slice = visibleSlice(lines, 99, 3);
    expect(slice.map((l) => l.text)).toEqual(['line-7', 'line-8', 'line-9']);
  });

  it('clamps a negative offset to the top', () => {
    const slice = visibleSlice(lines, -4, 2);
    expect(slice.map((l) => l.text)).toEqual(['line-0', 'line-1']);
  });

  it('returns everything when content fits', () => {
    const short: ViewLine[] = [{ text: 'a' }, { text: 'b' }];
    expect(visibleSlice(short, 0, 5).map((l) => l.text)).toEqual(['a', 'b']);
  });

  it('returns nothing for a non-positive viewport', () => {
    expect(visibleSlice(lines, 0, 0)).toEqual([]);
    expect(visibleSlice(lines, 0, -2)).toEqual([]);
  });
});

describe('scrollBy', () => {
  it('moves the offset by a positive delta (down)', () => {
    expect(scrollBy(st(2), 1, 10, 4)).toEqual({ offset: 3 });
  });

  it('moves the offset by a negative delta (up)', () => {
    expect(scrollBy(st(2), -1, 10, 4)).toEqual({ offset: 1 });
  });

  it('clamps at the bottom', () => {
    expect(scrollBy(st(5), 10, 10, 4)).toEqual({ offset: 6 });
  });

  it('clamps at the top', () => {
    expect(scrollBy(st(2), -10, 10, 4)).toEqual({ offset: 0 });
  });

  it('moves by N for a wheel delta', () => {
    expect(scrollBy(st(0), 3, 10, 4)).toEqual({ offset: 3 });
  });
});

describe('pageBy', () => {
  it('pages down by viewportHeight - 1 (overlap of one line)', () => {
    // viewport 4 → page step 3.
    expect(pageBy(st(0), 'down', 20, 4)).toEqual({ offset: 3 });
  });

  it('pages up by viewportHeight - 1', () => {
    expect(pageBy(st(6), 'up', 20, 4)).toEqual({ offset: 3 });
  });

  it('never steps by less than one line for a tiny viewport', () => {
    expect(pageBy(st(0), 'down', 20, 1)).toEqual({ offset: 1 });
  });

  it('clamps at the bottom', () => {
    expect(pageBy(st(0), 'down', 6, 4)).toEqual({ offset: 2 });
  });
});

describe('toTop / toBottom', () => {
  it('toTop is offset 0', () => {
    expect(toTop()).toEqual({ offset: 0 });
  });

  it('toBottom is maxOffset', () => {
    expect(toBottom(10, 4)).toEqual({ offset: 6 });
  });

  it('toBottom is 0 when content fits', () => {
    expect(toBottom(3, 4)).toEqual({ offset: 0 });
  });
});

describe('atBottom', () => {
  it('is true at maxOffset', () => {
    expect(atBottom(6, 10, 4)).toBe(true);
  });

  it('is true past maxOffset (over-clamp tolerated)', () => {
    expect(atBottom(99, 10, 4)).toBe(true);
  });

  it('is false before the bottom', () => {
    expect(atBottom(5, 10, 4)).toBe(false);
  });

  it('is true when content fits', () => {
    expect(atBottom(0, 3, 4)).toBe(true);
  });
});

describe('scrollbar', () => {
  it('is null when content fits the viewport', () => {
    expect(scrollbar(0, 4, 4)).toBeNull();
    expect(scrollbar(0, 3, 4)).toBeNull();
  });

  it('is null for a non-positive viewport', () => {
    expect(scrollbar(0, 10, 0)).toBeNull();
  });

  it('places the thumb at the top when offset is 0', () => {
    const bar = scrollbar(0, 20, 5);
    expect(bar).not.toBeNull();
    expect(bar?.thumbStart).toBe(0);
  });

  it('places the thumb at the bottom when fully scrolled', () => {
    const bar = scrollbar(maxOffset(20, 5), 20, 5);
    expect(bar).not.toBeNull();
    // thumb's last row touches the gutter's last row.
    expect((bar?.thumbStart ?? 0) + (bar?.thumbSize ?? 0)).toBe(5);
  });

  it('keeps the thumb at least one row tall', () => {
    const bar = scrollbar(0, 10_000, 5);
    expect(bar?.thumbSize).toBeGreaterThanOrEqual(1);
  });

  it('keeps the thumb within the gutter', () => {
    const bar = scrollbar(7, 20, 5);
    expect(bar).not.toBeNull();
    const start = bar?.thumbStart ?? 0;
    const size = bar?.thumbSize ?? 0;
    expect(start).toBeGreaterThanOrEqual(0);
    expect(start + size).toBeLessThanOrEqual(5);
  });
});

describe('resetOffset', () => {
  it('resets to top for a non-logs tab', () => {
    expect(resetOffset(false, 10, 4)).toEqual({ offset: 0 });
  });

  it('resets to the bottom for the logs tab', () => {
    expect(resetOffset(true, 10, 4)).toEqual({ offset: 6 });
  });
});

describe('logsLiveAfterScroll', () => {
  it('stays live when the new offset is at the bottom', () => {
    expect(logsLiveAfterScroll({ offset: 6 }, 10, 4)).toBe(true);
  });

  it('pauses when scrolled up off the bottom', () => {
    expect(logsLiveAfterScroll({ offset: 3 }, 10, 4)).toBe(false);
  });

  it('is live when content fits (always at bottom)', () => {
    expect(logsLiveAfterScroll({ offset: 0 }, 3, 4)).toBe(true);
  });
});
