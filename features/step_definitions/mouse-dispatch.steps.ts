import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { parseSgrMouseChunk } from '../../src/input/mouse.js';
import {
  dispatch,
  type Action,
  type DragLatch,
  type Entry,
  type RegistrySnapshot,
} from '../../src/input/dispatch.js';
import { computeFrame, type Frame } from '../../src/ui/layout-geometry.js';
import {
  sidebarRatioFromX,
  verticalRatioFromY,
} from '../../src/input/ratios.js';

// ---------------------------------------------------------------------------
// One SGR stream (chunk splitter)
// ---------------------------------------------------------------------------

let chunkTypes: string[] = [];

When('I receive the stdin chunk {string}', function (raw: string) {
  const chunk = raw.replace(/<ESC>/g, '\x1b');
  chunkTypes = parseSgrMouseChunk(chunk).map((e) => e.type);
});

Then('the chunk yields the mouse event types {string}', function (csv: string) {
  const expected = csv.split(',').map((s) => s.trim());
  assert.deepEqual(chunkTypes, expected);
});

// ---------------------------------------------------------------------------
// Dispatch over a frame-derived registry
// ---------------------------------------------------------------------------

let frame: Frame;
let snapshot: RegistrySnapshot = [];
let latch: DragLatch = null;
let lastAction: Action = { kind: 'none' };

function buildSnapshot(f: Frame): RegistrySnapshot {
  const entries: Entry[] = [
    {
      kind: 'list',
      region: 'sidebar',
      rect: f.sidebar,
      layer: 0,
      rowOffset: 0,
    },
    {
      kind: 'list',
      region: 'list',
      rect: f.list,
      layer: 0,
      rowOffset: 0,
      selectedIndex: 0,
    },
    {
      kind: 'handle',
      handle: 'sidebar',
      rect: {
        x: f.handles.sidebar.position,
        y: f.handles.sidebar.start,
        width: 1,
        height: f.handles.sidebar.end - f.handles.sidebar.start + 1,
      },
      layer: 0,
    },
  ];
  if (f.detail !== null) {
    entries.push({
      kind: 'region',
      region: 'detail',
      rect: f.detail,
      layer: 0,
    });
  }
  if (f.handles.vertical !== null) {
    const v = f.handles.vertical;
    entries.push({
      kind: 'handle',
      handle: 'vertical',
      rect: {
        x: v.start,
        y: v.position,
        width: v.end - v.start + 1,
        height: 1,
      },
      layer: 0,
    });
  }
  return entries;
}

Given(
  'a frame {int} cols by {int} rows with the detail pane open',
  function (cols: number, rows: number) {
    frame = computeFrame({
      columns: cols,
      rows,
      sidebarRatio: 0.2,
      verticalRatio: 0.5,
      showDetail: true,
    });
    snapshot = buildSnapshot(frame);
    latch = null;
    lastAction = { kind: 'none' };
  },
);

function ev(
  type: 'down' | 'up' | 'drag' | 'scrollUp' | 'scrollDown',
  x: number,
  y: number,
) {
  return { type, button: 0, x, y, shift: false, meta: false, ctrl: false };
}

When('I wheel {word} at the detail pane', function (dir: string) {
  const d = frame.detail;
  assert.ok(d !== null);
  const type = dir === 'up' ? 'scrollUp' : 'scrollDown';
  const r = dispatch(ev(type, d.x + 1, d.y + 1), snapshot, latch);
  lastAction = r.action;
  latch = r.latch;
});

When('I wheel {word} at the list', function (dir: string) {
  const type = dir === 'up' ? 'scrollUp' : 'scrollDown';
  const r = dispatch(
    ev(type, frame.list.x + 1, frame.list.y + 1),
    snapshot,
    latch,
  );
  lastAction = r.action;
  latch = r.latch;
});

When('I press the list│detail border', function () {
  const v = frame.handles.vertical;
  assert.ok(v !== null);
  const r = dispatch(ev('down', v.start + 2, v.position), snapshot, latch);
  lastAction = r.action;
  latch = r.latch;
});

When(
  'I drag one column to the side and down to row {int}',
  function (row: number) {
    const v = frame.handles.vertical;
    assert.ok(v !== null);
    const r = dispatch(ev('drag', v.start + 1, row), snapshot, latch);
    lastAction = r.action;
    latch = r.latch;
  },
);

When('I click the selected list row again', function () {
  const r = dispatch(
    ev('down', frame.list.x + 1, frame.list.y),
    snapshot,
    latch,
  );
  lastAction = r.action;
  latch = r.latch;
});

/** The action kind, read without narrowing (eslint-friendly). */
function actionField(key: string): unknown {
  return (lastAction as unknown as Record<string, unknown>)[key];
}

Then('the action is a wheel on {string}', function (region: string) {
  assert.equal(actionField('kind'), 'wheel');
  assert.equal(actionField('region'), region);
});

Then('the action begins a {string} drag', function (handle: string) {
  assert.equal(actionField('kind'), 'beginDrag');
  assert.equal(actionField('handle'), handle);
  assert.deepEqual(latch, { handle });
});

Then('the action drags the {string} handle', function (handle: string) {
  assert.equal(actionField('kind'), 'dragTo');
  assert.equal(actionField('handle'), handle);
});

Then('the action selects row {int}', function (index: number) {
  assert.equal(actionField('kind'), 'selectRow');
  assert.equal(actionField('index'), index);
});

Then('the action opens detail for row {int}', function (index: number) {
  assert.equal(actionField('kind'), 'openDetailRow');
  assert.equal(actionField('index'), index);
});

// ---------------------------------------------------------------------------
// Ratios stay within the documented clamp bounds
// ---------------------------------------------------------------------------

Then(
  'the derived sidebar ratio at x {int} is within bounds',
  function (x: number) {
    const r = sidebarRatioFromX(frame.list.x + frame.list.width, x);
    assert.ok(r >= 0.1 && r <= 0.4, `ratio ${String(r)} out of [0.1, 0.4]`);
  },
);

Then(
  'the derived vertical ratio at y {int} is within bounds',
  function (y: number) {
    const r = verticalRatioFromY(frame, y);
    assert.ok(r >= 0.2 && r <= 0.8, `ratio ${String(r)} out of [0.2, 0.8]`);
  },
);

// NOTE: the mouse-mode teardown invariant (every exit/suspend path disables all
// modes; idempotent) is owned by the adapter unit test
// src/adapters/live/mouse-lifecycle.test.ts — BDD step files may not import from
// src/adapters/** (Spec 08 §6.1 boundary rule).
