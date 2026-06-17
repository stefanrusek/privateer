import { describe, it, expect } from 'vitest';
import {
  dispatch,
  entriesEqual,
  pressAction,
  pressTarget,
  topmostAt,
  type Entry,
  type DragLatch,
  type RegistrySnapshot,
} from './dispatch.js';
import type { MouseEvent } from './mouse.js';

function ev(
  partial: Partial<MouseEvent> & Pick<MouseEvent, 'type'>,
): MouseEvent {
  return {
    type: partial.type,
    button: partial.button ?? 0,
    x: partial.x ?? 0,
    y: partial.y ?? 0,
    shift: partial.shift ?? false,
    meta: partial.meta ?? false,
    ctrl: partial.ctrl ?? false,
  };
}

const region = (
  kind: 'region' | 'list',
  region: 'sidebar' | 'list' | 'detail' | 'commandbar',
  rect: Entry['rect'],
  extra: Partial<Entry> = {},
): Entry => ({ kind, region, rect, layer: 0, ...extra });

const handle = (
  handle: 'sidebar' | 'vertical',
  rect: Entry['rect'],
): Entry => ({ kind: 'handle', handle, rect, layer: 0 });

describe('topmostAt', () => {
  const snap: RegistrySnapshot = [
    region('region', 'list', { x: 0, y: 0, width: 20, height: 10 }),
    region(
      'region',
      'detail',
      { x: 5, y: 5, width: 10, height: 5 },
      { layer: 1 },
    ),
  ];

  it('returns the higher-layer entry when both contain the point', () => {
    expect(topmostAt(snap, 7, 7)?.region).toBe('detail');
  });

  it('returns the only containing entry', () => {
    expect(topmostAt(snap, 1, 1)?.region).toBe('list');
  });

  it('returns null when no entry contains the point', () => {
    expect(topmostAt(snap, 50, 50)).toBeNull();
  });

  it('breaks equal-layer ties by last registered', () => {
    const tied: RegistrySnapshot = [
      region('region', 'list', { x: 0, y: 0, width: 10, height: 10 }),
      region('region', 'detail', { x: 0, y: 0, width: 10, height: 10 }),
    ];
    expect(topmostAt(tied, 5, 5)?.region).toBe('detail');
  });
});

describe('dispatch — press on regions', () => {
  const snap: RegistrySnapshot = [
    region('region', 'sidebar', { x: 0, y: 2, width: 18, height: 20 }),
    region('region', 'commandbar', { x: 0, y: 30, width: 80, height: 1 }),
  ];

  it('focuses a bare region on press', () => {
    const { action, latch } = dispatch(
      ev({ type: 'down', x: 3, y: 4 }),
      snap,
      null,
    );
    expect(action).toEqual({ kind: 'focusRegion', region: 'sidebar' });
    expect(latch).toBeNull();
  });

  it('returns none when the press hits nothing', () => {
    const { action } = dispatch(
      ev({ type: 'down', x: 100, y: 100 }),
      snap,
      null,
    );
    expect(action).toEqual({ kind: 'none' });
  });
});

describe('dispatch — list rows', () => {
  const list = region(
    'list',
    'list',
    { x: 20, y: 3, width: 40, height: 10 },
    {
      rowOffset: 5,
      selectedIndex: 7,
    },
  );
  const snap: RegistrySnapshot = [list];

  it('selects the row under the click (localY + rowOffset)', () => {
    // y=4 → localY=1 → index 1+5=6 (not the selected 7) → selectRow
    const { action } = dispatch(ev({ type: 'down', x: 25, y: 4 }), snap, null);
    expect(action).toEqual({ kind: 'selectRow', region: 'list', index: 6 });
  });

  it('opens detail on a click on the already-selected row', () => {
    // y=5 → localY=2 → index 2+5=7 = selectedIndex → openDetailRow
    const { action } = dispatch(ev({ type: 'down', x: 25, y: 5 }), snap, null);
    expect(action).toEqual({ kind: 'openDetailRow', region: 'list', index: 7 });
  });

  it('selects (does not open) when no selectedIndex is registered', () => {
    const bare = region(
      'list',
      'list',
      { x: 20, y: 3, width: 40, height: 10 },
      {
        rowOffset: 0,
      },
    );
    const { action } = dispatch(
      ev({ type: 'down', x: 25, y: 3 }),
      [bare],
      null,
    );
    expect(action).toEqual({ kind: 'selectRow', region: 'list', index: 0 });
  });

  it('defaults rowOffset to 0 when absent', () => {
    const bare = region('list', 'list', { x: 20, y: 3, width: 40, height: 10 });
    const { action } = dispatch(
      ev({ type: 'down', x: 25, y: 6 }),
      [bare],
      null,
    );
    expect(action).toEqual({ kind: 'selectRow', region: 'list', index: 3 });
  });
});

describe('dispatch — buttons', () => {
  it('fires the button id on press', () => {
    const btn: Entry = {
      kind: 'button',
      id: 'detail-tab-yaml',
      rect: { x: 30, y: 1, width: 8, height: 1 },
      layer: 1,
    };
    const { action } = dispatch(ev({ type: 'down', x: 31, y: 1 }), [btn], null);
    expect(action).toEqual({ kind: 'buttonPress', id: 'detail-tab-yaml' });
  });

  it('defaults to empty id when none registered', () => {
    const btn: Entry = {
      kind: 'button',
      rect: { x: 0, y: 0, width: 4, height: 1 },
      layer: 1,
    };
    const { action } = dispatch(ev({ type: 'down', x: 1, y: 0 }), [btn], null);
    expect(action).toEqual({ kind: 'buttonPress', id: '' });
  });

  it('a button exactly under the point wins over a handle’s ±1 grab (B3a)', () => {
    // The detail tab bar sits one row below the list│detail divider, so the
    // divider's fuzzy grab would otherwise swallow tab clicks as a drag.
    const divider = handle('vertical', { x: 20, y: 12, width: 40, height: 1 });
    const tabButton: Entry = {
      kind: 'button',
      id: 'tab.yaml',
      rect: { x: 30, y: 13, width: 6, height: 1 }, // row 13 = divider y+1 (fuzz)
      layer: 10,
    };
    const { action, latch } = dispatch(
      ev({ type: 'down', x: 32, y: 13 }),
      [divider, tabButton],
      null,
    );
    expect(action).toEqual({ kind: 'buttonPress', id: 'tab.yaml' });
    expect(latch).toBeNull();
  });

  it('among overlapping exact buttons the higher layer wins over a handle', () => {
    const divider = handle('vertical', { x: 20, y: 12, width: 40, height: 1 });
    const lower: Entry = {
      kind: 'button',
      id: 'low',
      rect: { x: 30, y: 13, width: 6, height: 1 },
      layer: 0,
    };
    const higher: Entry = {
      kind: 'button',
      id: 'high',
      rect: { x: 30, y: 13, width: 6, height: 1 },
      layer: 10,
    };
    const { action } = dispatch(
      ev({ type: 'down', x: 32, y: 13 }),
      [divider, lower, higher],
      null,
    );
    expect(action).toEqual({ kind: 'buttonPress', id: 'high' });
  });

  it('still grabs the handle when no button is exactly under the point', () => {
    const divider = handle('vertical', { x: 20, y: 12, width: 40, height: 1 });
    const tabButton: Entry = {
      kind: 'button',
      id: 'tab.yaml',
      rect: { x: 30, y: 13, width: 6, height: 1 },
      layer: 10,
    };
    // x=25,y=13 is in the divider's fuzz but not on the button → drag.
    const { action, latch } = dispatch(
      ev({ type: 'down', x: 25, y: 13 }),
      [divider, tabButton],
      null,
    );
    expect(action).toEqual({ kind: 'beginDrag', handle: 'vertical' });
    expect(latch).toEqual({ handle: 'vertical' });
  });
});

describe('dispatch — drag-resize latch', () => {
  const sidebarHandle = handle('sidebar', {
    x: 18,
    y: 2,
    width: 1,
    height: 20,
  });
  const verticalHandle = handle('vertical', {
    x: 20,
    y: 12,
    width: 40,
    height: 1,
  });
  const snap: RegistrySnapshot = [
    region('region', 'sidebar', { x: 0, y: 2, width: 18, height: 20 }),
    sidebarHandle,
    verticalHandle,
  ];

  it('begins a drag and latches when pressing on the sidebar handle', () => {
    const { action, latch } = dispatch(
      ev({ type: 'down', x: 18, y: 5 }),
      snap,
      null,
    );
    expect(action).toEqual({ kind: 'beginDrag', handle: 'sidebar' });
    expect(latch).toEqual({ handle: 'sidebar' });
  });

  it('defaults a pressed handle with no handle id to sidebar', () => {
    const noId: Entry = {
      kind: 'handle',
      rect: { x: 10, y: 0, width: 1, height: 10 },
      layer: 0,
    };
    const { action, latch } = dispatch(
      ev({ type: 'down', x: 10, y: 5 }),
      [noId],
      null,
    );
    expect(action).toEqual({ kind: 'beginDrag', handle: 'sidebar' });
    expect(latch).toEqual({ handle: 'sidebar' });
  });

  it('grabs the handle with ±1-cell tolerance', () => {
    // x=17 is one cell left of the handle at x=18 — still a grab.
    const { action } = dispatch(ev({ type: 'down', x: 17, y: 5 }), snap, null);
    expect(action).toEqual({ kind: 'beginDrag', handle: 'sidebar' });
  });

  it('routes drags to the latched handle regardless of cursor (no slip)', () => {
    const latch: DragLatch = { handle: 'vertical' };
    // Cursor wanders far from the handle, but the latch wins.
    const { action, latch: next } = dispatch(
      ev({ type: 'drag', x: 99, y: 40 }),
      snap,
      latch,
    );
    expect(action).toEqual({
      kind: 'dragTo',
      handle: 'vertical',
      x: 99,
      y: 40,
    });
    expect(next).toEqual({ handle: 'vertical' });
  });

  it('ends the drag and clears the latch on release', () => {
    const latch: DragLatch = { handle: 'sidebar' };
    const { action, latch: next } = dispatch(
      ev({ type: 'up', x: 25, y: 5 }),
      snap,
      latch,
    );
    expect(action).toEqual({ kind: 'endDrag', handle: 'sidebar' });
    expect(next).toBeNull();
  });

  it('ignores drag events with no active latch', () => {
    const { action } = dispatch(ev({ type: 'drag', x: 25, y: 5 }), snap, null);
    expect(action).toEqual({ kind: 'none' });
  });

  it('ignores release events with no active latch', () => {
    const { action, latch } = dispatch(
      ev({ type: 'up', x: 25, y: 5 }),
      snap,
      null,
    );
    expect(action).toEqual({ kind: 'none' });
    expect(latch).toBeNull();
  });

  it('prefers a handle over a region when both are under the press', () => {
    // The sidebar region and the sidebar handle overlap at the ±1 fuzz edge.
    const overlap: RegistrySnapshot = [
      region('region', 'list', { x: 0, y: 0, width: 40, height: 40 }),
      handle('sidebar', { x: 18, y: 0, width: 1, height: 40 }),
    ];
    const { action } = dispatch(
      ev({ type: 'down', x: 18, y: 5 }),
      overlap,
      null,
    );
    expect(action).toEqual({ kind: 'beginDrag', handle: 'sidebar' });
  });

  it('breaks equal-layer handle ties by last registered', () => {
    const two: RegistrySnapshot = [
      handle('sidebar', { x: 10, y: 0, width: 1, height: 10 }),
      handle('vertical', { x: 10, y: 0, width: 1, height: 10 }),
    ];
    const { action } = dispatch(ev({ type: 'down', x: 10, y: 5 }), two, null);
    expect(action).toEqual({ kind: 'beginDrag', handle: 'vertical' });
  });
});

describe('dispatch — wheel routes by cursor position', () => {
  const snap: RegistrySnapshot = [
    region('region', 'sidebar', { x: 0, y: 2, width: 18, height: 20 }),
    region('list', 'list', { x: 20, y: 3, width: 40, height: 6 }),
    region('region', 'detail', { x: 20, y: 10, width: 40, height: 10 }),
  ];

  it('scrolls the detail region when the cursor is over detail', () => {
    const { action } = dispatch(
      ev({ type: 'scrollDown', x: 25, y: 12 }),
      snap,
      null,
    );
    expect(action).toEqual({ kind: 'wheel', region: 'detail', dir: 'down' });
  });

  it('scrolls the list when the cursor is over the list', () => {
    const { action } = dispatch(
      ev({ type: 'scrollUp', x: 25, y: 4 }),
      snap,
      null,
    );
    expect(action).toEqual({ kind: 'wheel', region: 'list', dir: 'up' });
  });

  it('scrolls the sidebar when over the sidebar', () => {
    const { action } = dispatch(
      ev({ type: 'scrollDown', x: 3, y: 5 }),
      snap,
      null,
    );
    expect(action).toEqual({ kind: 'wheel', region: 'sidebar', dir: 'down' });
  });

  it('ignores the wheel when over nothing', () => {
    const { action } = dispatch(
      ev({ type: 'scrollDown', x: 99, y: 99 }),
      snap,
      null,
    );
    expect(action).toEqual({ kind: 'none' });
  });

  it('resolves the wheel to the topmost of two overlapping regions', () => {
    const stacked: RegistrySnapshot = [
      region('region', 'list', { x: 0, y: 0, width: 40, height: 20 }),
      region(
        'region',
        'detail',
        { x: 0, y: 0, width: 40, height: 20 },
        { layer: 1 },
      ),
    ];
    const { action } = dispatch(
      ev({ type: 'scrollDown', x: 5, y: 5 }),
      stacked,
      null,
    );
    expect(action).toEqual({ kind: 'wheel', region: 'detail', dir: 'down' });
  });

  it('skips non-region entries (buttons/handles) when resolving the wheel', () => {
    // A button and a handle sit over the cursor, but only the underlying region
    // takes the wheel — the others must be skipped, not chosen.
    const withChrome: RegistrySnapshot = [
      region('region', 'detail', { x: 0, y: 0, width: 40, height: 20 }),
      handle('vertical', { x: 0, y: 5, width: 40, height: 1 }),
      {
        kind: 'button',
        id: 'x',
        rect: { x: 0, y: 0, width: 4, height: 1 },
        layer: 1,
      },
    ];
    const { action } = dispatch(
      ev({ type: 'scrollUp', x: 2, y: 5 }),
      withChrome,
      null,
    );
    expect(action).toEqual({ kind: 'wheel', region: 'detail', dir: 'up' });
  });

  it('ignores the wheel when the topmost entry has no region', () => {
    // A region-kind entry with no region id (defensive) yields none.
    const noRegion: Entry = {
      kind: 'region',
      rect: { x: 0, y: 0, width: 10, height: 10 },
      layer: 0,
    };
    const { action } = dispatch(
      ev({ type: 'scrollUp', x: 5, y: 5 }),
      [noRegion],
      null,
    );
    expect(action).toEqual({ kind: 'none' });
  });
});

describe('dispatch — motion is ignored', () => {
  it('returns none for a bare move event', () => {
    const { action, latch } = dispatch(
      ev({ type: 'move', x: 5, y: 5 }),
      [],
      null,
    );
    expect(action).toEqual({ kind: 'none' });
    expect(latch).toBeNull();
  });
});

describe('pressAction — direct (exhaustive switch)', () => {
  it('handles a handle entry (defensive path)', () => {
    expect(
      pressAction(
        handle('vertical', { x: 0, y: 0, width: 1, height: 1 }),
        0,
        0,
      ),
    ).toEqual({ kind: 'beginDrag', handle: 'vertical' });
  });

  it('defaults a handle entry with no handle id to sidebar', () => {
    const h: Entry = {
      kind: 'handle',
      rect: { x: 0, y: 0, width: 1, height: 1 },
      layer: 0,
    };
    expect(pressAction(h, 0, 0)).toEqual({
      kind: 'beginDrag',
      handle: 'sidebar',
    });
  });

  it('defaults a region entry with no region id to list', () => {
    const r: Entry = {
      kind: 'region',
      rect: { x: 0, y: 0, width: 1, height: 1 },
      layer: 0,
    };
    expect(pressAction(r, 0, 0)).toEqual({
      kind: 'focusRegion',
      region: 'list',
    });
  });

  it('defaults a list entry with no region id to list', () => {
    const l: Entry = {
      kind: 'list',
      rect: { x: 0, y: 3, width: 10, height: 5 },
      layer: 0,
    };
    expect(pressAction(l, 0, 3)).toEqual({
      kind: 'selectRow',
      region: 'list',
      index: 0,
    });
  });
});

describe('pressTarget (nested-Button winner)', () => {
  const regionEntry: Entry = {
    kind: 'region',
    region: 'detail',
    rect: { x: 0, y: 0, width: 40, height: 10 },
    layer: 0,
  };
  const tab: Entry = {
    kind: 'button',
    id: 'tab.yaml',
    rect: { x: 2, y: 0, width: 6, height: 1 },
    layer: 0,
  };

  it('returns the topmost entry when no button covers the point', () => {
    expect(pressTarget([regionEntry, tab], 20, 5)).toBe(regionEntry);
  });

  it('lets a nested button win over the region at the same layer', () => {
    // Region registered AFTER the button — yet the button still wins the click.
    expect(pressTarget([tab, regionEntry], 3, 0)).toBe(tab);
  });

  it('returns null when nothing covers the point', () => {
    expect(pressTarget([regionEntry, tab], 100, 100)).toBeNull();
  });

  it('among overlapping buttons the topmost layer wins', () => {
    const overlay: Entry = {
      kind: 'button',
      id: 'item.0',
      rect: { x: 2, y: 0, width: 6, height: 1 },
      layer: 5,
    };
    expect(pressTarget([tab, overlay], 3, 0)).toBe(overlay);
  });

  it('dispatch routes a press through the nested-button winner', () => {
    const snapshot: RegistrySnapshot = [tab, regionEntry];
    const r = dispatch(ev({ type: 'down', x: 3, y: 0 }), snapshot, null);
    expect(r.action).toEqual({ kind: 'buttonPress', id: 'tab.yaml' });
  });
});

describe('entriesEqual', () => {
  const base: Entry = {
    kind: 'list',
    region: 'list',
    handle: 'sidebar',
    id: 'list.list',
    rowOffset: 3,
    selectedIndex: 5,
    layer: 0,
    rect: { x: 1, y: 2, width: 40, height: 10 },
  };
  type EntryOver = Partial<Omit<Entry, 'rect'>> & {
    readonly rect?: Partial<Entry['rect']>;
  };
  const clone = (over: EntryOver): Entry => ({
    ...base,
    ...over,
    rect: { ...base.rect, ...(over.rect ?? {}) },
  });

  it('is true for two value-equal entries (distinct objects)', () => {
    expect(entriesEqual(base, clone({}))).toBe(true);
  });

  it.each<[string, EntryOver]>([
    ['kind', { kind: 'region' }],
    ['layer', { layer: 1 }],
    ['region', { region: 'sidebar' }],
    ['handle', { handle: 'vertical' }],
    ['id', { id: 'other' }],
    ['rowOffset', { rowOffset: 4 }],
    ['selectedIndex', { selectedIndex: 6 }],
    ['rect.x', { rect: { x: 99 } }],
    ['rect.y', { rect: { y: 99 } }],
    ['rect.width', { rect: { width: 99 } }],
    ['rect.height', { rect: { height: 99 } }],
  ])('is false when %s differs', (_field, over) => {
    expect(entriesEqual(base, clone(over))).toBe(false);
  });
});
