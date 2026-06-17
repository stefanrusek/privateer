import { describe, it, expect } from 'vitest';
import { absoluteRect, type MeasurableNode } from './measure.js';

/**
 * Build a fake Yoga-like node tree. Each node carries its *own* computed
 * box (left/top relative to its parent, plus width/height) and a link to its
 * parent — exactly the shape `absoluteRect` walks. No real Ink/Yoga needed.
 */
function node(
  box: { left: number; top: number; width: number; height: number },
  parent: MeasurableNode | null = null,
): MeasurableNode {
  return {
    getComputedLeft: () => box.left,
    getComputedTop: () => box.top,
    getComputedWidth: () => box.width,
    getComputedHeight: () => box.height,
    parentNode: parent,
  };
}

describe('absoluteRect', () => {
  it('returns a root node box unchanged (no parent offsets)', () => {
    const root = node({ left: 0, top: 0, width: 80, height: 24 });
    expect(absoluteRect(root)).toEqual({ x: 0, y: 0, width: 80, height: 24 });
  });

  it('sums left/top up a single parent', () => {
    const root = node({ left: 0, top: 0, width: 80, height: 24 });
    const child = node({ left: 10, top: 2, width: 30, height: 8 }, root);
    expect(absoluteRect(child)).toEqual({
      x: 10,
      y: 2,
      width: 30,
      height: 8,
    });
  });

  it('accumulates offsets across the whole parent chain (the spike rect)', () => {
    // header (2 tall) + sidebar (10 wide) → ref box nested under both.
    const root = node({ left: 0, top: 0, width: 80, height: 24 });
    const body = node({ left: 10, top: 2, width: 70, height: 22 }, root);
    const ref = node({ left: 0, top: 0, width: 30, height: 8 }, body);
    expect(absoluteRect(ref)).toEqual({
      x: 10,
      y: 2,
      width: 30,
      height: 8,
    });
  });

  it("uses the leaf node's own width/height, not an ancestor's", () => {
    const root = node({ left: 1, top: 1, width: 100, height: 50 });
    const mid = node({ left: 4, top: 3, width: 40, height: 20 }, root);
    const leaf = node({ left: 2, top: 1, width: 6, height: 1 }, mid);
    expect(absoluteRect(leaf)).toEqual({
      x: 1 + 4 + 2,
      y: 1 + 3 + 1,
      width: 6,
      height: 1,
    });
  });
});
