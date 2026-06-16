import { Given, When, Then, Before } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { render } from 'ink-testing-library';
import React from 'react';
import stringWidth from 'string-width';
import type { PrivateerWorld } from '../support/world.js';
import type { ResourceObject } from '../../src/core/types.js';
import { getColumns } from '../../src/resources/columns.js';
import {
  createTableModel,
  applyResourceEvent,
  scrollDown,
  setHorizontalOffset,
} from '../../src/ui/resource-table-model.js';
import type { TableModel } from '../../src/ui/resource-table-model.js';
import {
  naturalWidths,
  pinnedCount,
  clampHOffset,
  resolveRowWindow,
} from '../../src/ui/list-horizontal.js';
import { ResourceTable } from '../../src/ui/components/ResourceTable.js';

// ---------------------------------------------------------------------------
// Per-scenario state (module-local to avoid clashing with other table steps)
// ---------------------------------------------------------------------------

interface HScrollState {
  model: TableModel;
  paneWidth: number;
}

let hs: HScrollState;

Before(function () {
  hs = { model: createTableModel('Pod'), paneWidth: 120 };
});

function makePod(name: string): ResourceObject {
  return {
    uid: `uid-${name}`,
    kind: 'Pod',
    apiVersion: 'v1',
    name,
    namespace: 'default',
    labels: {},
    annotations: {},
    creationTimestamp: '2024-01-01T00:00:00Z',
    resourceVersion: '1',
    status: { color: 'green', label: 'Running' },
    raw: {
      metadata: {
        name,
        namespace: 'default',
        creationTimestamp: '2024-01-01T00:00:00Z',
      },
      status: { phase: 'Running' },
      spec: { nodeName: 'node-a' },
    },
  };
}

// Mirror of the controller's thin horizontal-scroll glue: all math lives in the
// pure list-horizontal module; this only clamps and stores the offset.
function pressArrow(delta: number): void {
  const cols = getColumns(hs.model.kind);
  const widths = naturalWidths(cols);
  const pinned = pinnedCount(cols);
  const next = clampHOffset(
    cols,
    widths,
    pinned,
    hs.paneWidth,
    hs.model.horizontalOffset + delta,
  );
  hs.model = setHorizontalOffset(hs.model, next);
}

function maxOffset(): number {
  const cols = getColumns(hs.model.kind);
  const widths = naturalWidths(cols);
  return clampHOffset(cols, widths, pinnedCount(cols), hs.paneWidth, 9999);
}

function renderFrame(): string {
  const cols = getColumns(hs.model.kind);
  const { lastFrame } = render(
    React.createElement(ResourceTable, {
      model: hs.model,
      columns: cols,
      visibleHeight: 20,
      nowMs: 1700000000000,
      namespace: 'default',
      totalWidth: hs.paneWidth,
      onScrollDown: () => undefined,
      onScrollUp: () => undefined,
      onScrollToStart: () => undefined,
      onScrollToEnd: () => undefined,
      onPageDown: () => undefined,
      onPageUp: () => undefined,
    }),
  );
  return lastFrame() ?? '';
}

function currentWindow() {
  const cols = getColumns(hs.model.kind);
  const widths = naturalWidths(cols);
  return resolveRowWindow(
    cols,
    widths,
    pinnedCount(cols),
    hs.model.horizontalOffset,
    hs.paneWidth,
  );
}

// ---------------------------------------------------------------------------
// Given
// ---------------------------------------------------------------------------

Given(
  'a wide Pod list with a list pane width of {int}',
  function (this: PrivateerWorld, paneWidth: number) {
    let model = createTableModel('Pod');
    for (let i = 0; i < 5; i++) {
      model = applyResourceEvent(
        model,
        { type: 'ADDED', resource: makePod(`pod-${String(i)}`) },
        0,
      );
    }
    hs = { model, paneWidth };
  },
);

Given(
  'the list is at horizontal offset {int}',
  function (this: PrivateerWorld, offset: number) {
    hs.model = setHorizontalOffset(hs.model, offset);
  },
);

Given('the list is scrolled fully to the right', function () {
  hs.model = setHorizontalOffset(hs.model, maxOffset());
});

// ---------------------------------------------------------------------------
// When
// ---------------------------------------------------------------------------

When('I press the right arrow on the list', function () {
  pressArrow(1);
});

When('I press the left arrow on the list', function () {
  pressArrow(-1);
});

When(
  'I press the right arrow on the list until it stops advancing',
  function () {
    let prev = -1;
    while (hs.model.horizontalOffset !== prev) {
      prev = hs.model.horizontalOffset;
      pressArrow(1);
    }
  },
);

When(
  'I switch the active kind to {string}',
  function (this: PrivateerWorld, kind: string) {
    // The controller rebuilds the model on kind change (offset resets to 0).
    hs.model = createTableModel(kind);
  },
);

When('I scroll the selection down several rows', function () {
  hs.model = scrollDown(hs.model, 3);
});

// ---------------------------------------------------------------------------
// Then
// ---------------------------------------------------------------------------

Then('the horizontal offset is {int}', function (offset: number) {
  assert.strictEqual(hs.model.horizontalOffset, offset);
});

Then('later columns become visible', function () {
  const w = currentWindow();
  assert.ok(
    w.leftMore,
    'expected columns to be hidden to the left after scroll',
  );
});

Then('the status dot and Name columns are still shown', function () {
  const w = currentWindow();
  const headers = w.pinned.map((p) => p.col.header);
  assert.ok(headers.includes(''), 'status column must stay pinned');
  assert.ok(headers.includes('Name'), 'Name column must stay pinned');
  const frame = renderFrame();
  assert.ok(frame.includes('●'), 'status dot must render');
  assert.ok(frame.includes('Name'), 'Name header must render');
});

Then('the last column is visible', function () {
  const w = currentWindow();
  const cols = getColumns(hs.model.kind);
  const lastCol = cols[cols.length - 1];
  assert.ok(lastCol !== undefined, 'kind must have at least one column');
  const lastHeader = lastCol.header;
  const shown = [
    ...w.pinned.map((p) => p.col.header),
    ...w.scrollable.map((s) => s.col.header),
  ];
  assert.ok(
    shown.includes(lastHeader),
    `expected last column "${lastHeader}" to be visible`,
  );
});

Then('no columns are hidden to the right', function () {
  assert.strictEqual(currentWindow().rightMore, false);
});

Then('no more-columns markers are shown', function () {
  const w = currentWindow();
  assert.strictEqual(w.leftMore, false);
  assert.strictEqual(w.rightMore, false);
  const frame = renderFrame();
  assert.ok(!frame.includes('‹'), 'no left marker');
  assert.ok(!frame.includes('›'), 'no right marker');
});

Then('no rendered list row exceeds the pane width', function () {
  for (const line of renderFrame().split('\n')) {
    assert.ok(
      stringWidth(line) <= hs.paneWidth,
      `row exceeds pane width ${String(hs.paneWidth)}: "${line}"`,
    );
  }
});

Then('no rendered list row wraps to a second line', function () {
  // ink-testing-library never wraps a Text wider than the (unbounded) virtual
  // terminal, so a wrapped row would appear as an extra line. We assert the row
  // count equals header + data rows for the 5 pods.
  const dataLines = renderFrame()
    .split('\n')
    .filter((l) => l.includes('pod-'));
  assert.strictEqual(
    dataLines.length,
    5,
    'each pod must occupy exactly one row',
  );
});
