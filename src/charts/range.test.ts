/**
 * Unit tests for range selector model (Spec 06 §4.1).
 * 100% branch coverage.
 */

import { describe, it, expect } from 'vitest';
import {
  createRangeSelector,
  selectRange,
  stepRange,
  rangeDurationMs,
  rangeStartMs,
  ALL_RANGES,
  DEFAULT_RANGE,
} from './range.js';

describe('createRangeSelector', () => {
  it('creates model with default 1h range', () => {
    const model = createRangeSelector();
    expect(model.selected).toBe('1h');
  });

  it('includes all five range options', () => {
    const model = createRangeSelector();
    expect(model.options).toEqual(['20m', '1h', '4h', '1d', '2d']);
  });
});

describe('selectRange', () => {
  it('selects 20m', () => {
    const model = selectRange(createRangeSelector(), '20m');
    expect(model.selected).toBe('20m');
  });

  it('selects 1h', () => {
    const model = selectRange(createRangeSelector(), '1h');
    expect(model.selected).toBe('1h');
  });

  it('selects 4h', () => {
    const model = selectRange(createRangeSelector(), '4h');
    expect(model.selected).toBe('4h');
  });

  it('selects 1d', () => {
    const model = selectRange(createRangeSelector(), '1d');
    expect(model.selected).toBe('1d');
  });

  it('selects 2d', () => {
    const model = selectRange(createRangeSelector(), '2d');
    expect(model.selected).toBe('2d');
  });

  it('preserves options array after selection', () => {
    const model = selectRange(createRangeSelector(), '4h');
    expect(model.options).toEqual(['20m', '1h', '4h', '1d', '2d']);
  });

  it('returns unchanged model for invalid label', () => {
    const orig = createRangeSelector();
    // Cast to force invalid input path
    const model = selectRange(orig, '99h' as Parameters<typeof selectRange>[1]);
    expect(model.selected).toBe('1h');
  });
});

describe('rangeDurationMs', () => {
  it('returns 20 minutes in ms for 20m', () => {
    expect(rangeDurationMs('20m')).toBe(20 * 60 * 1000);
  });

  it('returns 1 hour in ms for 1h', () => {
    expect(rangeDurationMs('1h')).toBe(60 * 60 * 1000);
  });

  it('returns 4 hours in ms for 4h', () => {
    expect(rangeDurationMs('4h')).toBe(4 * 60 * 60 * 1000);
  });

  it('returns 24 hours in ms for 1d', () => {
    expect(rangeDurationMs('1d')).toBe(24 * 60 * 60 * 1000);
  });

  it('returns 48 hours in ms for 2d', () => {
    expect(rangeDurationMs('2d')).toBe(2 * 24 * 60 * 60 * 1000);
  });
});

describe('rangeStartMs', () => {
  const NOW = 1_000_000_000;

  it('computes start time for default range', () => {
    const model = createRangeSelector(); // 1h
    const start = rangeStartMs(model, NOW);
    expect(start).toBe(NOW - 60 * 60 * 1000);
  });

  it('computes start time for 20m', () => {
    const model = selectRange(createRangeSelector(), '20m');
    const start = rangeStartMs(model, NOW);
    expect(start).toBe(NOW - 20 * 60 * 1000);
  });
});

describe('ALL_RANGES', () => {
  it('contains exactly 5 ranges in order', () => {
    expect(ALL_RANGES).toEqual(['20m', '1h', '4h', '1d', '2d']);
  });
});

describe('DEFAULT_RANGE', () => {
  it('is 1h', () => {
    expect(DEFAULT_RANGE).toBe('1h');
  });
});

describe('stepRange', () => {
  it("'next' moves to the next (longer) range", () => {
    const m = createRangeSelector(); // 1h
    expect(stepRange(m, 'next').selected).toBe('4h');
  });

  it("'prev' moves to the previous (shorter) range", () => {
    const m = selectRange(createRangeSelector(), '1h');
    expect(stepRange(m, 'prev').selected).toBe('20m');
  });

  it("'prev' clamps at the first range (does not wrap)", () => {
    const m = selectRange(createRangeSelector(), '20m');
    const stepped = stepRange(m, 'prev');
    expect(stepped.selected).toBe('20m');
    expect(stepped).toEqual(m);
  });

  it("'next' clamps at the last range (does not wrap)", () => {
    const m = selectRange(createRangeSelector(), '2d');
    const stepped = stepRange(m, 'next');
    expect(stepped.selected).toBe('2d');
    expect(stepped).toEqual(m);
  });

  it('walks the full ordered list with repeated steps', () => {
    let m = selectRange(createRangeSelector(), '20m');
    const seen = [m.selected];
    for (let i = 0; i < ALL_RANGES.length + 1; i++) {
      m = stepRange(m, 'next');
      seen.push(m.selected);
    }
    // 20m → 1h → 4h → 1d → 2d → 2d (clamped)
    expect(seen).toEqual(['20m', '1h', '4h', '1d', '2d', '2d', '2d']);
  });

  it('re-anchors a selection that is not in options to the first option', () => {
    // idx === -1 → clamp to 0 → the first valid option, validated by selectRange.
    const broken = { selected: '99h', options: ALL_RANGES } as never;
    expect(stepRange(broken, 'next').selected).toBe(ALL_RANGES[0]);
  });

  it('returns the model unchanged when options is empty', () => {
    const empty = { selected: '1h', options: [] } as never;
    expect(stepRange(empty, 'next')).toBe(empty);
    expect(stepRange(empty, 'prev')).toBe(empty);
  });
});
