/**
 * ratios.ts — pure pane-ratio derivation from a drag cursor position
 * (navigation-overhaul chunk 04 / B04a).
 *
 * Spec: `specs/002-navigation-overhaul/04-mouse-interaction.md` ("ratios.ts").
 *
 * When the user drags one of the two shared border lines, the controller needs
 * the new pane ratio implied by the cursor's absolute position. These helpers
 * turn an absolute terminal coordinate into the corresponding ratio, clamped to
 * the exact bounds {@link computeFrame} itself clamps to, so the live geometry
 * never disagrees with the value we persist.
 *
 * Both inputs and outputs are pure: the controller feeds the current
 * {@link Frame} (for the available span) and the drag cursor coordinate, and
 * gets back a ratio ready to store and round-trip through `computeFrame`.
 */

import {
  MAX_SIDEBAR_RATIO,
  MAX_VERTICAL_RATIO,
  MIN_SIDEBAR_RATIO,
  MIN_VERTICAL_RATIO,
  type Frame,
} from '../ui/layout-geometry.js';

function clamp(value: number, lo: number, hi: number): number {
  if (value < lo) {
    return lo;
  }
  if (value > hi) {
    return hi;
  }
  return value;
}

/**
 * The sidebar's share of total width implied by dragging its right border to
 * column `x` (absolute, 0-based). `columns` is the full terminal width.
 *
 * `computeFrame` derives the sidebar inner width from `round(ratio * columns)`,
 * so the inverse is `x / columns` (the border sits just right of the sidebar
 * inner, i.e. at the column count the sidebar occupies). Clamped to
 * `[MIN_SIDEBAR_RATIO, MAX_SIDEBAR_RATIO]`.
 */
export function sidebarRatioFromX(columns: number, x: number): number {
  if (columns <= 0) {
    return MIN_SIDEBAR_RATIO;
  }
  return clamp(x / columns, MIN_SIDEBAR_RATIO, MAX_SIDEBAR_RATIO);
}

/**
 * The detail pane's share of the list+detail split implied by dragging the
 * list│detail border to row `y` (absolute, 0-based). Derived from the current
 * frame: the body spans from `frame.list.y` to the bottom of the detail region,
 * and the detail occupies the rows below `y`. Clamped to
 * `[MIN_VERTICAL_RATIO, MAX_VERTICAL_RATIO]`.
 */
export function verticalRatioFromY(frame: Frame, y: number): number {
  const detail = frame.detail;
  if (detail === null) {
    return MIN_VERTICAL_RATIO;
  }
  const bodyTop = frame.list.y;
  const bodyBottom = detail.y + detail.height - 1;
  // The shared line at row `position` plus the rows above/below it make up the
  // splittable span (body rows excluding the single shared line).
  const splittable = bodyBottom - bodyTop;
  if (splittable <= 0) {
    return clamp(0, MIN_VERTICAL_RATIO, MAX_VERTICAL_RATIO);
  }
  // Rows the detail would own if the border landed on row `y`: everything below
  // the new border line down to the bottom of the body.
  const detailRows = bodyBottom - y;
  return clamp(detailRows / splittable, MIN_VERTICAL_RATIO, MAX_VERTICAL_RATIO);
}
