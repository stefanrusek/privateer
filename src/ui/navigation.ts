/**
 * Region-cycle navigation helpers (navigation-overhaul chunk 01).
 *
 * `Tab` / `Shift+Tab` cycle keyboard focus *between* regions; arrows act
 * *within* a region. This module owns the pure cycle math so the controller's
 * wiring stays a thin call. The order is supplied by the caller (it varies with
 * whether the detail pane is open), keeping this helper agnostic of
 * `FocusRegion` specifics.
 */

import type { FocusRegion } from './types.js';

/** The region cycle when the detail pane is open. */
export const REGION_ORDER_WITH_DETAIL: readonly FocusRegion[] = [
  'sidebar',
  'list',
  'detail',
];

/** The region cycle when the detail pane is closed. */
export const REGION_ORDER_NO_DETAIL: readonly FocusRegion[] = [
  'sidebar',
  'list',
];

/** Pick the active region cycle order. */
export function regionOrder(detailVisible: boolean): readonly FocusRegion[] {
  return detailVisible ? REGION_ORDER_WITH_DETAIL : REGION_ORDER_NO_DETAIL;
}

/**
 * The next region in an ordered cycle. `reverse` walks backward (`Shift+Tab`).
 * If `current` is not part of the order (e.g. `commandbar`, which is entered by
 * `/`,`:`/Space and is not in the Tab cycle), movement starts from the first
 * element — forward yields `order[0]`, reverse yields the last element — so
 * `Tab` always lands somewhere sensible.
 */
export function nextRegion(
  order: readonly FocusRegion[],
  current: FocusRegion,
  reverse: boolean,
): FocusRegion {
  // Walking a rotated copy avoids unchecked indexed access: the first element
  // of the rotation is always the desired neighbour (or the cycle edge when
  // `current` is not part of the order — forward lands on the first element,
  // reverse on the last).
  const idx = order.indexOf(current);
  const step = reverse ? order.length - 1 : 1;
  const start =
    idx < 0 ? (reverse ? order.length - 1 : 0) : (idx + step) % order.length;
  const rotated = [...order.slice(start), ...order.slice(0, start)];
  const [first] = rotated;
  return first ?? current;
}
