/**
 * frame.ts — the pure collapsed-grid frame model for p9r's Option-A chrome.
 *
 * Spec: `specs/002-navigation-overhaul/02-region-chrome-layout-math.md`
 * (canonical `spec/spec-02-navigation-layout.md`, "The frame (Option A)").
 *
 * `layout-geometry.ts` (chunk 02a) decides *where* the regions and their
 * collapsed border lines sit. This module decides *what glyph* each border
 * cell draws: it turns a `Frame` (inner `Rect`s) into a 2-D grid of box-drawing
 * characters for one connected, collapsed grid — single-line by default,
 * double-line + accent around the focused region, with the correct **mixed
 * single/double junction** glyph wherever a focused (double) edge meets an
 * unfocused (single) neighbour.
 *
 * The grid is *pure data*: a thin Ink renderer (in `src/adapters/live/`)
 * composites each region's already-rendered content lines into the blank
 * windows between the border cells, so switching focus changes only glyph
 * weight/accent — never a `Rect`, never a content position, never a single
 * cell of layout. (This is the headline B02b acceptance criterion.)
 *
 * Why a glyph grid and not per-`Box` borders: Ink draws every `<Box>`'s four
 * borders independently, so two adjacent boxes show a *double* line and can
 * never form a `┼` junction. The collapsed grid must therefore be composed
 * from a single source of truth — this model.
 *
 * Border model (matches `layout-geometry.ts`): three vertical frame lines (left
 * edge, sidebar│right shared line, right edge) and four horizontal lines (top
 * edge, header│body, body│commandbar, bottom edge), plus the list│detail line
 * when the detail pane is open. Shared edges are drawn once.
 */

import type { Frame, Rect } from './layout-geometry.js';

/** Box-line weight emanating from a cell in one direction. */
export type Edge = 'none' | 'single' | 'double';

/** The five focusable chrome regions (plus `null` for "nothing focused"). */
export type FrameRegion =
  | 'header'
  | 'sidebar'
  | 'list'
  | 'detail'
  | 'commandBar';

/**
 * The four directional line weights meeting at a border cell. `up`/`down` are
 * the vertical neighbours, `left`/`right` the horizontal ones.
 */
export interface CellEdges {
  readonly up: Edge;
  readonly down: Edge;
  readonly left: Edge;
  readonly right: Edge;
}

/** A renderable border-glyph grid: `glyphs[row][col]` is a box char or null. */
export interface BorderGrid {
  readonly rows: number;
  readonly columns: number;
  /**
   * `glyphs[y][x]` — a width-1 box-drawing glyph for a border cell, or `null`
   * for an interior cell (a content window the renderer fills). The whole frame
   * accent flag travels alongside (see `accent`).
   */
  readonly glyphs: readonly (readonly (string | null)[])[];
  /**
   * `accent[y][x]` — true when the cell belongs to the focused region's border
   * (so the renderer paints it in the accent colour). Border cells not on the
   * focused region, and interior cells, are false.
   */
  readonly accent: readonly (readonly boolean[])[];
}

/**
 * Map the app's `FocusRegion` (lower-case `commandbar`) plus header-focus flag
 * to the frame model's `FrameRegion`. When the header holds focus (namespace /
 * search / context chip), the header region's border is the focused one;
 * otherwise the focused content region maps through directly. Returns `null`
 * when nothing focusable is focused.
 */
export function focusedRegion(
  focus: 'sidebar' | 'list' | 'detail' | 'commandbar',
  headerFocused: boolean,
): FrameRegion {
  if (headerFocused) {
    return 'header';
  }
  switch (focus) {
    case 'sidebar':
      return 'sidebar';
    case 'list':
      return 'list';
    case 'detail':
      return 'detail';
    case 'commandbar':
      return 'commandBar';
  }
}

export interface ComputeBorderGridInput {
  readonly frame: Frame;
  readonly columns: number;
  readonly rows: number;
  /** The currently-focused region, or `null` when nothing is focused. */
  readonly focus: FrameRegion | null;
}

// ---------------------------------------------------------------------------
// Glyph lookup: (up, down, left, right) edges → a single box-drawing char.
// ---------------------------------------------------------------------------

/**
 * Resolve the four directional edge weights to one width-1 box-drawing glyph.
 *
 * Unicode's box-drawing block only defines glyphs for the combinations that
 * actually occur in a grid where double lines run in *straight* runs (a region
 * border is a rectangle, so a double line never turns into a single line
 * mid-stroke at a non-junction). At a junction where one axis is double and the
 * other single, Unicode provides the mixed glyphs (`╪ ╫ ╞ ╤` …). Where a glyph
 * does not exist (e.g. a corner that is double on one arm and single on the
 * other — Unicode has `╓ ╖ ╜ ╙` for exactly the half-double corners, which we
 * use), we fall back to the all-single glyph of the same shape so the grid
 * still reads as connected.
 */
export function glyphFor(edges: CellEdges): string {
  const { up, down, left, right } = edges;
  const key = `${code(up)}${code(down)}${code(left)}${code(right)}`;
  const glyph = GLYPHS[key];
  if (glyph !== undefined) {
    return glyph;
  }
  // Fallback: collapse every double arm to single and look that shape up; the
  // all-single table is total over every shape that can occur in the grid.
  const single = `${code(downgrade(up))}${code(downgrade(down))}${code(
    downgrade(left),
  )}${code(downgrade(right))}`;
  return GLYPHS[single] ?? ' ';
}

function code(edge: Edge): '0' | '1' | '2' {
  switch (edge) {
    case 'none':
      return '0';
    case 'single':
      return '1';
    case 'double':
      return '2';
  }
}

function downgrade(edge: Edge): Edge {
  return edge === 'double' ? 'single' : edge;
}

/**
 * Glyph table keyed by `${up}${down}${left}${right}` where each digit is
 * 0=none, 1=single, 2=double. Only the shapes that occur in a rectangular
 * collapsed grid are enumerated; everything else falls back via `glyphFor`.
 */
const GLYPHS: Readonly<Record<string, string>> = {
  // key digits: up down left right — 0=none 1=single 2=double
  // ---- straight lines ----
  '0011': '─', // horizontal single
  '0022': '═', // horizontal double
  '1100': '│', // vertical single
  '2200': '║', // vertical double
  // ---- corners (all single) ----
  '0101': '┌',
  '0110': '┐',
  '1001': '└',
  '1010': '┘',
  // ---- corners (all double) ----
  '0202': '╔',
  '0220': '╗',
  '2002': '╚',
  '2020': '╝',
  // ---- corners: double vertical arm, single horizontal arm ----
  '0201': '╓', // down double, right single
  '0210': '╖', // down double, left single
  '2001': '╙', // up double, right single
  '2010': '╜', // up double, left single
  // ---- corners: single vertical arm, double horizontal arm ----
  '0102': '╒', // down single, right double
  '0120': '╕', // down single, left double
  '1002': '╘', // up single, right double
  '1020': '╛', // up single, left double
  // ---- tees (all single) ----
  '0111': '┬',
  '1011': '┴',
  '1101': '├',
  '1110': '┤',
  // ---- tees: ├ family (up+down+right) ----
  '1102': '╞', // vertical single, right double
  '2201': '╟', // vertical double, right single
  // ---- tees: ┤ family (up+down+left) ----
  '1120': '╡', // vertical single, left double
  '2210': '╢', // vertical double, left single
  // ---- tees: ┬ family (down+left+right) ----
  '0122': '╤', // down single, horizontal double
  '0211': '╥', // down double, horizontal single
  // ---- tees: ┴ family (up+left+right) ----
  '1022': '╧', // up single, horizontal double
  '2011': '╨', // up double, horizontal single
  // ---- crosses ----
  '1111': '┼', // all single
  '2222': '╬', // all double
  '2211': '╫', // vertical double, horizontal single
  '1122': '╪', // vertical single, horizontal double
};

// ---------------------------------------------------------------------------
// Edge accumulation: stamp each region's border rectangle into an edge grid.
// ---------------------------------------------------------------------------

interface MutableCell {
  up: Edge;
  down: Edge;
  left: Edge;
  right: Edge;
  accent: boolean;
}

/**
 * Merge an existing cell edge with a newly-stamped border `weight`. `weight` is
 * always a real line (`single`/`double`), so the result is too; a double arm
 * always wins, giving collapsed shared lines the focused (double) weight.
 */
function stronger(existing: Edge, weight: 'single' | 'double'): Edge {
  if (existing === 'double' || weight === 'double') {
    return 'double';
  }
  return 'single';
}

/**
 * Compute the border-glyph grid for the collapsed frame.
 *
 * Every region is bordered (borders are *always* drawn, so focus never moves
 * layout). The focused region's four border edges are stamped at `double`
 * weight; all other edges at `single`. Where edges overlap (collapsed/shared
 * lines), the stronger weight wins per direction, which yields the mixed
 * single/double junction glyphs automatically.
 */
export function computeBorderGrid(input: ComputeBorderGridInput): BorderGrid {
  const { frame, columns, rows, focus } = input;
  const w = Math.max(0, columns);
  const h = Math.max(0, rows);

  const cells: MutableCell[][] = [];
  for (let y = 0; y < h; y++) {
    const row: MutableCell[] = [];
    for (let x = 0; x < w; x++) {
      row.push({
        up: 'none',
        down: 'none',
        left: 'none',
        right: 'none',
        accent: false,
      });
    }
    cells.push(row);
  }

  for (const { region, outer } of outerRects(frame, w, h)) {
    if (outer === null) {
      continue;
    }
    const weight: 'single' | 'double' = region === focus ? 'double' : 'single';
    stampBorder(cells, outer, weight, region === focus);
  }

  const glyphs: (string | null)[][] = [];
  const accent: boolean[][] = [];
  for (const row of cells) {
    const grow: (string | null)[] = [];
    const arow: boolean[] = [];
    for (const c of row) {
      const isBorder =
        c.up !== 'none' ||
        c.down !== 'none' ||
        c.left !== 'none' ||
        c.right !== 'none';
      grow.push(isBorder ? glyphFor(c) : null);
      arow.push(isBorder ? c.accent : false);
    }
    glyphs.push(grow);
    accent.push(arow);
  }

  return { rows: h, columns: w, glyphs, accent };
}

/**
 * A vertical run of border glyphs at a fixed column, sliced from a `BorderGrid`
 * for the renderer. `glyphs` is newline-joined; `accent` is true when *any*
 * cell in the run belongs to the focused region's border (so the renderer tints
 * the whole strip — a contiguous focused edge is always one tint).
 */
export interface ColumnStrip {
  readonly glyphs: string;
  readonly accent: boolean;
}

/** A single border cell for per-cell colouring of horizontal line rows. */
export interface BorderCell {
  readonly glyph: string;
  readonly accent: boolean;
}

/**
 * Slice a vertical strip of border glyphs at column `x`, rows `y0..y1`
 * inclusive. Out-of-range or content (null) cells become a space so the strip's
 * height always matches `y1 - y0 + 1`.
 */
export function columnStrip(
  grid: BorderGrid,
  x: number,
  y0: number,
  y1: number,
): ColumnStrip {
  const lines: string[] = [];
  let accent = false;
  for (let y = y0; y <= y1; y++) {
    const row = grid.glyphs[y];
    const glyph = row?.[x] ?? null;
    lines.push(glyph ?? ' ');
    if (glyph !== null && grid.accent[y]?.[x] === true) {
      accent = true;
    }
  }
  return { glyphs: lines.join('\n'), accent };
}

/**
 * Slice a horizontal run of border cells at row `y`, columns `x0..x1`
 * inclusive, each with its own accent flag for per-cell colouring. Out-of-range
 * or content cells become a space (not accented).
 */
export function rowCells(
  grid: BorderGrid,
  y: number,
  x0: number,
  x1: number,
): BorderCell[] {
  const out: BorderCell[] = [];
  const row = grid.glyphs[y];
  const arow = grid.accent[y];
  for (let x = x0; x <= x1; x++) {
    const glyph = row?.[x] ?? null;
    out.push({
      glyph: glyph ?? ' ',
      accent: glyph !== null && arow?.[x] === true,
    });
  }
  return out;
}

/**
 * The five regions' *outer* border rectangles, in grid coordinates. The outer
 * rect is the bounding box whose perimeter the border ring is drawn on — its
 * inner area is the region's content window.
 *
 * These are derived from the frame so the header and command bar span the
 * **full width** (Option A), the sidebar spans the **full body height**, and
 * the list/detail boxes share the sidebar│right and list│detail lines. Shared
 * edges are stamped by both neighbours; the stronger weight wins.
 */
function outerRects(
  frame: Frame,
  w: number,
  h: number,
): { region: FrameRegion; outer: Rect | null }[] {
  const lineX = frame.handles.sidebar.position; // sidebar│right column
  const headerLineY = frame.list.y - 1; // header│body line row
  const bottomLineY = frame.commandBar.y - 1; // body│commandbar line row
  const rightEdge = w - 1; // right frame column

  const header: Rect | null =
    frame.header.height > 0
      ? { x: 0, y: 0, width: w, height: headerLineY + 1 }
      : null;
  const commandBar: Rect | null =
    frame.commandBar.height > 0
      ? { x: 0, y: bottomLineY, width: w, height: h - bottomLineY }
      : null;
  const sidebar: Rect | null =
    frame.sidebar.height > 0
      ? {
          x: 0,
          y: headerLineY,
          width: lineX + 1,
          height: bottomLineY - headerLineY + 1,
        }
      : null;
  const vline = frame.handles.vertical;
  const listBottomLineY = vline !== null ? vline.position : bottomLineY;
  const list: Rect | null =
    frame.list.height > 0
      ? {
          x: lineX,
          y: headerLineY,
          width: rightEdge - lineX + 1,
          height: listBottomLineY - headerLineY + 1,
        }
      : null;
  const detail: Rect | null =
    frame.detail !== null && vline !== null
      ? {
          x: lineX,
          y: vline.position,
          width: rightEdge - lineX + 1,
          height: bottomLineY - vline.position + 1,
        }
      : null;

  return [
    { region: 'header', outer: header },
    { region: 'sidebar', outer: sidebar },
    { region: 'list', outer: list },
    { region: 'detail', outer: detail },
    { region: 'commandBar', outer: commandBar },
  ];
}

/**
 * Stamp the border ring of an *outer* `Rect` into the edge grid. The ring lives
 * on the rect's own perimeter: left at `rect.x`, right at `rect.x+width-1`, top
 * at `rect.y`, bottom at `rect.y+height-1`. Shared edges are stamped by both
 * regions; the stronger weight wins, so collapsed lines stay single physical
 * lines and mixed single/double junctions resolve correctly.
 */
function stampBorder(
  cells: MutableCell[][],
  rect: Rect,
  weight: 'single' | 'double',
  accent: boolean,
): void {
  const left = rect.x;
  const right = rect.x + rect.width - 1;
  const top = rect.y;
  const bottom = rect.y + rect.height - 1;

  // Top & bottom horizontal edges (each border cell carries left/right line).
  for (let x = left; x <= right; x++) {
    addHorizontal(cells, top, x, left, right, weight, accent);
    addHorizontal(cells, bottom, x, left, right, weight, accent);
  }
  // Left & right vertical edges (each carries up/down line).
  for (let y = top; y <= bottom; y++) {
    addVertical(cells, y, left, top, bottom, weight, accent);
    addVertical(cells, y, right, top, bottom, weight, accent);
  }
}

/**
 * Out-of-grid coordinates (`cells[y]?.[x]` is `undefined`) are silently
 * skipped, so a region whose border ring overflows a smaller grid is clipped
 * rather than indexing out of range.
 */
function addHorizontal(
  cells: MutableCell[][],
  y: number,
  x: number,
  left: number,
  right: number,
  weight: 'single' | 'double',
  accent: boolean,
): void {
  const c = cells[y]?.[x];
  if (c === undefined) {
    return;
  }
  if (x > left) {
    c.left = stronger(c.left, weight);
  }
  if (x < right) {
    c.right = stronger(c.right, weight);
  }
  if (accent) {
    c.accent = true;
  }
}

function addVertical(
  cells: MutableCell[][],
  y: number,
  x: number,
  top: number,
  bottom: number,
  weight: 'single' | 'double',
  accent: boolean,
): void {
  const c = cells[y]?.[x];
  if (c === undefined) {
    return;
  }
  if (y > top) {
    c.up = stronger(c.up, weight);
  }
  if (y < bottom) {
    c.down = stronger(c.down, weight);
  }
  if (accent) {
    c.accent = true;
  }
}
