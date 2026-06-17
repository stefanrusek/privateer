/**
 * list-horizontal.ts — pure horizontal-scroll geometry for the resource list.
 *
 * Spec: `specs/002-navigation-overhaul/05-list-horizontal-scroll.md` (Option A:
 * natural-width horizontal viewport with pinned leading columns). The status
 * dot + `Name` columns are **pinned** and never scroll; the remaining columns
 * form a horizontal window that the list `←/→` keys pan together. Content is
 * clipped to the window, never wrapped or squeezed.
 *
 * Everything here is pure and data-independent: column **natural widths**
 * depend only on the column definitions (and a fixed baseline), never on row
 * content or the live pane width, so the layout never jitters as rows arrive
 * or as the user scrolls vertically. All width/window/clamp arithmetic lives
 * in this 100%-covered module; the controller only stores the offset and calls
 * `clampHOffset`.
 */

import type { ColumnDef } from '../resources/columns.js';

/**
 * The stable absolute pane width that percentage column widths resolve
 * against. Matches the historical `ResourceTable` default `totalWidth` so the
 * natural sizes of `30%`/`15%`/… columns are unchanged from before this chunk.
 */
export const LIST_BASELINE_WIDTH = 120;

/** A column placed in the horizontal window. */
export interface WindowColumn {
  readonly col: ColumnDef;
  /** The column's natural width in columns. */
  readonly width: number;
  /**
   * Columns clipped off the right edge: how many cells of this column's
   * natural width are *not* shown (0 when fully visible). The rendered width is
   * `width - clip`.
   */
  readonly clip: number;
}

/** A pinned column — always fully shown at its natural width. */
export interface PinnedColumn {
  readonly col: ColumnDef;
  readonly width: number;
}

export interface RowWindow {
  /** Leading pinned columns (status dot + Name) — always fully shown. */
  readonly pinned: PinnedColumn[];
  /** Visible scrollable columns; the last one may be clipped at the right. */
  readonly scrollable: WindowColumn[];
  /** True when scrollable columns are hidden to the left of the window. */
  readonly leftMore: boolean;
  /** True when scrollable columns/content are hidden to the right. */
  readonly rightMore: boolean;
}

/**
 * Resolve each column's **natural** absolute width. Fixed (numeric) widths pass
 * through; percentage widths become `floor(pct/100 * baseline)`. The result is
 * a function of the column definitions only.
 */
export function naturalWidths(
  columns: ColumnDef[],
  baseline: number = LIST_BASELINE_WIDTH,
): number[] {
  return columns.map((c) => {
    if (typeof c.width === 'number') {
      return c.width;
    }
    const pct = parseFloat(c.width);
    return Math.floor((pct / 100) * baseline);
  });
}

/**
 * How many leading columns are pinned: through the `Name` column inclusive. If
 * a kind has no `Name` column, only the first column (the status dot) is
 * pinned. Returns 0 for an empty column set.
 */
export function pinnedCount(columns: ColumnDef[]): number {
  if (columns.length === 0) {
    return 0;
  }
  const nameIndex = columns.findIndex((c) => c.header === 'Name');
  if (nameIndex === -1) {
    return 1;
  }
  return nameIndex + 1;
}

function sum(values: number[]): number {
  let total = 0;
  for (const v of values) {
    total += v;
  }
  return total;
}

/**
 * Project the visible horizontal window for the given offset and pane width.
 *
 * `hOffset` is a column index into the *scrollable* columns (snapped to column
 * boundaries so headers stay aligned). The scrollable viewport width is
 * `paneWidth − Σ pinnedWidths` (never negative). Starting at `hOffset`,
 * scrollable columns fill the viewport; the last visible column may be clipped
 * at the right edge.
 */
export function resolveRowWindow(
  columns: ColumnDef[],
  widths: number[],
  pinned: number,
  hOffset: number,
  paneWidth: number,
): RowWindow {
  // Zip columns with their widths. `widths` is normally `naturalWidths(columns)`
  // (same length); a short `widths` array is tolerated by treating missing
  // widths as 0 so the function never throws on a malformed call.
  const cells = columns.map((col, i) => ({ col, width: widths[i] ?? 0 }));

  const pinnedCols: PinnedColumn[] = cells.slice(0, pinned);
  const pinnedWidth = sum(pinnedCols.map((p) => p.width));
  const viewport = Math.max(0, paneWidth - pinnedWidth);

  const scrollableCells = cells.slice(pinned);
  const leftMore = hOffset > 0;

  const scrollable: WindowColumn[] = [];
  let used = 0;
  let consumed = 0; // how many scrollable columns (from hOffset) we placed
  for (const { col, width } of scrollableCells.slice(hOffset)) {
    if (used >= viewport) {
      break;
    }
    const remaining = viewport - used;
    const clip = width > remaining ? width - remaining : 0;
    scrollable.push({ col, width, clip });
    used += width;
    consumed += 1;
  }

  // More to the right when a scrollable column sits beyond the last one placed,
  // or the last placed column was clipped at the right edge.
  const last = scrollable[scrollable.length - 1];
  const moreColumnsRight = hOffset + consumed < scrollableCells.length;
  const rightMore =
    scrollableCells.length > 0 &&
    (moreColumnsRight || (last !== undefined && last.clip > 0));

  return { pinned: pinnedCols, scrollable, leftMore, rightMore };
}

/**
 * Clamp a desired horizontal offset to the valid range.
 *
 * Minimum is 0. Maximum is the smallest scrollable index at which the
 * remaining columns still fit the viewport (so the final column lands flush
 * against the right edge and you can't scroll past into empty space). If even
 * the last column alone overflows the viewport (e.g. an ultra-narrow pane),
 * the maximum is the last scrollable index so the final column can still be
 * reached. When everything fits, the offset is pinned at 0.
 */
export function clampHOffset(
  columns: ColumnDef[],
  widths: number[],
  pinned: number,
  paneWidth: number,
  desired: number,
): number {
  const scrollableCount = columns.length - pinned;
  if (scrollableCount <= 0) {
    return 0;
  }

  const pinnedWidth = sum(widths.slice(0, pinned));
  const viewport = Math.max(0, paneWidth - pinnedWidth);
  const scrollableWidths = widths.slice(pinned);

  // Smallest offset whose suffix of scrollable widths fits the viewport. Walk
  // the widths from the right; `index` tracks the scrollable column index.
  let maxOffset = scrollableCount - 1;
  let suffix = 0;
  let index = scrollableCount - 1;
  for (const width of [...scrollableWidths].reverse()) {
    suffix += width;
    if (suffix <= viewport) {
      maxOffset = index;
    } else {
      break;
    }
    index -= 1;
  }

  if (desired < 0) {
    return 0;
  }
  if (desired > maxOffset) {
    return maxOffset;
  }
  return desired;
}
