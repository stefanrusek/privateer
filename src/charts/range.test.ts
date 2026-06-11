/**
 * Unit tests for range selector model (Spec 06 §4.1).
 * 100% branch coverage.
 */

import { describe, it, expect } from 'vitest';
import {
  createRangeSelector,
  selectRange,
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
