import { describe, it, expect } from 'vitest';
import type { ColumnDef } from '../resources/columns.js';
import {
  LIST_BASELINE_WIDTH,
  naturalWidths,
  pinnedCount,
  resolveRowWindow,
  clampHOffset,
} from './list-horizontal.js';

// ---------------------------------------------------------------------------
// Helpers — synthetic column definitions (accessors are irrelevant here)
// ---------------------------------------------------------------------------

function col(header: string, width: number | string): ColumnDef {
  return { header, width, accessor: () => '' };
}

const STATUS = col('', 2);
const NAME = col('Name', '30%');

// A representative wide kind: status(2) + Name(30%→36) + four 10-wide cols.
const WIDE: ColumnDef[] = [
  STATUS,
  NAME,
  col('A', 10),
  col('B', 10),
  col('C', 10),
  col('D', 10),
];

// ---------------------------------------------------------------------------
// naturalWidths
// ---------------------------------------------------------------------------

describe('naturalWidths', () => {
  it('passes fixed numeric widths through unchanged', () => {
    expect(naturalWidths([col('A', 10), col('B', 5)])).toEqual([10, 5]);
  });

  it('resolves percentage widths against the default baseline', () => {
    // 30% of 120 = 36, 15% of 120 = 18
    expect(naturalWidths([col('Name', '30%'), col('NS', '15%')])).toEqual([
      36, 18,
    ]);
  });

  it('floors fractional percentage widths', () => {
    // 25% of 120 = 30 exactly; 33% of 120 = 39.6 -> 39
    expect(naturalWidths([col('A', '25%'), col('B', '33%')])).toEqual([30, 39]);
  });

  it('honors a custom baseline', () => {
    expect(naturalWidths([col('Name', '30%')], 200)).toEqual([60]);
  });

  it('depends only on definitions, never on data', () => {
    expect(naturalWidths(WIDE)).toEqual([2, 36, 10, 10, 10, 10]);
  });

  it('LIST_BASELINE_WIDTH is 120', () => {
    expect(LIST_BASELINE_WIDTH).toBe(120);
  });
});

// ---------------------------------------------------------------------------
// pinnedCount
// ---------------------------------------------------------------------------

describe('pinnedCount', () => {
  it('pins the status column and Name (through Name inclusive)', () => {
    expect(pinnedCount(WIDE)).toBe(2);
  });

  it('pins through Name even when Name is not at index 1', () => {
    const cols = [STATUS, col('Other', 5), NAME, col('Z', 5)];
    expect(pinnedCount(cols)).toBe(3);
  });

  it('pins only the status column when there is no Name column', () => {
    const cols = [STATUS, col('A', 5), col('B', 5)];
    expect(pinnedCount(cols)).toBe(1);
  });

  it('pins Name even when there is no status column (Name at index 0)', () => {
    const cols = [col('Name', '35%'), col('NS', '20%'), col('A', 5)];
    expect(pinnedCount(cols)).toBe(1);
  });

  it('pins index 0 only for a single-column table without Name', () => {
    expect(pinnedCount([col('Only', 5)])).toBe(1);
  });

  it('returns 0 for an empty column set', () => {
    expect(pinnedCount([])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// resolveRowWindow
// ---------------------------------------------------------------------------

describe('resolveRowWindow', () => {
  it('shows everything with no markers when content fits the pane', () => {
    const widths = naturalWidths(WIDE); // total 78
    const w = resolveRowWindow(WIDE, widths, 2, 0, 200);
    expect(w.pinned.map((p) => p.col.header)).toEqual(['', 'Name']);
    expect(w.scrollable.map((s) => s.col.header)).toEqual(['A', 'B', 'C', 'D']);
    expect(w.scrollable.every((s) => s.clip === 0)).toBe(true);
    expect(w.leftMore).toBe(false);
    expect(w.rightMore).toBe(false);
  });

  it('always shows the pinned columns at their natural widths', () => {
    const widths = naturalWidths(WIDE);
    const w = resolveRowWindow(WIDE, widths, 2, 0, 50);
    expect(w.pinned).toEqual([
      { col: STATUS, width: 2 },
      { col: NAME, width: 36 },
    ]);
  });

  it('windows the scrollable columns to the viewport, clipping the last', () => {
    const widths = naturalWidths(WIDE); // pinned 2+36=38
    // pane 60 -> scrollable viewport = 60-38 = 22 -> A(10)+B(10)=20, C shows 2
    // of its 10 cells, so clip (hidden cells) = 8.
    const w = resolveRowWindow(WIDE, widths, 2, 0, 60);
    expect(w.scrollable.map((s) => [s.col.header, s.width, s.clip])).toEqual([
      ['A', 10, 0],
      ['B', 10, 0],
      ['C', 10, 8],
    ]);
    expect(w.leftMore).toBe(false);
    expect(w.rightMore).toBe(true);
  });

  it('advances the window when hOffset increases (later columns visible)', () => {
    const widths = naturalWidths(WIDE);
    // hOffset 1 -> start at B. viewport 22 -> B(10)+C(10), D clipped 2.
    const w = resolveRowWindow(WIDE, widths, 2, 1, 60);
    expect(w.scrollable.map((s) => s.col.header)).toEqual(['B', 'C', 'D']);
    expect(w.leftMore).toBe(true);
    expect(w.rightMore).toBe(true);
  });

  it('reaches the last column flush at the right with no rightMore', () => {
    const widths = naturalWidths(WIDE);
    // hOffset 2 -> start at C. viewport 22 -> C(10)+D(10)=20, nothing more.
    const w = resolveRowWindow(WIDE, widths, 2, 2, 60);
    expect(w.scrollable.map((s) => [s.col.header, s.clip])).toEqual([
      ['C', 0],
      ['D', 0],
    ]);
    expect(w.leftMore).toBe(true);
    expect(w.rightMore).toBe(false);
  });

  it('handles a kind with no scrollable columns (all pinned)', () => {
    const cols = [STATUS, NAME];
    const widths = naturalWidths(cols);
    const w = resolveRowWindow(cols, widths, 2, 0, 100);
    expect(w.scrollable).toEqual([]);
    expect(w.leftMore).toBe(false);
    expect(w.rightMore).toBe(false);
  });

  it('clips the first visible scrollable column when the viewport is tiny', () => {
    const widths = naturalWidths(WIDE);
    // pane 40 -> viewport 40-38 = 2 -> A shows 2 of 10 cells -> clip 8.
    const w = resolveRowWindow(WIDE, widths, 2, 0, 40);
    expect(w.scrollable.map((s) => [s.col.header, s.clip])).toEqual([['A', 8]]);
    expect(w.rightMore).toBe(true);
  });

  it('tolerates a short widths array by treating missing widths as 0', () => {
    // Defensive: a malformed call with fewer widths than columns must not throw.
    const w = resolveRowWindow(WIDE, [2, 36], 2, 0, 60);
    expect(w.pinned.map((p) => p.width)).toEqual([2, 36]);
    // The scrollable columns have width 0 (missing) -> all fit, none clipped.
    expect(w.scrollable.map((s) => s.width)).toEqual([0, 0, 0, 0]);
    expect(w.rightMore).toBe(false);
  });

  it('yields an empty scrollable list when the pane cannot fit the pinned cols', () => {
    const widths = naturalWidths(WIDE);
    // pane 30 < pinned 38 -> viewport clamps to 0, no scrollable columns.
    const w = resolveRowWindow(WIDE, widths, 2, 0, 30);
    expect(w.scrollable).toEqual([]);
    expect(w.rightMore).toBe(true);
    expect(w.leftMore).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// clampHOffset
// ---------------------------------------------------------------------------

describe('clampHOffset', () => {
  it('clamps a negative desired offset to 0', () => {
    const widths = naturalWidths(WIDE);
    expect(clampHOffset(WIDE, widths, 2, 60, -3)).toBe(0);
  });

  it('clamps to the max offset where the last column lands flush', () => {
    const widths = naturalWidths(WIDE);
    // viewport 22: last two cols C+D = 20 fit -> max offset = 2.
    expect(clampHOffset(WIDE, widths, 2, 60, 5)).toBe(2);
  });

  it('passes through a valid in-range offset', () => {
    const widths = naturalWidths(WIDE);
    expect(clampHOffset(WIDE, widths, 2, 60, 1)).toBe(1);
  });

  it('pins offset at 0 when everything fits', () => {
    const widths = naturalWidths(WIDE);
    expect(clampHOffset(WIDE, widths, 2, 200, 3)).toBe(0);
  });

  it('pins offset at 0 when there are no scrollable columns', () => {
    const cols = [STATUS, NAME];
    const widths = naturalWidths(cols);
    expect(clampHOffset(cols, widths, 2, 100, 4)).toBe(0);
  });

  it('allows the maximum offset to reach the final column on a tiny viewport', () => {
    const widths = naturalWidths(WIDE);
    // pane 40 -> viewport 2; each scrollable col is 10 -> only one fits at a
    // time -> max offset = last scrollable index = 3 (D).
    expect(clampHOffset(WIDE, widths, 2, 40, 99)).toBe(3);
  });

  it('clamps to 0 when the pane cannot even fit the pinned columns', () => {
    const widths = naturalWidths(WIDE);
    // viewport clamps to 0 -> no room -> max offset is the last scrollable
    // index so the final column can still be reached.
    expect(clampHOffset(WIDE, widths, 2, 30, 99)).toBe(3);
  });
});
