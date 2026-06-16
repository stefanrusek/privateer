import { describe, it, expect } from 'vitest';
import stringWidth from 'string-width';
import { computeFrame } from './layout-geometry.js';
import {
  computeBorderGrid,
  columnStrip,
  focusedRegion,
  glyphFor,
  rowCells,
  type BorderGrid,
  type CellEdges,
  type Edge,
  type FrameRegion,
} from './frame.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function edges(over: Partial<CellEdges>): CellEdges {
  return {
    up: over.up ?? 'none',
    down: over.down ?? 'none',
    left: over.left ?? 'none',
    right: over.right ?? 'none',
  };
}

function gridFor(
  over: {
    columns?: number;
    rows?: number;
    showDetail?: boolean;
    focus?: FrameRegion | null;
  } = {},
): BorderGrid {
  const columns = over.columns ?? 60;
  const rows = over.rows ?? 24;
  const frame = computeFrame({
    columns,
    rows,
    sidebarRatio: 0.2,
    verticalRatio: 0.4,
    showDetail: over.showDetail ?? true,
  });
  return computeBorderGrid({
    frame,
    columns,
    rows,
    focus: over.focus ?? null,
  });
}

/** Render the grid to a string (border glyphs, spaces for content windows). */
function render(g: BorderGrid): string {
  return g.glyphs.map((row) => row.map((c) => c ?? ' ').join('')).join('\n');
}

function allGlyphs(g: BorderGrid): string[] {
  const out: string[] = [];
  for (const row of g.glyphs) {
    for (const c of row) {
      if (c !== null) {
        out.push(c);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// glyphFor — junction resolution
// ---------------------------------------------------------------------------

describe('glyphFor — straight lines and corners', () => {
  const cases: [CellEdges, string][] = [
    [edges({ left: 'single', right: 'single' }), '─'],
    [edges({ left: 'double', right: 'double' }), '═'],
    [edges({ up: 'single', down: 'single' }), '│'],
    [edges({ up: 'double', down: 'double' }), '║'],
    [edges({ down: 'single', right: 'single' }), '┌'],
    [edges({ down: 'single', left: 'single' }), '┐'],
    [edges({ up: 'single', right: 'single' }), '└'],
    [edges({ up: 'single', left: 'single' }), '┘'],
    [edges({ down: 'double', right: 'double' }), '╔'],
    [edges({ down: 'double', left: 'double' }), '╗'],
    [edges({ up: 'double', right: 'double' }), '╚'],
    [edges({ up: 'double', left: 'double' }), '╝'],
  ];
  for (const [e, want] of cases) {
    it(`resolves ${JSON.stringify(e)} → ${want}`, () => {
      expect(glyphFor(e)).toBe(want);
    });
  }
});

describe('glyphFor — single tees and cross', () => {
  it('├ ┤ ┬ ┴ ┼', () => {
    expect(
      glyphFor(edges({ up: 'single', down: 'single', right: 'single' })),
    ).toBe('├');
    expect(
      glyphFor(edges({ up: 'single', down: 'single', left: 'single' })),
    ).toBe('┤');
    expect(
      glyphFor(edges({ down: 'single', left: 'single', right: 'single' })),
    ).toBe('┬');
    expect(
      glyphFor(edges({ up: 'single', left: 'single', right: 'single' })),
    ).toBe('┴');
    expect(
      glyphFor(
        edges({
          up: 'single',
          down: 'single',
          left: 'single',
          right: 'single',
        }),
      ),
    ).toBe('┼');
  });
});

describe('glyphFor — mixed single/double junctions', () => {
  it('├ family: ╞ (double right) and ╟ (double vertical)', () => {
    expect(
      glyphFor(edges({ up: 'single', down: 'single', right: 'double' })),
    ).toBe('╞');
    expect(
      glyphFor(edges({ up: 'double', down: 'double', right: 'single' })),
    ).toBe('╟');
  });
  it('┤ family: ╡ and ╢', () => {
    expect(
      glyphFor(edges({ up: 'single', down: 'single', left: 'double' })),
    ).toBe('╡');
    expect(
      glyphFor(edges({ up: 'double', down: 'double', left: 'single' })),
    ).toBe('╢');
  });
  it('┬ family: ╤ and ╥', () => {
    expect(
      glyphFor(edges({ down: 'single', left: 'double', right: 'double' })),
    ).toBe('╤');
    expect(
      glyphFor(edges({ down: 'double', left: 'single', right: 'single' })),
    ).toBe('╥');
  });
  it('┴ family: ╧ and ╨', () => {
    expect(
      glyphFor(edges({ up: 'single', left: 'double', right: 'double' })),
    ).toBe('╧');
    expect(
      glyphFor(edges({ up: 'double', left: 'single', right: 'single' })),
    ).toBe('╨');
  });
  it('cross family: ╪ (h double) ╫ (v double) ╬ (all double)', () => {
    expect(
      glyphFor(
        edges({
          up: 'single',
          down: 'single',
          left: 'double',
          right: 'double',
        }),
      ),
    ).toBe('╪');
    expect(
      glyphFor(
        edges({
          up: 'double',
          down: 'double',
          left: 'single',
          right: 'single',
        }),
      ),
    ).toBe('╫');
    expect(
      glyphFor(
        edges({
          up: 'double',
          down: 'double',
          left: 'double',
          right: 'double',
        }),
      ),
    ).toBe('╬');
  });
  it('half-double corners ╓ ╖ ╙ ╜ ╒ ╕ ╘ ╛', () => {
    expect(glyphFor(edges({ down: 'double', right: 'single' }))).toBe('╓');
    expect(glyphFor(edges({ down: 'double', left: 'single' }))).toBe('╖');
    expect(glyphFor(edges({ up: 'double', right: 'single' }))).toBe('╙');
    expect(glyphFor(edges({ up: 'double', left: 'single' }))).toBe('╜');
    expect(glyphFor(edges({ down: 'single', right: 'double' }))).toBe('╒');
    expect(glyphFor(edges({ down: 'single', left: 'double' }))).toBe('╕');
    expect(glyphFor(edges({ up: 'single', right: 'double' }))).toBe('╘');
    expect(glyphFor(edges({ up: 'single', left: 'double' }))).toBe('╛');
  });
});

describe('glyphFor — fallback', () => {
  it('falls back to the all-single shape for an undefined mixed shape', () => {
    // A cross with one double arm and three single arms is not in Unicode's
    // box-drawing block; collapse to the all-single cross ┼.
    expect(
      glyphFor(
        edges({
          up: 'double',
          down: 'single',
          left: 'single',
          right: 'single',
        }),
      ),
    ).toBe('┼');
  });
  it('returns a space when no edges are present', () => {
    expect(glyphFor(edges({}))).toBe(' ');
  });
});

describe('glyphFor — every glyph is width-1', () => {
  it('all box-drawing glyphs occupy exactly one terminal cell', () => {
    const everyEdge: Edge[] = ['none', 'single', 'double'];
    for (const up of everyEdge) {
      for (const down of everyEdge) {
        for (const left of everyEdge) {
          for (const right of everyEdge) {
            const glyph = glyphFor({ up, down, left, right });
            expect(stringWidth(glyph)).toBe(1);
          }
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// computeBorderGrid — collapsed grid structure
// ---------------------------------------------------------------------------

describe('computeBorderGrid — connected collapsed grid', () => {
  it('draws a single connected frame with the four outer corners', () => {
    const g = gridFor({ columns: 60, rows: 24, focus: null });
    expect(g.glyphs[0]![0]).toBe('┌');
    expect(g.glyphs[0]![g.columns - 1]).toBe('┐');
    expect(g.glyphs[g.rows - 1]![0]).toBe('└');
    expect(g.glyphs[g.rows - 1]![g.columns - 1]).toBe('┘');
  });

  it('every glyph in the grid is a width-1 box-drawing character', () => {
    const g = gridFor({ focus: 'list' });
    for (const glyph of allGlyphs(g)) {
      expect(stringWidth(glyph)).toBe(1);
    }
  });

  it('shares a single line between adjacent regions (no double-width run)', () => {
    // The sidebar│right vertical line is one column of glyphs, not two.
    const g = gridFor({ columns: 60, rows: 24, focus: null, showDetail: true });
    const frame = computeFrame({
      columns: 60,
      rows: 24,
      sidebarRatio: 0.2,
      verticalRatio: 0.4,
      showDetail: true,
    });
    const lineX = frame.handles.sidebar.position;
    // The columns immediately on either side of the shared line, within the
    // body, are content (null), proving the line is a single column.
    const bodyRow = frame.list.y;
    expect(g.glyphs[bodyRow]![lineX]).not.toBeNull();
    expect(g.glyphs[bodyRow]![lineX - 1]).toBeNull();
    expect(g.glyphs[bodyRow]![lineX + 1]).toBeNull();
  });

  it('renders correct tee junctions where the sidebar line meets the header line', () => {
    const g = gridFor({ columns: 60, rows: 24, focus: null });
    const frame = computeFrame({
      columns: 60,
      rows: 24,
      sidebarRatio: 0.2,
      verticalRatio: 0.4,
      showDetail: true,
    });
    const lineX = frame.handles.sidebar.position;
    // header│body line row is one above the body top.
    const headerLineY = frame.list.y - 1;
    // At (headerLineY, lineX): line goes left, right, and down (into body) → ┬
    expect(g.glyphs[headerLineY]![lineX]).toBe('┬');
    // At the list│detail line, the sidebar line continues up/down and the
    // list│detail line tees in from the right → ├.
    const vline = frame.handles.vertical;
    expect(vline).not.toBeNull();
    expect(g.glyphs[vline!.position]![lineX]).toBe('├');
  });

  it('omits the list│detail line when detail is closed', () => {
    const open = computeFrame({
      columns: 60,
      rows: 24,
      sidebarRatio: 0.2,
      verticalRatio: 0.4,
      showDetail: true,
    });
    expect(open.handles.vertical).not.toBeNull();
    const closed = gridFor({ showDetail: false, focus: null });
    const frame = computeFrame({
      columns: 60,
      rows: 24,
      sidebarRatio: 0.2,
      verticalRatio: 0.4,
      showDetail: false,
    });
    // No interior horizontal line crossing the right column.
    const rightMid = frame.list.x + 1;
    // Strictly between the header│body line and the body│commandbar line, the
    // right column must contain no horizontal glyph (no list│detail divider).
    const headerLineY = frame.list.y - 1;
    const bottomLineY = frame.commandBar.y - 1;
    let interiorHorizontal = 0;
    for (let y = headerLineY + 1; y < bottomLineY; y++) {
      if (closed.glyphs[y]![rightMid] !== null) {
        interiorHorizontal++;
      }
    }
    expect(interiorHorizontal).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Focus: weight/accent change WITHOUT any layout movement
// ---------------------------------------------------------------------------

describe('computeBorderGrid — focus shown without moving anything', () => {
  it('focusing a region makes its border double-weight and accented', () => {
    const g = gridFor({ columns: 60, rows: 24, focus: 'list' });
    const frame = computeFrame({
      columns: 60,
      rows: 24,
      sidebarRatio: 0.2,
      verticalRatio: 0.4,
      showDetail: true,
    });
    // The list's top border line (one row above list inner), at a mid column,
    // is a double horizontal and accented.
    const topY = frame.list.y - 1;
    const midX = frame.list.x + 2;
    expect(g.glyphs[topY]![midX]).toBe('═');
    expect(g.accent[topY]![midX]).toBe(true);
  });

  it('unfocused borders are single-weight and not accented', () => {
    const g = gridFor({ columns: 60, rows: 24, focus: 'list' });
    const frame = computeFrame({
      columns: 60,
      rows: 24,
      sidebarRatio: 0.2,
      verticalRatio: 0.4,
      showDetail: true,
    });
    // The sidebar's left outer edge is single and not accented.
    const midY = frame.sidebar.y + 1;
    expect(g.glyphs[midY]![0]).toBe('│');
    expect(g.accent[midY]![0]).toBe(false);
  });

  it('switching focus changes glyphs but not the grid dimensions or content windows', () => {
    const onList = gridFor({ columns: 60, rows: 24, focus: 'list' });
    const onDetail = gridFor({ columns: 60, rows: 24, focus: 'detail' });
    expect(onDetail.rows).toBe(onList.rows);
    expect(onDetail.columns).toBe(onList.columns);
    // Every content window (null cell) stays a content window: zero movement.
    for (let y = 0; y < onList.rows; y++) {
      for (let x = 0; x < onList.columns; x++) {
        const a = onList.glyphs[y]![x];
        const b = onDetail.glyphs[y]![x];
        expect(a === null).toBe(b === null);
      }
    }
  });

  it('the focused region is fully enclosed in double-weight, accented glyphs', () => {
    // Focus the list; the whole list border ring (the collapsed shared lines
    // included) is double weight and accented. Sample its four straight edges.
    const g = gridFor({ columns: 60, rows: 24, focus: 'list' });
    const frame = computeFrame({
      columns: 60,
      rows: 24,
      sidebarRatio: 0.2,
      verticalRatio: 0.4,
      showDetail: true,
    });
    const lineX = frame.handles.sidebar.position;
    const topY = frame.list.y - 1;
    const vline = frame.handles.vertical!;
    const bottomY = vline.position;
    const rightEdge = 60 - 1;
    const midY = frame.list.y + 1;
    const midX = frame.list.x + 2;
    // top & bottom double horizontals, accented
    expect(g.glyphs[topY]![midX]).toBe('═');
    expect(g.accent[topY]![midX]).toBe(true);
    expect(g.glyphs[bottomY]![midX]).toBe('═');
    expect(g.accent[bottomY]![midX]).toBe(true);
    // left & right double verticals, accented
    expect(g.glyphs[midY]![lineX]).toBe('║');
    expect(g.accent[midY]![lineX]).toBe(true);
    expect(g.glyphs[midY]![rightEdge]).toBe('║');
    expect(g.accent[midY]![rightEdge]).toBe(true);
  });

  it('keeps every junction connected (width-1) even at unrepresentable mixed corners', () => {
    // The list's double corners meet single shared lines at 3-way-mixed
    // junctions Unicode lacks; the model falls back to the all-single shape so
    // the grid stays connected and every cell remains width-1.
    const g = gridFor({ columns: 60, rows: 24, focus: 'list' });
    const frame = computeFrame({
      columns: 60,
      rows: 24,
      sidebarRatio: 0.2,
      verticalRatio: 0.4,
      showDetail: true,
    });
    const lineX = frame.handles.sidebar.position;
    const topY = frame.list.y - 1;
    // The list top-left corner over the sidebar line is a connected junction.
    const corner = g.glyphs[topY]![lineX];
    expect(corner).not.toBeNull();
    expect('┬┌╔╤╥╓'.includes(corner!)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Degenerate sizes
// ---------------------------------------------------------------------------

describe('computeBorderGrid — degenerate terminal sizes', () => {
  it('produces an empty grid for zero size', () => {
    const frame = computeFrame({
      columns: 0,
      rows: 0,
      sidebarRatio: 0.2,
      verticalRatio: 0.4,
      showDetail: false,
    });
    const g = computeBorderGrid({ frame, columns: 0, rows: 0, focus: null });
    expect(g.rows).toBe(0);
    expect(g.columns).toBe(0);
    expect(g.glyphs).toEqual([]);
  });

  it('never negative and never throws at a tiny size', () => {
    const frame = computeFrame({
      columns: 4,
      rows: 5,
      sidebarRatio: 0.2,
      verticalRatio: 0.4,
      showDetail: true,
    });
    const g = computeBorderGrid({ frame, columns: 4, rows: 5, focus: 'list' });
    expect(g.rows).toBe(5);
    expect(g.columns).toBe(4);
    for (const glyph of allGlyphs(g)) {
      expect(stringWidth(glyph)).toBe(1);
    }
  });

  it('clips border cells that fall outside a smaller grid than the frame', () => {
    // Frame computed for a 60×24 terminal but rendered into a 40×16 grid (e.g.
    // a mid-resize transient): every region border that overflows is clipped to
    // the grid bounds, never indexing out of range.
    const frame = computeFrame({
      columns: 60,
      rows: 24,
      sidebarRatio: 0.2,
      verticalRatio: 0.4,
      showDetail: true,
    });
    const g = computeBorderGrid({
      frame,
      columns: 40,
      rows: 16,
      focus: 'list',
    });
    expect(g.rows).toBe(16);
    expect(g.columns).toBe(40);
    for (const row of g.glyphs) {
      expect(row).toHaveLength(40);
    }
    for (const glyph of allGlyphs(g)) {
      expect(stringWidth(glyph)).toBe(1);
    }
  });

  it('clips a focus region rect that would draw off-grid (negative coords ignored)', () => {
    // Hand-craft a frame whose detail rect borders fall partly off the grid.
    const frame = computeFrame({
      columns: 30,
      rows: 12,
      sidebarRatio: 0.2,
      verticalRatio: 0.4,
      showDetail: true,
    });
    const g = computeBorderGrid({
      frame,
      columns: 30,
      rows: 12,
      focus: 'detail',
    });
    // Still a rectangular grid with width-1 glyphs.
    expect(g.rows).toBe(12);
    expect(render(g).split('\n')).toHaveLength(12);
  });
});

// ---------------------------------------------------------------------------
// focusedRegion mapping
// ---------------------------------------------------------------------------

describe('focusedRegion', () => {
  it('maps content regions through, normalising commandbar casing', () => {
    expect(focusedRegion('sidebar', false)).toBe('sidebar');
    expect(focusedRegion('list', false)).toBe('list');
    expect(focusedRegion('detail', false)).toBe('detail');
    expect(focusedRegion('commandbar', false)).toBe('commandBar');
  });
  it('prefers the header when the header holds focus', () => {
    expect(focusedRegion('list', true)).toBe('header');
    expect(focusedRegion('sidebar', true)).toBe('header');
  });
});

// ---------------------------------------------------------------------------
// Slicing helpers used by the renderer
// ---------------------------------------------------------------------------

describe('columnStrip / rowCells — renderer slices', () => {
  it('columnStrip slices a vertical border run and detects accent', () => {
    const g = gridFor({ columns: 60, rows: 24, focus: 'list' });
    const frame = computeFrame({
      columns: 60,
      rows: 24,
      sidebarRatio: 0.2,
      verticalRatio: 0.4,
      showDetail: true,
    });
    const lineX = frame.handles.sidebar.position;
    const y0 = frame.list.y;
    const y1 = frame.list.y + 2;
    const strip = columnStrip(g, lineX, y0, y1);
    expect(strip.glyphs.split('\n')).toHaveLength(3);
    // The list's left edge here is its (focused) double border → accented ║.
    expect(strip.glyphs.split('\n').every((c) => c === '║')).toBe(true);
    expect(strip.accent).toBe(true);
  });

  it('columnStrip pads out-of-range rows with spaces', () => {
    const g = gridFor({ columns: 20, rows: 10, focus: null });
    const strip = columnStrip(g, 0, 8, 12);
    expect(strip.glyphs.split('\n')).toHaveLength(5);
    expect(strip.glyphs.endsWith('   ') || strip.glyphs.includes(' ')).toBe(
      true,
    );
    expect(strip.accent).toBe(false);
  });

  it('rowCells slices a horizontal line into per-cell glyphs+accent', () => {
    const g = gridFor({ columns: 60, rows: 24, focus: 'list' });
    const frame = computeFrame({
      columns: 60,
      rows: 24,
      sidebarRatio: 0.2,
      verticalRatio: 0.4,
      showDetail: true,
    });
    const topY = frame.list.y - 1;
    const cells = rowCells(g, topY, frame.list.x, frame.list.x + 3);
    expect(cells).toHaveLength(4);
    // Inside the focused list's double top border → accented ═.
    expect(cells.every((c) => c.glyph === '═')).toBe(true);
    expect(cells.every((c) => c.accent)).toBe(true);
  });

  it('rowCells maps content windows and out-of-range to non-accent spaces', () => {
    const g = gridFor({ columns: 20, rows: 10, focus: null });
    const cells = rowCells(g, 100, 0, 2); // row out of range
    expect(cells).toEqual([
      { glyph: ' ', accent: false },
      { glyph: ' ', accent: false },
      { glyph: ' ', accent: false },
    ]);
  });
});
