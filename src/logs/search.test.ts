import { describe, it, expect } from 'vitest';
import {
  emptySearch,
  findMatches,
  runSearch,
  nextMatch,
  prevMatch,
  currentMatchLine,
} from './search.js';

const LINES = [
  'INFO server listening',
  'WARN retry attempt',
  'ERROR connection failed',
  'INFO retry succeeded',
];

describe('emptySearch', () => {
  it('is an inactive search', () => {
    const s = emptySearch();
    expect(s.query).toBe('');
    expect(s.matches).toEqual([]);
    expect(s.current).toBe(-1);
  });
});

describe('findMatches', () => {
  it('returns no matches for an empty query', () => {
    expect(findMatches(LINES, '')).toEqual([]);
  });

  it('finds case-insensitive substring matches', () => {
    expect(findMatches(LINES, 'retry')).toEqual([1, 3]);
  });

  it('matches uppercase query against mixed case lines', () => {
    expect(findMatches(LINES, 'INFO')).toEqual([0, 3]);
  });

  it('returns empty when nothing matches', () => {
    expect(findMatches(LINES, 'zzz')).toEqual([]);
  });

  it('skips undefined holes in a sparse array', () => {
    const sparse: string[] = [];
    sparse[2] = 'has retry';
    expect(findMatches(sparse, 'retry')).toEqual([2]);
  });
});

describe('runSearch', () => {
  it('places the cursor on the first match', () => {
    const s = runSearch(LINES, 'retry');
    expect(s.query).toBe('retry');
    expect(s.matches).toEqual([1, 3]);
    expect(s.current).toBe(0);
  });

  it('yields current -1 when there are no matches', () => {
    const s = runSearch(LINES, 'zzz');
    expect(s.matches).toEqual([]);
    expect(s.current).toBe(-1);
  });
});

describe('nextMatch', () => {
  it('advances to the next match', () => {
    const s = runSearch(LINES, 'retry');
    const n = nextMatch(s);
    expect(n.current).toBe(1);
  });

  it('wraps from last back to first', () => {
    let s = runSearch(LINES, 'retry');
    s = nextMatch(s); // current = 1 (last)
    s = nextMatch(s); // wrap to 0
    expect(s.current).toBe(0);
  });

  it('returns the state unchanged when there are no matches', () => {
    const s = runSearch(LINES, 'zzz');
    expect(nextMatch(s)).toBe(s);
  });
});

describe('prevMatch', () => {
  it('wraps from first back to last', () => {
    const s = runSearch(LINES, 'retry');
    const p = prevMatch(s); // from 0 wrap to 1
    expect(p.current).toBe(1);
  });

  it('moves to the previous match', () => {
    let s = runSearch(LINES, 'retry');
    s = nextMatch(s); // current = 1
    s = prevMatch(s); // back to 0
    expect(s.current).toBe(0);
  });

  it('returns the state unchanged when there are no matches', () => {
    const s = runSearch(LINES, 'zzz');
    expect(prevMatch(s)).toBe(s);
  });
});

describe('currentMatchLine', () => {
  it('returns the source line index of the current match', () => {
    const s = runSearch(LINES, 'retry');
    expect(currentMatchLine(s)).toBe(1);
  });

  it('returns -1 when there is no current match', () => {
    const s = runSearch(LINES, 'zzz');
    expect(currentMatchLine(s)).toBe(-1);
  });

  it('returns -1 when the cursor points past the matches array', () => {
    // Construct an inconsistent state to exercise the `?? -1` fallback.
    const s = { query: 'x', matches: [], current: 5 };
    expect(currentMatchLine(s)).toBe(-1);
  });
});
