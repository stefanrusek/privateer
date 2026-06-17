/**
 * logs-view.ts — the pure projection behind the Logs detail tab's scroll
 * viewport (navigation-overhaul chunk 03).
 *
 * Spec: `specs/002-navigation-overhaul/03-detail-scroll-viewport.md` ("Logs:
 * pause/resume on scroll").
 *
 * Replaces the old "last 200 lines, always tailing" view with a real viewport
 * onto the ring buffer:
 *
 * - **Live** (`live === true`): the window is pinned to the newest lines; the
 *   resolved offset is always the bottom, so freshly arrived lines stay visible.
 * - **Paused** (`live === false`): the window honors the stored offset (clamped),
 *   letting the user read back through history while new lines accrue off-screen.
 *
 * The timestamp-strip and the windowing are pure here; the controller owns the
 * `live` flag (toggled by scroll position via `scroll-viewport.ts`'s
 * `logsLiveAfterScroll`) and search. {@link offsetForMatch} computes the offset
 * that scrolls a search match into view.
 */

import {
  type Scrollbar,
  clampOffset,
  maxOffset,
  scrollbar,
  visibleSlice,
} from './scroll-viewport.js';

export interface LogsViewInput {
  /** The ring-buffer contents, oldest line first. */
  readonly raw: readonly string[];
  /** Stored scroll offset (top visible line); used only when paused. */
  readonly offset: number;
  /** Visible rows available to the log body (detail inner height minus chrome). */
  readonly viewportHeight: number;
  /** Whether timestamp prefixes are shown (false strips the leading token). */
  readonly timestamps: boolean;
  /** Whether the tail is live (pinned to the bottom) or paused at `offset`. */
  readonly live: boolean;
}

export interface LogsViewProjection {
  /** All projected (timestamp-adjusted) display lines — search runs over these. */
  readonly display: readonly string[];
  /** The windowed slice for rendering, already sized to the viewport. */
  readonly visible: readonly string[];
  /** The resolved offset after live-pinning / clamping. */
  readonly offset: number;
  /** Whether the resolved window sits at the bottom of the content. */
  readonly atBottom: boolean;
  /** The scrollbar thumb, or null when the content fits. */
  readonly scrollbar: Scrollbar | null;
}

/** Project the raw ring lines to display lines, stripping timestamps if hidden. */
export function projectLogsDisplay(
  raw: readonly string[],
  timestamps: boolean,
): readonly string[] {
  if (timestamps) {
    return raw;
  }
  return raw.map((line) => {
    const space = line.indexOf(' ');
    return space > 0 ? line.slice(space + 1) : line;
  });
}

/**
 * Resolve the visible Logs window. When live, the offset is forced to the
 * bottom; when paused, the stored offset is clamped. The returned `display` is
 * the full projected list (for search), `visible` the rendered window.
 */
export function projectLogsView(input: LogsViewInput): LogsViewProjection {
  const display = projectLogsDisplay(input.raw, input.timestamps);
  const total = display.length;
  const offset = input.live
    ? maxOffset(total, input.viewportHeight)
    : clampOffset(input.offset, total, input.viewportHeight);
  return {
    display,
    visible: visibleSlice(
      display.map((text) => ({ text })),
      offset,
      input.viewportHeight,
    ).map((l) => l.text),
    offset,
    atBottom: offset === maxOffset(total, input.viewportHeight),
    scrollbar: scrollbar(offset, total, input.viewportHeight),
  };
}

/**
 * The offset that brings the line at `matchLine` into the viewport, moving as
 * little as possible: if the match is already visible the offset is unchanged;
 * otherwise it scrolls just far enough for the match to sit on the near edge. A
 * negative `matchLine` (no current match) leaves the offset unchanged.
 */
export function offsetForMatch(
  offset: number,
  matchLine: number,
  totalLines: number,
  viewportHeight: number,
): number {
  if (matchLine < 0) {
    return offset;
  }
  const top = offset;
  const bottom = offset + viewportHeight - 1;
  let next = offset;
  if (matchLine < top) {
    next = matchLine;
  } else if (matchLine > bottom) {
    next = matchLine - viewportHeight + 1;
  }
  return clampOffset(next, totalLines, viewportHeight);
}
