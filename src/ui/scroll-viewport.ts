/**
 * scroll-viewport.ts — the pure, generic scroll model behind every read-only
 * detail tab (navigation-overhaul chunk 03).
 *
 * Spec: `specs/002-navigation-overhaul/03-detail-scroll-viewport.md`.
 *
 * A detail tab's content is treated as an ordered list of **visual rows**
 * (`ViewLine[]` — text plus its styling, already wrapped/truncated to the pane
 * width by the projecting tab) and the viewport shows a fixed-height window into
 * it. This module owns all the offset arithmetic: clamping, paging, the
 * scrollbar thumb, `atBottom`, and the Logs tail-pause predicate. The controller
 * (a coverage-excluded adapter) only stores the offset and calls these helpers.
 *
 * This is the **`scrollBy` seam** consumed downstream by the mouse-wheel handler
 * (chunk 04 / B04a) and the YAML read-mode viewport (chunk 07 / B07): both feed
 * a {@link ScrollState}, a line delta, the total line count, and the viewport
 * height through {@link scrollBy} and render {@link visibleSlice}. The state is a
 * single `{ offset }` so callers can hold it trivially and reset it via
 * {@link resetOffset}.
 *
 * Invariants:
 * - `offset` is always clamped into `[0, maxOffset(total, height)]` on the way
 *   out of every transition — callers may pass an out-of-range offset in.
 * - `viewportHeight <= 0` is tolerated: nothing is visible and the whole content
 *   counts as "below the fold" (so the scrollbar is hidden and `atBottom` is
 *   driven by the clamp).
 */

/** A single visual row of detail content: text plus its preserved styling. */
export interface ViewLine {
  /** The already-wrapped/truncated text of one visual row. */
  readonly text: string;
  /** Ink color name, when the row carries one. */
  readonly color?: string;
  /** Whether the row renders bold. */
  readonly bold?: boolean;
  /** Whether the row renders dim. */
  readonly dim?: boolean;
}

/** The scroll position of one viewport. `offset` is the first visible row; 0 = top. */
export interface ScrollState {
  /** Index of the topmost visible row (0 = top). Always clamped before use. */
  readonly offset: number;
}

/** Direction for {@link pageBy}. */
export type PageDirection = 'up' | 'down';

/** A scrollbar thumb projected onto the viewport's gutter rows. */
export interface Scrollbar {
  /** First gutter row (0-based) the thumb covers. */
  readonly thumbStart: number;
  /** Height of the thumb in rows (>= 1). */
  readonly thumbSize: number;
}

/**
 * The largest valid offset: the number of rows that sit below the viewport when
 * scrolled to the very top. Zero when the content fits. With a non-positive
 * viewport every row is below the fold, so the cap is `totalLines`.
 */
export function maxOffset(totalLines: number, viewportHeight: number): number {
  if (viewportHeight <= 0) {
    return Math.max(0, totalLines);
  }
  return Math.max(0, totalLines - viewportHeight);
}

/** Clamp an offset into `[0, maxOffset]`. */
export function clampOffset(
  offset: number,
  totalLines: number,
  viewportHeight: number,
): number {
  const max = maxOffset(totalLines, viewportHeight);
  if (offset < 0) {
    return 0;
  }
  if (offset > max) {
    return max;
  }
  return offset;
}

/**
 * The visible window of rows for an offset. The offset is clamped first, so an
 * out-of-range value never produces an empty or misaligned slice. A non-positive
 * viewport yields no rows.
 */
export function visibleSlice(
  lines: readonly ViewLine[],
  offset: number,
  viewportHeight: number,
): ViewLine[] {
  if (viewportHeight <= 0) {
    return [];
  }
  const start = clampOffset(offset, lines.length, viewportHeight);
  return lines.slice(start, start + viewportHeight);
}

/** Move the offset by `delta` rows (positive = down), clamped. */
export function scrollBy(
  state: ScrollState,
  delta: number,
  totalLines: number,
  viewportHeight: number,
): ScrollState {
  return {
    offset: clampOffset(state.offset + delta, totalLines, viewportHeight),
  };
}

/** The per-page step: one viewport height minus a one-row overlap (>= 1). */
function pageStep(viewportHeight: number): number {
  return Math.max(1, viewportHeight - 1);
}

/** Page up or down by ~one viewport height (with a one-row overlap), clamped. */
export function pageBy(
  state: ScrollState,
  dir: PageDirection,
  totalLines: number,
  viewportHeight: number,
): ScrollState {
  const step = pageStep(viewportHeight);
  const delta = dir === 'down' ? step : -step;
  return scrollBy(state, delta, totalLines, viewportHeight);
}

/** Scroll to the very top. */
export function toTop(): ScrollState {
  return { offset: 0 };
}

/** Scroll to the very bottom. */
export function toBottom(
  totalLines: number,
  viewportHeight: number,
): ScrollState {
  return { offset: maxOffset(totalLines, viewportHeight) };
}

/** Whether the offset is pinned to the bottom (clamped offset === maxOffset). */
export function atBottom(
  offset: number,
  totalLines: number,
  viewportHeight: number,
): boolean {
  return (
    clampOffset(offset, totalLines, viewportHeight) ===
    maxOffset(totalLines, viewportHeight)
  );
}

/**
 * Project a one-column scrollbar thumb onto the `viewportHeight` gutter rows.
 * Returns `null` when no scrollbar is warranted (content fits, or a non-positive
 * viewport). The thumb size is proportional to the visible fraction (>= 1 row)
 * and its position is proportional to the scroll progress, with the bottom of
 * the thumb pinned to the gutter bottom when fully scrolled.
 */
export function scrollbar(
  offset: number,
  totalLines: number,
  viewportHeight: number,
): Scrollbar | null {
  if (viewportHeight <= 0 || totalLines <= viewportHeight) {
    return null;
  }
  const max = maxOffset(totalLines, viewportHeight);
  const clamped = clampOffset(offset, totalLines, viewportHeight);
  // Thumb height ~ visible fraction of the content, at least one row.
  const thumbSize = Math.max(
    1,
    Math.round((viewportHeight / totalLines) * viewportHeight),
  );
  const travel = viewportHeight - thumbSize; // rows the thumb can move within
  // `max > 0` here: we returned null above unless totalLines > viewportHeight.
  const progress = clamped / max;
  const thumbStart = Math.min(travel, Math.round(progress * travel));
  return { thumbStart, thumbSize };
}

/**
 * The reset offset when the active tab or selected resource changes: the top for
 * an ordinary tab, the bottom for Logs (which starts tailing the newest lines).
 */
export function resetOffset(
  isLogs: boolean,
  totalLines: number,
  viewportHeight: number,
): ScrollState {
  return isLogs ? toBottom(totalLines, viewportHeight) : toTop();
}

/**
 * The Logs tail-pause predicate: the stream stays live iff the (new) offset sits
 * at the bottom. Scrolling up off the bottom pauses the tail; returning to the
 * bottom resumes it. Wired by the controller to `logs.live`.
 */
export function logsLiveAfterScroll(
  state: ScrollState,
  totalLines: number,
  viewportHeight: number,
): boolean {
  return atBottom(state.offset, totalLines, viewportHeight);
}
