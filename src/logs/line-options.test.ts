import { describe, it, expect } from 'vitest';
import {
  LINE_OPTIONS,
  DEFAULT_LINE_OPTION,
  findLineOption,
  streamParamsFor,
} from './line-options.js';

describe('LINE_OPTIONS', () => {
  it('lists all nine picker options in order', () => {
    expect(LINE_OPTIONS.map((o) => o.id)).toEqual([
      'last-100',
      'last-500',
      'last-1000',
      'last-5000',
      'all',
      'since-15m',
      'since-1h',
      'since-6h',
      'since-24h',
    ]);
  });

  it('defaults to last 100 lines', () => {
    expect(DEFAULT_LINE_OPTION).toBe('last-100');
  });
});

describe('findLineOption', () => {
  it('returns the option for a known id', () => {
    expect(findLineOption('last-500')?.label).toBe('Last 500 lines');
    expect(findLineOption('all')?.buttonLabel).toBe('All');
  });
});

describe('streamParamsFor', () => {
  it('maps last-N options to tailLines', () => {
    expect(streamParamsFor('last-100')).toEqual({ tailLines: 100 });
    expect(streamParamsFor('last-500')).toEqual({ tailLines: 500 });
    expect(streamParamsFor('last-1000')).toEqual({ tailLines: 1000 });
    expect(streamParamsFor('last-5000')).toEqual({ tailLines: 5000 });
  });

  it('maps all to empty params', () => {
    expect(streamParamsFor('all')).toEqual({});
  });

  it('maps since options to sinceSeconds', () => {
    expect(streamParamsFor('since-15m')).toEqual({ sinceSeconds: 900 });
    expect(streamParamsFor('since-1h')).toEqual({ sinceSeconds: 3600 });
    expect(streamParamsFor('since-6h')).toEqual({ sinceSeconds: 21_600 });
    expect(streamParamsFor('since-24h')).toEqual({ sinceSeconds: 86_400 });
  });
});
