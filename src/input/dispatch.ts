/**
 * dispatch.ts — the single, pure mouse-routing decision for p9r
 * (navigation-overhaul chunk 04 / B04a).
 *
 * Spec: `specs/navigation-overhaul/04-mouse-interaction.md` ("dispatch.ts").
 *
 * One SGR stdin stream feeds {@link parseSgrMouse}; every resulting
 * {@link MouseEvent} (0-based, after the controller normalizes the 1-based SGR
 * coordinate) is routed through {@link dispatch}. The decision is *pure*: given
 * the event, a snapshot of the currently registered hit targets, and the drag
 * latch, it returns the {@link Action} the controller must execute plus the next
 * latch state. No geometry arithmetic, no side effects.
 *
 * The hit-target {@link Entry} model is deliberately a superset of what B04a
 * registers (frame-derived regions + the two resize handles). B04b's measured
 * `<Button>` / `<SelectableList>` wrappers register `kind:'button'` /
 * `kind:'list'` entries against this *same* snapshot and dispatch the *same*
 * actions — the reducer already routes them, so the measured layer is pure
 * registration on top.
 *
 * Topmost-wins: entries are matched highest `layer` first; among equal layers
 * the **last-registered** entry wins (overlays register after base regions).
 */

import type { FocusRegion } from '../ui/types.js';
import type { MouseEvent } from './mouse.js';

/** A draggable border handle (the two shared frame lines). */
export type HandleId = 'sidebar' | 'vertical';

/** An axis-aligned rectangle in absolute, 0-based terminal coordinates. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * A registered hit target. `kind` selects the dispatch behavior:
 *  - `region` — a focusable layout region; press focuses it, wheel scrolls it.
 *  - `list`   — a region with a row model; press maps to a row (select / open).
 *  - `button` — a discrete leaf; press fires the button's `id` (B04b widgets).
 *  - `handle` — a draggable border line; press begins a resize drag.
 *
 * `region` is set for `region`/`list` entries (drives focus + wheel routing);
 * `handle` is set for `handle` entries; `id` for `button` entries. `rowOffset`
 * (the list's scroll offset) lets the reducer map a local click row to an
 * absolute index without any geometry of its own.
 */
export interface Entry {
  readonly kind: 'region' | 'list' | 'button' | 'handle';
  readonly rect: Rect;
  /** Higher = on top. Base regions are 0; overlays/pickers register higher. */
  readonly layer: number;
  /** Region id for `region` / `list` entries. */
  readonly region?: FocusRegion;
  /** Handle id for `handle` entries. */
  readonly handle?: HandleId;
  /** Button id for `button` entries (B04b). */
  readonly id?: string;
  /** A `list` entry's current scroll offset, added to the local click row. */
  readonly rowOffset?: number;
  /** A `list` entry's currently selected absolute index (drives second-click). */
  readonly selectedIndex?: number;
}

/**
 * Value-equality for two registered {@link Entry} hit targets: every field that
 * the hit-test snapshot depends on must match. Used by the controller to skip
 * notifying `useSyncExternalStore` subscribers when a re-registration replaces
 * an entry with an identical one (the measured wrappers re-measure on each
 * relevant change, but most re-registers land the same rect/layer). A `button`
 * entry's `onClick` is *not* compared — it is looked up by id at press time, so
 * a fresh closure with the same geometry is a no-op for dispatch.
 */
export function entriesEqual(a: Entry, b: Entry): boolean {
  return (
    a.kind === b.kind &&
    a.layer === b.layer &&
    a.region === b.region &&
    a.handle === b.handle &&
    a.id === b.id &&
    a.rowOffset === b.rowOffset &&
    a.selectedIndex === b.selectedIndex &&
    a.rect.x === b.rect.x &&
    a.rect.y === b.rect.y &&
    a.rect.width === b.rect.width &&
    a.rect.height === b.rect.height
  );
}

/** An immutable snapshot of the registered hit targets for one dispatch. */
export type RegistrySnapshot = readonly Entry[];

/**
 * The drag latch: once a `down` lands on a handle, this records it so every
 * subsequent `drag` routes to that handle regardless of where the cursor
 * wanders ("no slip"), until `up`. `null` when no drag is in progress. The
 * reducer is pure — it takes the latch in and returns the next latch out; the
 * controller holds the value between events.
 */
export type DragLatch = { readonly handle: HandleId } | null;

/**
 * The routing decision. Exhaustively switched by the controller (no `default`).
 *
 *  - `focusRegion`   — focus a region (bare region press).
 *  - `selectRow`     — first click on a list row → select it.
 *  - `openDetailRow` — click on the already-selected row → open + focus detail.
 *  - `buttonPress`   — a measured `<Button>` was clicked (B04b).
 *  - `beginDrag`     — a handle was pressed; start resizing.
 *  - `dragTo`        — drag in progress; `ratio` is already clamped by the
 *                      controller's `ratios.ts` call (the reducer emits the raw
 *                      cursor coordinate so the seam stays pure of geometry).
 *  - `endDrag`       — the drag was released.
 *  - `wheel`         — scroll the region under the cursor (focus-independent).
 *  - `none`          — nothing actionable here.
 */
export type Action =
  | { readonly kind: 'focusRegion'; readonly region: FocusRegion }
  | {
      readonly kind: 'selectRow';
      readonly region: FocusRegion;
      readonly index: number;
    }
  | {
      readonly kind: 'openDetailRow';
      readonly region: FocusRegion;
      readonly index: number;
    }
  | { readonly kind: 'buttonPress'; readonly id: string }
  | { readonly kind: 'beginDrag'; readonly handle: HandleId }
  | {
      readonly kind: 'dragTo';
      readonly handle: HandleId;
      readonly x: number;
      readonly y: number;
    }
  | { readonly kind: 'endDrag'; readonly handle: HandleId }
  | {
      readonly kind: 'wheel';
      readonly region: FocusRegion;
      readonly dir: 'up' | 'down';
    }
  | { readonly kind: 'none' };

/** The reducer result: the action to execute plus the next latch state. */
export interface DispatchResult {
  readonly action: Action;
  readonly latch: DragLatch;
}

function contains(rect: Rect, x: number, y: number): boolean {
  return (
    x >= rect.x &&
    x < rect.x + rect.width &&
    y >= rect.y &&
    y < rect.y + rect.height
  );
}

/**
 * Find the topmost entry containing `(x, y)`: highest `layer`, and among equal
 * layers the last-registered (so overlays and later-registered widgets win).
 * Returns `null` when no entry covers the point.
 */
export function topmostAt(
  snapshot: RegistrySnapshot,
  x: number,
  y: number,
): Entry | null {
  let best: Entry | null = null;
  for (const entry of snapshot) {
    if (!contains(entry.rect, x, y)) {
      continue;
    }
    if (best === null || entry.layer >= best.layer) {
      best = entry;
    }
  }
  return best;
}

/**
 * Find the topmost `handle` entry containing the point, treating handles with a
 * **±1-cell tolerance** so the thin border lines are easy to grab. Only handles
 * get the fuzz; everything else uses an exact hit test.
 */
function handleAt(
  snapshot: RegistrySnapshot,
  x: number,
  y: number,
): Entry | null {
  let best: Entry | null = null;
  for (const entry of snapshot) {
    if (entry.kind !== 'handle') {
      continue;
    }
    const fuzzed: Rect = {
      x: entry.rect.x - 1,
      y: entry.rect.y - 1,
      width: entry.rect.width + 2,
      height: entry.rect.height + 2,
    };
    if (!contains(fuzzed, x, y)) {
      continue;
    }
    if (best === null || entry.layer >= best.layer) {
      best = entry;
    }
  }
  return best;
}

/**
 * Resolve the press target at `(x, y)` honoring the **nested-Button winner**
 * rule (B04b): a discrete `button` entry that contains the point wins over the
 * `region`/`list` it visually nests inside, even when both register on the same
 * `layer`. Buttons are non-nestable leaves, so among buttons the ordinary
 * topmost rule applies; if no button covers the point, fall through to the
 * topmost entry of any kind.
 *
 * This keeps the dispatcher free of `if (isButton)` branching: a measured
 * `<Button>` need only register a `button` entry over its region and clicks
 * route to it automatically.
 */
export function pressTarget(
  snapshot: RegistrySnapshot,
  x: number,
  y: number,
): Entry | null {
  let bestButton: Entry | null = null;
  for (const entry of snapshot) {
    if (entry.kind !== 'button' || !contains(entry.rect, x, y)) {
      continue;
    }
    if (bestButton === null || entry.layer >= bestButton.layer) {
      bestButton = entry;
    }
  }
  if (bestButton !== null) {
    return bestButton;
  }
  return topmostAt(snapshot, x, y);
}

/** The topmost `region`/`list` entry under the point (for wheel routing). */
function regionAt(
  snapshot: RegistrySnapshot,
  x: number,
  y: number,
): Entry | null {
  let best: Entry | null = null;
  for (const entry of snapshot) {
    if (entry.kind !== 'region' && entry.kind !== 'list') {
      continue;
    }
    if (!contains(entry.rect, x, y)) {
      continue;
    }
    if (best === null || entry.layer >= best.layer) {
      best = entry;
    }
  }
  return best;
}

/**
 * The press action for a hit `entry` at local-resolved coordinates. Exported for
 * direct testing; `dispatch` calls it for the topmost non-handle hit (handles
 * are routed through the latch path before this is reached, but the `handle`
 * case is kept so the switch stays exhaustive and defensive).
 */
export function pressAction(entry: Entry, x: number, y: number): Action {
  void x;
  switch (entry.kind) {
    case 'handle': {
      const handle = entry.handle ?? 'sidebar';
      return { kind: 'beginDrag', handle };
    }
    case 'button': {
      const id = entry.id ?? '';
      return { kind: 'buttonPress', id };
    }
    case 'region': {
      const region = entry.region ?? 'list';
      return { kind: 'focusRegion', region };
    }
    case 'list': {
      const region = entry.region ?? 'list';
      const offset = entry.rowOffset ?? 0;
      const index = y - entry.rect.y + offset;
      // A click outside the populated row band still focuses the region.
      if (entry.selectedIndex !== undefined && entry.selectedIndex === index) {
        return { kind: 'openDetailRow', region, index };
      }
      return { kind: 'selectRow', region, index };
    }
  }
}

/**
 * Route one mouse event to an {@link Action}. Pure: no geometry beyond rect
 * containment, no side effects. The latch is threaded through so handle drags
 * never slip off the line mid-drag.
 */
export function dispatch(
  event: MouseEvent,
  snapshot: RegistrySnapshot,
  latch: DragLatch,
): DispatchResult {
  switch (event.type) {
    case 'down': {
      // A press on (or within ±1 of) a handle begins a latched drag.
      const handle = handleAt(snapshot, event.x, event.y);
      if (handle !== null) {
        const id = handle.handle ?? 'sidebar';
        return {
          action: { kind: 'beginDrag', handle: id },
          latch: { handle: id },
        };
      }
      // Honor the nested-Button winner rule: a measured Button over a region
      // wins the click even at the same layer.
      const hit = pressTarget(snapshot, event.x, event.y);
      if (hit === null) {
        return { action: { kind: 'none' }, latch };
      }
      return { action: pressAction(hit, event.x, event.y), latch };
    }
    case 'drag': {
      if (latch !== null) {
        return {
          action: {
            kind: 'dragTo',
            handle: latch.handle,
            x: event.x,
            y: event.y,
          },
          latch,
        };
      }
      return { action: { kind: 'none' }, latch };
    }
    case 'up': {
      if (latch !== null) {
        return {
          action: { kind: 'endDrag', handle: latch.handle },
          latch: null,
        };
      }
      return { action: { kind: 'none' }, latch };
    }
    case 'scrollUp':
    case 'scrollDown': {
      const region = regionAt(snapshot, event.x, event.y);
      if (region?.region === undefined) {
        return { action: { kind: 'none' }, latch };
      }
      const dir = event.type === 'scrollUp' ? 'up' : 'down';
      return {
        action: { kind: 'wheel', region: region.region, dir },
        latch,
      };
    }
    case 'move': {
      // Bare motion (no button held) is informational only; ignored here.
      return { action: { kind: 'none' }, latch };
    }
  }
}
