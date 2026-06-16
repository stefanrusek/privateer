/**
 * measure.ts — pure absolute-rect measurement over a Yoga-like node tree
 * (navigation-overhaul chunk 04 / B04b).
 *
 * Spec: `specs/navigation-overhaul/04-mouse-interaction.md` ("measure.ts").
 *
 * The one piece of geometry the framework computes for us. A measured
 * `<Button>` attaches a ref to a `<Box>`; in a post-commit `useEffect` the
 * wrapper reads `ref.current.yogaNode` and calls {@link absoluteRect} to learn
 * the box's *absolute* terminal rect — without recomputing any layout itself.
 *
 * The function takes an abstract {@link MeasurableNode} (`getComputedLeft/Top/
 * Width/Height` + `parentNode`) so it is unit-tested against a **fake** tree;
 * the real Yoga node satisfies this shape and is exercised by BDD/tmux. The
 * spike (chunk 04, S0) proved the real walk matches this pure one exactly.
 */

import type { Rect } from './dispatch.js';

/**
 * The minimal Yoga-node surface {@link absoluteRect} needs: a node's own
 * computed box (relative to its parent) plus a link up the chain. Yoga's real
 * node satisfies this; tests pass a fake.
 */
export interface MeasurableNode {
  getComputedLeft(): number;
  getComputedTop(): number;
  getComputedWidth(): number;
  getComputedHeight(): number;
  readonly parentNode: MeasurableNode | null;
}

/**
 * Compute a node's absolute rect by summing `getComputedLeft()/getComputedTop()`
 * up the `parentNode` chain; width/height come from the node itself. Coordinates
 * are 0-based and align with `computeFrame`'s `Rect`s (the same base the
 * dispatcher uses), so a measured rect can be registered directly.
 */
export function absoluteRect(node: MeasurableNode): Rect {
  let x = 0;
  let y = 0;
  let cursor: MeasurableNode | null = node;
  while (cursor !== null) {
    x += cursor.getComputedLeft();
    y += cursor.getComputedTop();
    cursor = cursor.parentNode;
  }
  return {
    x,
    y,
    width: node.getComputedWidth(),
    height: node.getComputedHeight(),
  };
}
