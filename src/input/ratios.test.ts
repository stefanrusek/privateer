import { describe, it, expect } from 'vitest';
import { sidebarRatioFromX, verticalRatioFromY } from './ratios.js';
import {
  computeFrame,
  MAX_SIDEBAR_RATIO,
  MAX_VERTICAL_RATIO,
  MIN_SIDEBAR_RATIO,
  MIN_VERTICAL_RATIO,
  type Frame,
} from '../ui/layout-geometry.js';

describe('sidebarRatioFromX', () => {
  it('returns x/columns within the clamp bounds', () => {
    // 30/100 = 0.30, inside [0.1, 0.4]
    expect(sidebarRatioFromX(100, 30)).toBeCloseTo(0.3, 5);
  });

  it('clamps below MIN_SIDEBAR_RATIO', () => {
    expect(sidebarRatioFromX(100, 2)).toBe(MIN_SIDEBAR_RATIO);
  });

  it('clamps above MAX_SIDEBAR_RATIO', () => {
    expect(sidebarRatioFromX(100, 90)).toBe(MAX_SIDEBAR_RATIO);
  });

  it('returns MIN_SIDEBAR_RATIO for non-positive columns', () => {
    expect(sidebarRatioFromX(0, 30)).toBe(MIN_SIDEBAR_RATIO);
  });

  it('round-trips: a dragged ratio re-derives a sidebar near the drag x', () => {
    const cols = 120;
    const ratio = sidebarRatioFromX(cols, 36);
    const frame = computeFrame({
      columns: cols,
      rows: 40,
      sidebarRatio: ratio,
      verticalRatio: 0.5,
      showDetail: true,
    });
    // The sidebar│right line sits at the column just past the sidebar inner.
    expect(frame.handles.sidebar.position).toBeGreaterThanOrEqual(34);
    expect(frame.handles.sidebar.position).toBeLessThanOrEqual(38);
  });
});

function detailFrame(): Frame {
  return computeFrame({
    columns: 120,
    rows: 40,
    sidebarRatio: 0.2,
    verticalRatio: 0.5,
    showDetail: true,
  });
}

describe('verticalRatioFromY', () => {
  it('grows detail as the border drags up (smaller y)', () => {
    const frame = detailFrame();
    const high = verticalRatioFromY(frame, frame.list.y + 2);
    const low = verticalRatioFromY(frame, frame.list.y + 10);
    // A border higher up (smaller y) leaves more rows below = bigger detail.
    expect(high).toBeGreaterThan(low);
  });

  it('clamps to [MIN_VERTICAL_RATIO, MAX_VERTICAL_RATIO]', () => {
    const frame = detailFrame();
    const detail = frame.detail;
    expect(detail).not.toBeNull();
    if (detail === null) {
      return;
    }
    const bottom = detail.y + detail.height - 1;
    // Border at the very top of the body → detail would own everything → clamp.
    expect(verticalRatioFromY(frame, frame.list.y - 100)).toBe(
      MAX_VERTICAL_RATIO,
    );
    // Border below the body → detail owns ~nothing → clamp to min.
    expect(verticalRatioFromY(frame, bottom + 100)).toBe(MIN_VERTICAL_RATIO);
  });

  it('returns MIN_VERTICAL_RATIO when the detail pane is closed', () => {
    const frame = computeFrame({
      columns: 120,
      rows: 40,
      sidebarRatio: 0.2,
      verticalRatio: 0.5,
      showDetail: false,
    });
    expect(frame.detail).toBeNull();
    expect(verticalRatioFromY(frame, 10)).toBe(MIN_VERTICAL_RATIO);
  });

  it('tolerates a degenerate (zero-splittable) body', () => {
    // A tiny terminal makes the detail region a single row; the helper must not
    // divide by zero and must stay within the clamp bounds.
    const frame: Frame = {
      header: { x: 1, y: 1, width: 5, height: 1 },
      sidebar: { x: 1, y: 3, width: 5, height: 1 },
      list: { x: 7, y: 3, width: 5, height: 1 },
      detail: { x: 7, y: 3, width: 5, height: 1 },
      commandBar: { x: 7, y: 4, width: 5, height: 1 },
      handles: {
        sidebar: {
          orientation: 'vertical',
          position: 6,
          start: 3,
          end: 3,
        },
        vertical: {
          orientation: 'horizontal',
          position: 3,
          start: 7,
          end: 11,
        },
      },
    };
    const r = verticalRatioFromY(frame, 3);
    expect(r).toBeGreaterThanOrEqual(MIN_VERTICAL_RATIO);
    expect(r).toBeLessThanOrEqual(MAX_VERTICAL_RATIO);
  });
});
