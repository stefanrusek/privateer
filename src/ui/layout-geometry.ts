/**
 * layout-geometry.ts — the single source of truth for p9r's region geometry.
 *
 * Spec: `specs/navigation-overhaul/02-region-chrome-layout-math.md`
 * (canonical `spec/spec-02-navigation-layout.md`).
 *
 * `computeFrame(...)` takes the terminal size plus the two pane ratios and
 * returns the *inner* content `Rect` of every region (header, sidebar, list,
 * detail, command bar) plus the two shared border `Segment`s that act as drag
 * handles. Every other layout consumer — `controller.tableWidth()`,
 * `controller.visibleHeight()`, the sidebar width, the metrics chart width —
 * derives from this module. No consumer does geometry arithmetic of its own.
 *
 * Border model (Option A collapsed grid):
 *
 *   row 0                 ┌────────────────────────────────┐  header chrome (top)
 *   header inner          │ <context> · ns: …      /<search>│
 *   shared line           ├──────┬─────────────────────────┤  ← sidebar│right tee row
 *   sidebar + list inner  │ side │ list                    │
 *                         │ bar  ├─────────────────────────┤  ← list│detail line (V resize)
 *   sidebar + detail inn. │      │ detail                  │
 *   shared line           ├──────┴─────────────────────────┤
 *   command bar inner     │ Space agent · / search · ? help │
 *   last row              └────────────────────────────────┘  command bar chrome (bottom)
 *
 * Each bordered cell consumes one column per side and one row top/bottom;
 * shared (collapsed) edges are counted *once*. All `Rect`s are the inner area
 * inside the border, in absolute, 0-based terminal coordinates. `x/y` feed
 * mouse hit-testing (chunk 04); `width/height` bound content so it never wraps.
 *
 * There is deliberately **no** `max(60, …)`-style floor: when the terminal is
 * too small, inner dimensions clamp toward the documented minimums and content
 * is truncated by the consuming view, never wrapped.
 */

/** Inner content rectangle of a region, absolute 0-based terminal coords. */
export interface Rect {
  /** Left edge of the inner content area (column, 0-based). */
  readonly x: number;
  /** Top edge of the inner content area (row, 0-based). */
  readonly y: number;
  /** Inner content width in columns (never negative). */
  readonly width: number;
  /** Inner content height in rows (never negative). */
  readonly height: number;
}

/**
 * A straight border line usable as a drag handle. `vertical` segments run down
 * a single column from `start` to `end` (inclusive); horizontal segments run
 * along a single row. Coordinates are absolute and 0-based.
 */
export interface Segment {
  readonly orientation: 'vertical' | 'horizontal';
  /** Fixed axis: the column for a vertical line, the row for a horizontal one. */
  readonly position: number;
  /** Inclusive start along the running axis (row for vertical, col for horizontal). */
  readonly start: number;
  /** Inclusive end along the running axis. */
  readonly end: number;
}

export interface ComputeFrameInput {
  /** Terminal width in columns. */
  readonly columns: number;
  /** Terminal height in rows. */
  readonly rows: number;
  /** Sidebar's share of total width (clamped to [MIN, MAX]). */
  readonly sidebarRatio: number;
  /** Detail pane's share of the list+detail split (clamped to [MIN, MAX]). */
  readonly verticalRatio: number;
  /** Whether the detail pane is shown below the list. */
  readonly showDetail: boolean;
}

export interface Frame {
  readonly header: Rect;
  readonly sidebar: Rect;
  readonly list: Rect;
  /** Null when `showDetail` is false. */
  readonly detail: Rect | null;
  readonly commandBar: Rect;
  readonly handles: {
    /** Vertical sidebar│right border line (horizontal-resize handle). */
    readonly sidebar: Segment;
    /** Horizontal list│detail border line (vertical-resize handle); null when detail closed. */
    readonly vertical: Segment | null;
  };
}

// ---------------------------------------------------------------------------
// Clamp bounds & minimums (Spec 02 §3.3, §6.1)
// ---------------------------------------------------------------------------

/** Sidebar may never be narrower than 18 inner columns (Spec 02 §3.3). */
export const MIN_SIDEBAR_INNER = 18;
/** Sidebar ratio is clamped so it stays a sane fraction of the width. */
export const MIN_SIDEBAR_RATIO = 0.1;
export const MAX_SIDEBAR_RATIO = 0.4;
/** Detail's share of the list+detail split is clamped to [0.2, 0.8]. */
export const MIN_VERTICAL_RATIO = 0.2;
export const MAX_VERTICAL_RATIO = 0.8;

/** Minimum inner width/height a content region is allowed to shrink to. */
export const MIN_REGION_WIDTH = 1;
export const MIN_HEADER_INNER_HEIGHT = 1;
export const MIN_LIST_INNER_HEIGHT = 1;
export const MIN_DETAIL_INNER_HEIGHT = 1;

function clamp(value: number, lo: number, hi: number): number {
  if (value < lo) {
    return lo;
  }
  if (value > hi) {
    return hi;
  }
  return value;
}

function nonNeg(value: number): number {
  return value < 0 ? 0 : value;
}

/**
 * Compute the inner `Rect`s and handle `Segment`s for all five regions.
 *
 * Border accounting (collapsed grid, columns):
 *   col 0          left frame edge
 *   1 .. S         sidebar inner  (S inner cols)
 *   S+1            sidebar│right shared vertical line (the H-resize handle)
 *   S+2 .. C-2     right column inner
 *   C-1            right frame edge
 *
 * Border accounting (rows):
 *   row 0                top frame edge
 *   1                    header inner
 *   2                    header│body shared line
 *   3 .. (split-1)       list inner
 *   split                list│detail shared line (V-resize handle, detail open)
 *   (split+1) .. R-4     detail inner
 *   R-3                  body│commandbar shared line
 *   R-2                  command bar inner
 *   R-1                  bottom frame edge
 *
 * When `showDetail` is false the list owns the whole body and there is no
 * list│detail line.
 */
export function computeFrame(input: ComputeFrameInput): Frame {
  const { columns, rows, showDetail } = input;

  const sidebarRatio = clamp(
    input.sidebarRatio,
    MIN_SIDEBAR_RATIO,
    MAX_SIDEBAR_RATIO,
  );
  const verticalRatio = clamp(
    input.verticalRatio,
    MIN_VERTICAL_RATIO,
    MAX_VERTICAL_RATIO,
  );

  // ---- Horizontal split ----------------------------------------------------
  // Three vertical frame lines consume 3 columns: left edge, sidebar│right,
  // right edge. The remaining columns are split into sidebar + right inners.
  const innerCols = nonNeg(columns - 3);

  // Desired sidebar inner from the ratio, floored at the documented minimum but
  // never wider than the available inner columns (so the right column survives).
  const desiredSidebar = Math.round(sidebarRatio * columns);
  const sidebarInner = clamp(
    Math.max(desiredSidebar, MIN_SIDEBAR_INNER),
    MIN_REGION_WIDTH,
    Math.max(MIN_REGION_WIDTH, innerCols - MIN_REGION_WIDTH),
  );
  const rightInner = nonNeg(innerCols - sidebarInner);

  const sidebarX = 1; // after the left frame edge at col 0
  const sidebarLineX = sidebarX + sidebarInner; // the shared vertical line
  const rightX = sidebarLineX + 1;

  // ---- Vertical split ------------------------------------------------------
  // Six fixed non-body rows surround the body when the command bar is present:
  //   top edge · header inner · header│body line · body│commandbar line ·
  //   command bar inner · bottom edge.
  // The four *frame lines* (top, header│body, body│commandbar, bottom) plus the
  // two *inner content rows* (header, command bar) are all outside the body, so
  // the body content height is `rows - 6`, not `rows - 4`. (B02a originally
  // subtracted only the four lines, which over-reported every body region's
  // height by exactly the two inner rows — the chrome derives its strip heights
  // from line positions and silently clipped the phantom rows, but the
  // viewport helpers that trust `Rect.height` saw two rows that don't exist.)
  const NON_BODY_ROWS = 6;
  const bodyInner = nonNeg(rows - NON_BODY_ROWS);

  const headerY = 1; // after the top frame edge at row 0
  const headerHeight = bodyInner === 0 ? 0 : MIN_HEADER_INNER_HEIGHT;

  const bodyTop = headerY + 1 + 1; // header inner + header│body line
  const commandBarY = nonNeg(rows - 2); // inner row above the bottom edge
  const commandBarHeight = bodyInner === 0 ? 0 : 1;

  // Split the body into list (top) and detail (bottom). The list│detail line
  // consumes one row only when detail is shown.
  let listInner = bodyInner;
  let detailInner = 0;
  if (showDetail && bodyInner >= 3) {
    // detailInner takes `verticalRatio` of the splittable rows (body minus the
    // shared line), each side floored at its minimum.
    const splittable = bodyInner - 1;
    const rawDetail = Math.round(splittable * verticalRatio);
    detailInner = clamp(
      rawDetail,
      MIN_DETAIL_INNER_HEIGHT,
      splittable - MIN_LIST_INNER_HEIGHT,
    );
    listInner = splittable - detailInner;
  }

  const listY = bodyTop;
  const verticalLineY = listY + listInner; // shared list│detail line row
  const detailY = verticalLineY + 1;

  const showDetailRegion = showDetail && detailInner > 0;

  // ---- Assemble Rects ------------------------------------------------------
  const header: Rect = {
    x: rightX,
    y: headerY,
    width: rightInner,
    height: headerHeight,
  };
  const sidebar: Rect = {
    x: sidebarX,
    y: bodyTop,
    width: sidebarInner,
    height: bodyInner,
  };
  const list: Rect = {
    x: rightX,
    y: listY,
    width: rightInner,
    height: listInner,
  };
  const detail: Rect | null = showDetailRegion
    ? {
        x: rightX,
        y: detailY,
        width: rightInner,
        height: detailInner,
      }
    : null;
  const commandBar: Rect = {
    x: rightX,
    y: commandBarY,
    width: rightInner,
    height: commandBarHeight,
  };

  // ---- Handle segments -----------------------------------------------------
  // The sidebar│right vertical line spans the whole body (between the
  // header│body line and the body│commandbar line).
  const sidebarHandle: Segment = {
    orientation: 'vertical',
    position: sidebarLineX,
    start: bodyTop,
    end: bodyTop + bodyInner - 1,
  };
  const verticalHandle: Segment | null = showDetailRegion
    ? {
        orientation: 'horizontal',
        position: verticalLineY,
        start: rightX,
        end: rightX + rightInner - 1,
      }
    : null;

  return {
    header,
    sidebar,
    list,
    detail,
    commandBar,
    handles: {
      sidebar: sidebarHandle,
      vertical: verticalHandle,
    },
  };
}

/**
 * The resource list's **selectable-row band** — `frame.list` minus its top row.
 *
 * `frame.list` is the list region's inner content rect, and `ResourceTable`
 * renders a non-selectable **column-header row** as that region's first line
 * (at `frame.list.y`); the actual data rows start one row below. Mouse
 * hit-testing must map the first *data* row (not the header) to index 0, so the
 * registry registers this band — `y + 1`, `height - 1` — rather than the raw
 * region rect. The dispatcher's `index = localY + rowOffset` then lands on the
 * row the user clicked, with no off-by-one.
 *
 * The sidebar has no column header, so it keeps using `frame.sidebar` directly;
 * this helper is specific to the resource list. The height clamps at 0 so a
 * fully-collapsed list yields an empty (non-negative) band.
 */
export function resourceListBand(frame: Frame): Rect {
  const { list } = frame;
  return {
    x: list.x,
    y: list.y + 1,
    width: list.width,
    height: nonNeg(list.height - 1),
  };
}
