import { Given, When, Then, Before } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { render } from 'ink-testing-library';
import React from 'react';
import type { PrivateerWorld } from '../support/world.js';
import type { ResourceObject } from '../../src/core/types.js';
import { getColumns } from '../../src/resources/columns.js';
import { FakeClock } from '../../src/boundaries/clock.fake.js';
import {
  createTableModel,
  applyResourceEvent,
  applySearch,
  applySort,
  getSortedFilteredRows,
  scrollDown,
  scrollUp,
  scrollToStart,
  scrollToEnd,
  tickAnimations,
} from '../../src/ui/resource-table-model.js';
import type { TableModel } from '../../src/ui/resource-table-model.js';
import { ResourceTable } from '../../src/ui/components/ResourceTable.js';

// ---------------------------------------------------------------------------
// World augmentation
// ---------------------------------------------------------------------------

declare module '../support/world.js' {
  interface PrivateerWorld {
    tableModel: TableModel;
    tableFrame: string;
    tableScrollOffset: number;
    tableVisibleHeight: number;
    fakeClock: FakeClock;
  }
}

// ---------------------------------------------------------------------------
// Reset per-scenario state
// ---------------------------------------------------------------------------

let keyWasPressed = false;

Before(function (this: PrivateerWorld) {
  this.tableModel = createTableModel('Deployment');
  this.tableFrame = '';
  this.tableScrollOffset = 0;
  this.tableVisibleHeight = 20;
  this.fakeClock = new FakeClock(0);
  keyWasPressed = false;
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function noop(): void {
  return;
}

function makeResource(
  name: string,
  namespace: string,
  statusColor: 'green' | 'yellow' | 'red' | 'grey' = 'green',
): ResourceObject {
  const uid = `uid-${name}`;
  return {
    uid,
    kind: 'Deployment',
    apiVersion: 'apps/v1',
    name,
    namespace,
    labels: {},
    annotations: {},
    creationTimestamp: '2024-01-01T00:00:00Z',
    resourceVersion: '1',
    status: { color: statusColor, label: 'Ready' },
    raw: {
      metadata: {
        name,
        namespace,
        creationTimestamp: '2024-01-01T00:00:00Z',
      },
    },
  };
}

function renderTableFrame(
  model: TableModel,
  visibleHeight: number,
  namespace: string,
): string {
  const cols = getColumns(model.kind);
  const { lastFrame } = render(
    React.createElement(ResourceTable, {
      model,
      columns: cols,
      visibleHeight,
      nowMs: 1700000000000,
      namespace,
      onScrollDown: noop,
      onScrollUp: noop,
      onScrollToStart: noop,
      onScrollToEnd: noop,
      onPageDown: noop,
      onPageUp: noop,
    }),
  );
  return lastFrame() ?? '';
}

// ---------------------------------------------------------------------------
// Given steps
// ---------------------------------------------------------------------------

Given(
  'a ResourceTable for kind {string} with {int} resource named {string} in namespace {string}',
  function (
    this: PrivateerWorld,
    kind: string,
    _count: number,
    name: string,
    namespace: string,
  ) {
    this.tableModel = createTableModel(kind);
    const r = makeResource(name, namespace);
    this.tableModel = applyResourceEvent(
      this.tableModel,
      { type: 'ADDED', resource: r },
      0,
    );
    this.tableFrame = renderTableFrame(
      this.tableModel,
      this.tableVisibleHeight,
      namespace,
    );
  },
);

Given(
  'a ResourceTable for kind {string} with {int} resources in namespace {string}',
  function (
    this: PrivateerWorld,
    kind: string,
    count: number,
    namespace: string,
  ) {
    this.tableModel = createTableModel(kind);
    for (let i = 0; i < count; i++) {
      const r = makeResource(`resource-${String(i)}`, namespace);
      this.tableModel = applyResourceEvent(
        this.tableModel,
        { type: 'ADDED', resource: r },
        0,
      );
    }
    if (count === 0) {
      this.tableModel = { ...this.tableModel, loadState: 'ready' };
    }
    this.tableFrame = renderTableFrame(
      this.tableModel,
      this.tableVisibleHeight,
      namespace,
    );
  },
);

Given(
  'a ResourceTable for kind {string} with {int} resources',
  function (this: PrivateerWorld, kind: string, count: number) {
    this.tableModel = createTableModel(kind);
    for (let i = 0; i < count; i++) {
      const r = makeResource(`resource-${String(i)}`, 'default');
      this.tableModel = applyResourceEvent(
        this.tableModel,
        { type: 'ADDED', resource: r },
        0,
      );
    }
    if (count === 0) {
      this.tableModel = { ...this.tableModel, loadState: 'ready' };
    }
    this.tableFrame = renderTableFrame(
      this.tableModel,
      this.tableVisibleHeight,
      'default',
    );
  },
);

Given(
  'a ResourceTable for kind {string} with resources named {string} and {string}',
  function (this: PrivateerWorld, kind: string, name1: string, name2: string) {
    this.tableModel = createTableModel(kind);
    const r1 = makeResource(name1, 'default');
    const r2 = makeResource(name2, 'default');
    this.tableModel = applyResourceEvent(
      this.tableModel,
      { type: 'ADDED', resource: r1 },
      0,
    );
    this.tableModel = applyResourceEvent(
      this.tableModel,
      { type: 'ADDED', resource: r2 },
      0,
    );
    this.tableFrame = renderTableFrame(
      this.tableModel,
      this.tableVisibleHeight,
      'default',
    );
  },
);

Given(
  'a ResourceTable for kind {string} with a red pod {string} and a green pod {string}',
  function (
    this: PrivateerWorld,
    kind: string,
    redName: string,
    greenName: string,
  ) {
    this.tableModel = createTableModel(kind);
    const redPod = makeResource(redName, 'default', 'red');
    const greenPod = makeResource(greenName, 'default', 'green');
    this.tableModel = applyResourceEvent(
      this.tableModel,
      { type: 'ADDED', resource: redPod },
      0,
    );
    this.tableModel = applyResourceEvent(
      this.tableModel,
      { type: 'ADDED', resource: greenPod },
      0,
    );
    this.tableFrame = renderTableFrame(
      this.tableModel,
      this.tableVisibleHeight,
      'default',
    );
  },
);

Given(
  'a ResourceTable for kind {string} sorted by {string} ascending',
  function (this: PrivateerWorld, kind: string, _colName: string) {
    this.tableModel = createTableModel(kind);
    this.tableModel = applySort(this.tableModel, 'name', 'asc');
    const r = makeResource('example', 'default');
    this.tableModel = applyResourceEvent(
      this.tableModel,
      { type: 'ADDED', resource: r },
      0,
    );
    this.tableFrame = renderTableFrame(
      this.tableModel,
      this.tableVisibleHeight,
      'default',
    );
  },
);

Given(
  'a ResourceTable for kind {string} sorted by {string} descending',
  function (this: PrivateerWorld, kind: string, _colName: string) {
    this.tableModel = createTableModel(kind);
    this.tableModel = applySort(this.tableModel, 'name', 'desc');
    const r = makeResource('example', 'default');
    this.tableModel = applyResourceEvent(
      this.tableModel,
      { type: 'ADDED', resource: r },
      0,
    );
    this.tableFrame = renderTableFrame(
      this.tableModel,
      this.tableVisibleHeight,
      'default',
    );
  },
);

Given(
  'a ResourceTable for kind {string} in error state {string}',
  function (this: PrivateerWorld, kind: string, errorState: string) {
    this.tableModel = createTableModel(kind);
    if (errorState === 'forbidden') {
      this.tableModel = { ...this.tableModel, loadState: 'forbidden' };
    } else if (errorState === 'connection') {
      this.tableModel = {
        ...this.tableModel,
        loadState: 'connection-error',
        connectionAttempt: 1,
        connectionMax: 3,
      };
    }
    this.tableFrame = renderTableFrame(
      this.tableModel,
      this.tableVisibleHeight,
      'default',
    );
  },
);

Given(
  'a ResourceTable for kind {string} in error state {string} with attempt {int} of {int}',
  function (
    this: PrivateerWorld,
    kind: string,
    _errorState: string,
    attempt: number,
    max: number,
  ) {
    this.tableModel = {
      ...createTableModel(kind),
      loadState: 'connection-error',
      connectionAttempt: attempt,
      connectionMax: max,
    };
    this.tableFrame = renderTableFrame(
      this.tableModel,
      this.tableVisibleHeight,
      'default',
    );
  },
);

Given(
  'a ResourceTable for kind {string} in loading state',
  function (this: PrivateerWorld, kind: string) {
    this.tableModel = createTableModel(kind);
    // Loading is default state
    this.tableFrame = renderTableFrame(
      this.tableModel,
      this.tableVisibleHeight,
      'default',
    );
  },
);

Given(
  'a ResourceTable for kind {string} with {int} resources and a visible height of {int}',
  function (
    this: PrivateerWorld,
    kind: string,
    count: number,
    visibleHeight: number,
  ) {
    this.tableModel = createTableModel(kind);
    this.tableVisibleHeight = visibleHeight;
    for (let i = 0; i < count; i++) {
      const r = makeResource(`pod-${String(i).padStart(3, '0')}`, 'default');
      this.tableModel = applyResourceEvent(
        this.tableModel,
        { type: 'ADDED', resource: r },
        0,
      );
    }
    this.tableFrame = renderTableFrame(
      this.tableModel,
      this.tableVisibleHeight,
      'default',
    );
  },
);

Given(
  'the table width is {int}',
  function (this: PrivateerWorld, _width: number) {
    // Re-render with updated frame for the current state
    this.tableFrame = renderTableFrame(
      this.tableModel,
      this.tableVisibleHeight,
      'default',
    );
  },
);

Given(
  'the fake clock starts at {int}',
  function (this: PrivateerWorld, startMs: number) {
    this.fakeClock = new FakeClock(startMs);
  },
);

Given(
  'the search filter is {string}',
  function (this: PrivateerWorld, search: string) {
    this.tableModel = applySearch(this.tableModel, search);
    this.tableFrame = renderTableFrame(
      this.tableModel,
      this.tableVisibleHeight,
      'default',
    );
  },
);

// Note: "the scroll offset is {int}" is handled by the Then step below
// which both sets and asserts the offset depending on context.
// This stub is removed to avoid Cucumber ambiguity.

// ---------------------------------------------------------------------------
// When steps
// ---------------------------------------------------------------------------

When(
  'a new resource {string} is ADDED to the table',
  function (this: PrivateerWorld, name: string) {
    const r = makeResource(name, 'default');
    this.tableModel = applyResourceEvent(
      this.tableModel,
      { type: 'ADDED', resource: r },
      this.fakeClock.now(),
    );
  },
);

When(
  'the resource {string} receives a MODIFIED event',
  function (this: PrivateerWorld, name: string) {
    const r = makeResource(name, 'default');
    this.tableModel = applyResourceEvent(
      this.tableModel,
      { type: 'MODIFIED', resource: r },
      this.fakeClock.now(),
    );
  },
);

When(
  'the resource {string} receives a DELETED event',
  function (this: PrivateerWorld, name: string) {
    const r = makeResource(name, 'default');
    this.tableModel = applyResourceEvent(
      this.tableModel,
      { type: 'DELETED', resource: r },
      this.fakeClock.now(),
    );
  },
);

When(
  'the clock advances by {int} ms',
  function (this: PrivateerWorld, ms: number) {
    this.fakeClock.advance(ms);
    this.tableModel = tickAnimations(this.tableModel, this.fakeClock.now());
  },
);

When(
  'I press {string} on the table',
  function (this: PrivateerWorld, key: string) {
    keyWasPressed = true;
    const visibleHeight = this.tableVisibleHeight;
    if (key === 'j') {
      this.tableModel = scrollDown(this.tableModel, 1);
    } else if (key === 'k') {
      this.tableModel = scrollUp(this.tableModel, 1);
    } else if (key === 'ctrl+f') {
      this.tableModel = scrollDown(this.tableModel, visibleHeight);
    } else if (key === 'ctrl+b') {
      this.tableModel = scrollUp(this.tableModel, visibleHeight);
    } else if (key === 'G') {
      this.tableModel = scrollToEnd(this.tableModel, visibleHeight);
    } else if (key === 'gg') {
      this.tableModel = scrollToStart(this.tableModel);
    }
    this.tableScrollOffset = this.tableModel.scrollOffset;
    this.tableFrame = renderTableFrame(
      this.tableModel,
      this.tableVisibleHeight,
      'default',
    );
  },
);

// ---------------------------------------------------------------------------
// Then steps
// ---------------------------------------------------------------------------

Then(
  'the table frame contains {string}',
  function (this: PrivateerWorld, text: string) {
    const frame =
      this.tableFrame.length > 0
        ? this.tableFrame
        : renderTableFrame(this.tableModel, this.tableVisibleHeight, 'default');
    assert.ok(
      frame.includes(text),
      `Expected table frame to contain "${text}", got:\n${frame}`,
    );
  },
);

Then(
  'the table frame does not contain {string}',
  function (this: PrivateerWorld, text: string) {
    const frame =
      this.tableFrame.length > 0
        ? this.tableFrame
        : renderTableFrame(this.tableModel, this.tableVisibleHeight, 'default');
    assert.ok(
      !frame.includes(text),
      `Expected table frame NOT to contain "${text}", got:\n${frame}`,
    );
  },
);

Then(
  'the resource {string} appears before {string} in the table',
  function (this: PrivateerWorld, firstName: string, secondName: string) {
    const rows = getSortedFilteredRows(this.tableModel);
    const firstIdx = rows.findIndex((r) => r.resource.name === firstName);
    const secondIdx = rows.findIndex((r) => r.resource.name === secondName);
    assert.ok(firstIdx >= 0, `Resource "${firstName}" not found in table`);
    assert.ok(secondIdx >= 0, `Resource "${secondName}" not found in table`);
    assert.ok(
      firstIdx < secondIdx,
      `Expected "${firstName}" (idx ${String(firstIdx)}) before "${secondName}" (idx ${String(secondIdx)})`,
    );
  },
);

Then(
  'the row {string} has state {string}',
  function (this: PrivateerWorld, name: string, expectedState: string) {
    const uid = `uid-${name}`;
    const row = this.tableModel.rows.get(uid);
    assert.ok(row !== undefined, `Row "${name}" not found in table`);
    assert.strictEqual(
      row.state,
      expectedState,
      `Expected row "${name}" state to be "${expectedState}", got "${row.state}"`,
    );
  },
);

Then(
  'the row {string} is not present in the table',
  function (this: PrivateerWorld, name: string) {
    const uid = `uid-${name}`;
    assert.ok(
      !this.tableModel.rows.has(uid),
      `Expected row "${name}" to not be present, but it was`,
    );
  },
);

Then(
  'the table renders at most {int} rows',
  function (this: PrivateerWorld, maxRows: number) {
    const frame = renderTableFrame(
      this.tableModel,
      this.tableVisibleHeight,
      'default',
    );
    // Count resource rows by counting lines containing 'pod-' pattern
    const lines = frame.split('\n');
    const resourceLines = lines.filter((l) => /pod-\d{3}/.exec(l) !== null);
    assert.ok(
      resourceLines.length <= maxRows,
      `Expected at most ${String(maxRows)} rows, got ${String(resourceLines.length)}`,
    );
  },
);

Then(
  'the scroll offset is {int}',
  function (this: PrivateerWorld, offsetValue: number) {
    if (!keyWasPressed) {
      // Setup mode: set the scroll offset
      this.tableModel = { ...this.tableModel, scrollOffset: offsetValue };
      this.tableScrollOffset = offsetValue;
    } else {
      // Assertion mode: check the scroll offset
      assert.strictEqual(
        this.tableModel.scrollOffset,
        offsetValue,
        `Expected scroll offset ${String(offsetValue)}, got ${String(this.tableModel.scrollOffset)}`,
      );
    }
  },
);
