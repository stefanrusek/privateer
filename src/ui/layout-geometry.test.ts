import { describe, it, expect } from 'vitest';
import {
  computeFrame,
  MIN_SIDEBAR_INNER,
  MIN_SIDEBAR_RATIO,
  MAX_SIDEBAR_RATIO,
  MIN_VERTICAL_RATIO,
  MAX_VERTICAL_RATIO,
  type ComputeFrameInput,
  type Frame,
} from './layout-geometry.js';

function input(over: Partial<ComputeFrameInput> = {}): ComputeFrameInput {
  return {
    columns: 120,
    rows: 40,
    sidebarRatio: 0.2,
    verticalRatio: 0.4,
    showDetail: false,
    ...over,
  };
}

// Invariant helpers ---------------------------------------------------------

function expectNonNegative(frame: Frame): void {
  for (const rect of [
    frame.header,
    frame.sidebar,
    frame.list,
    frame.commandBar,
    ...(frame.detail !== null ? [frame.detail] : []),
  ]) {
    expect(rect.width).toBeGreaterThanOrEqual(0);
    expect(rect.height).toBeGreaterThanOrEqual(0);
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.y).toBeGreaterThanOrEqual(0);
  }
}

describe('computeFrame — region placement (collapsed grid)', () => {
  it('places header at the top, command bar at the bottom, both full right width', () => {
    const f = computeFrame(input({ columns: 100, rows: 30 }));
    // top frame edge at row 0, header inner at row 1
    expect(f.header.y).toBe(1);
    expect(f.header.height).toBe(1);
    // command bar inner is the second-to-last row (bottom edge at rows-1)
    expect(f.commandBar.y).toBe(30 - 2);
    expect(f.commandBar.height).toBe(1);
    // header & command bar share the right column inner geometry
    expect(f.header.x).toBe(f.list.x);
    expect(f.commandBar.x).toBe(f.list.x);
    expect(f.header.width).toBe(f.list.width);
    expect(f.commandBar.width).toBe(f.list.width);
  });

  it('places the sidebar to the left of the right column with one shared line between', () => {
    const f = computeFrame(input({ columns: 100, rows: 30 }));
    // left frame edge at col 0 → sidebar inner begins at col 1
    expect(f.sidebar.x).toBe(1);
    // shared vertical line sits immediately after the sidebar inner
    const sharedLineX = f.sidebar.x + f.sidebar.width;
    expect(f.handles.sidebar.position).toBe(sharedLineX);
    // right column inner begins one column past the shared line
    expect(f.list.x).toBe(sharedLineX + 1);
  });

  it('accounts for exactly three vertical frame lines (left, shared, right)', () => {
    const cols = 100;
    const f = computeFrame(input({ columns: cols, rows: 30 }));
    // sidebar inner + shared line + right inner + 2 outer edges == cols
    expect(f.sidebar.width + 1 + f.list.width + 2).toBe(cols);
  });

  it('right column inner ends one column before the right frame edge', () => {
    const cols = 100;
    const f = computeFrame(input({ columns: cols, rows: 30 }));
    expect(f.list.x + f.list.width).toBe(cols - 1);
  });
});

describe('computeFrame — vertical split & detail', () => {
  it('list fills the whole body when detail is closed (no list│detail line)', () => {
    const f = computeFrame(input({ rows: 40, showDetail: false }));
    expect(f.detail).toBeNull();
    expect(f.handles.vertical).toBeNull();
    // body = rows - 6 non-body rows (top edge, header inner, header│body line,
    // body│cmd line, command bar inner, bottom edge)
    expect(f.list.height).toBe(40 - 6);
    expect(f.sidebar.height).toBe(40 - 6);
  });

  it('splits list/detail with one shared line consumed when detail is open', () => {
    const f = computeFrame(
      input({ rows: 40, showDetail: true, verticalRatio: 0.4 }),
    );
    expect(f.detail).not.toBeNull();
    const detail = f.detail!;
    const body = 40 - 6;
    // list + detail + 1 shared line == body
    expect(f.list.height + detail.height + 1).toBe(body);
    // detail sits below the list with the shared line between
    expect(f.handles.vertical?.position).toBe(f.list.y + f.list.height);
    expect(detail.y).toBe(f.list.y + f.list.height + 1);
  });

  it('detail gets roughly verticalRatio of the splittable body', () => {
    const f = computeFrame(
      input({ rows: 44, showDetail: true, verticalRatio: 0.5 }),
    );
    const detail = f.detail!;
    const body = 44 - 6; // 38
    const splittable = body - 1; // 37
    // 50% of 37 ≈ 19 (rounded), list gets the rest
    expect(detail.height).toBe(Math.round(splittable * 0.5));
    expect(f.list.height).toBe(splittable - detail.height);
  });

  it('larger verticalRatio gives the detail pane more rows', () => {
    const small = computeFrame(
      input({ rows: 44, showDetail: true, verticalRatio: 0.3 }),
    );
    const large = computeFrame(
      input({ rows: 44, showDetail: true, verticalRatio: 0.7 }),
    );
    const ds = small.detail!;
    const dl = large.detail!;
    expect(dl.height).toBeGreaterThan(ds.height);
  });

  it('sidebar spans the full body height regardless of the list/detail split', () => {
    const f = computeFrame(input({ rows: 40, showDetail: true }));
    expect(f.sidebar.y).toBe(f.list.y);
    expect(f.sidebar.height).toBe(40 - 6);
  });
});

describe('computeFrame — ratio clamps', () => {
  it('clamps the sidebar ratio below MIN_SIDEBAR_RATIO', () => {
    const lo = computeFrame(input({ columns: 400, sidebarRatio: 0.001 }));
    const atMin = computeFrame(
      input({ columns: 400, sidebarRatio: MIN_SIDEBAR_RATIO }),
    );
    expect(lo.sidebar.width).toBe(atMin.sidebar.width);
  });

  it('clamps the sidebar ratio above MAX_SIDEBAR_RATIO', () => {
    const hi = computeFrame(input({ columns: 400, sidebarRatio: 0.99 }));
    const atMax = computeFrame(
      input({ columns: 400, sidebarRatio: MAX_SIDEBAR_RATIO }),
    );
    expect(hi.sidebar.width).toBe(atMax.sidebar.width);
  });

  it('clamps the vertical ratio below MIN_VERTICAL_RATIO', () => {
    const lo = computeFrame(
      input({ rows: 60, showDetail: true, verticalRatio: 0.0 }),
    );
    const atMin = computeFrame(
      input({ rows: 60, showDetail: true, verticalRatio: MIN_VERTICAL_RATIO }),
    );
    const dlo = lo.detail!;
    const dmin = atMin.detail!;
    expect(dlo.height).toBe(dmin.height);
  });

  it('clamps the vertical ratio above MAX_VERTICAL_RATIO', () => {
    const hi = computeFrame(
      input({ rows: 60, showDetail: true, verticalRatio: 1.0 }),
    );
    const atMax = computeFrame(
      input({ rows: 60, showDetail: true, verticalRatio: MAX_VERTICAL_RATIO }),
    );
    const dhi = hi.detail!;
    const dmax = atMax.detail!;
    expect(dhi.height).toBe(dmax.height);
  });
});

describe('computeFrame — minimum sizes', () => {
  it('floors the sidebar inner at MIN_SIDEBAR_INNER on a wide-but-low-ratio terminal', () => {
    // 0.1 of 120 = 12, below the 18-col minimum
    const f = computeFrame(input({ columns: 120, sidebarRatio: 0.1 }));
    expect(f.sidebar.width).toBe(MIN_SIDEBAR_INNER);
  });

  it('never lets the sidebar swallow the entire width on a narrow terminal', () => {
    const f = computeFrame(input({ columns: 20, sidebarRatio: 0.4 }));
    expect(f.list.width).toBeGreaterThanOrEqual(1);
    expect(f.sidebar.width).toBeGreaterThanOrEqual(1);
  });

  it('does not open a detail pane when the body is too short to split', () => {
    // rows - 6 = 2 body rows → cannot fit list + line + detail
    const f = computeFrame(input({ rows: 8, showDetail: true }));
    expect(f.list.height).toBe(2);
    expect(f.detail).toBeNull();
    expect(f.handles.vertical).toBeNull();
  });

  it('reserves at least one row each for list and detail when it does split', () => {
    // rows - 6 = 3 body rows → exactly the minimum that can split (list + line
    // + detail), with each pane floored at one inner row.
    const f = computeFrame(
      input({ rows: 9, showDetail: true, verticalRatio: 0.8 }),
    );
    const detail = f.detail!;
    expect(f.list.height).toBeGreaterThanOrEqual(1);
    expect(detail.height).toBeGreaterThanOrEqual(1);
  });
});

describe('computeFrame — degrades gracefully at extreme sizes', () => {
  const extremes: ComputeFrameInput[] = [
    input({ columns: 1, rows: 1, showDetail: false }),
    input({ columns: 1, rows: 1, showDetail: true }),
    input({ columns: 0, rows: 0, showDetail: true }),
    input({ columns: 3, rows: 4, showDetail: true }),
    input({ columns: 2, rows: 2, showDetail: false }),
  ];

  for (const inp of extremes) {
    it(`never produces negative dimensions at ${String(inp.columns)}x${String(inp.rows)} detail=${String(inp.showDetail)}`, () => {
      expectNonNegative(computeFrame(inp));
    });
  }

  it('collapses header/command-bar height to 0 when there is no body', () => {
    const f = computeFrame(input({ columns: 10, rows: 6, showDetail: false }));
    // rows - 6 = 0 body → header/cmdbar inner collapse
    expect(f.header.height).toBe(0);
    expect(f.commandBar.height).toBe(0);
    expect(f.list.height).toBe(0);
  });
});

describe('computeFrame — no-wrap invariant', () => {
  // The spec forbids any floor that can exceed the real pane. At every size the
  // list/detail/header inner width must stay within the terminal so content
  // can be clipped (never wrapped).
  const sizes: [number, number, boolean][] = [
    [80, 24, false],
    [80, 24, true],
    [120, 40, true],
    [200, 50, true],
    [60, 20, true],
    [40, 12, true],
  ];

  for (const [cols, rows, detail] of sizes) {
    it(`right-column inner never exceeds the terminal at ${String(cols)}x${String(rows)} detail=${String(detail)}`, () => {
      const f = computeFrame(
        input({ columns: cols, rows, showDetail: detail }),
      );
      expect(f.list.x + f.list.width).toBeLessThanOrEqual(cols);
      expect(f.header.x + f.header.width).toBeLessThanOrEqual(cols);
      if (f.detail !== null) {
        expect(f.detail.x + f.detail.width).toBeLessThanOrEqual(cols);
      }
      // and the list never widens to the magic-60 floor on a small terminal
      expect(f.list.width).toBeLessThan(cols);
    });
  }

  it('opening the detail pane does not change the right-column width', () => {
    const closed = computeFrame(
      input({ columns: 100, rows: 40, showDetail: false }),
    );
    const open = computeFrame(
      input({ columns: 100, rows: 40, showDetail: true }),
    );
    expect(open.list.width).toBe(closed.list.width);
    const detail = open.detail!;
    expect(detail.width).toBe(closed.list.width);
  });
});

describe('computeFrame — drag handle segments', () => {
  it('sidebar handle is a vertical line spanning the full body', () => {
    const f = computeFrame(input({ columns: 100, rows: 40, showDetail: true }));
    expect(f.handles.sidebar.orientation).toBe('vertical');
    expect(f.handles.sidebar.start).toBe(f.sidebar.y);
    expect(f.handles.sidebar.end).toBe(f.sidebar.y + f.sidebar.height - 1);
  });

  it('vertical handle is a horizontal line across the right column at the split', () => {
    const f = computeFrame(input({ columns: 100, rows: 40, showDetail: true }));
    const h = f.handles.vertical!;
    expect(h.orientation).toBe('horizontal');
    expect(h.start).toBe(f.list.x);
    expect(h.end).toBe(f.list.x + f.list.width - 1);
    expect(h.position).toBe(f.list.y + f.list.height);
  });

  it('vertical handle is null when detail is closed', () => {
    const f = computeFrame(input({ showDetail: false }));
    expect(f.handles.vertical).toBeNull();
  });
});
