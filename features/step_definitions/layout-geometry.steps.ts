/**
 * Step definitions for the layout-geometry single-source scenarios
 * (specs/navigation-overhaul/02-region-chrome-layout-math.md). Exercises the
 * pure `computeFrame` module directly — no UI rendering.
 *
 * Distinct step text avoids Cucumber ambiguity with other step files.
 */
import { Given, When, Then, Before } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import type { PrivateerWorld } from '../support/world.js';
import { computeFrame, type Frame } from '../../src/ui/layout-geometry.js';

declare module '../support/world.js' {
  interface PrivateerWorld {
    geoColumns: number;
    geoRows: number;
    geoSidebarRatio: number;
    geoVerticalRatio: number;
    geoShowDetail: boolean;
    geoFrame: Frame | null;
    geoFrameClosed: Frame | null;
    geoFrameOpen: Frame | null;
  }
}

function rects(frame: Frame): { width: number; height: number }[] {
  return [
    frame.header,
    frame.sidebar,
    frame.list,
    frame.commandBar,
    ...(frame.detail !== null ? [frame.detail] : []),
  ];
}

Before(function (this: PrivateerWorld) {
  this.geoColumns = 0;
  this.geoRows = 0;
  this.geoSidebarRatio = 0.2;
  this.geoVerticalRatio = 0.4;
  this.geoShowDetail = false;
  this.geoFrame = null;
  this.geoFrameClosed = null;
  this.geoFrameOpen = null;
});

Given(
  'a terminal of {int} columns and {int} rows',
  function (this: PrivateerWorld, cols: number, rows: number) {
    this.geoColumns = cols;
    this.geoRows = rows;
  },
);

Given(
  'the sidebar ratio is {float} and the vertical ratio is {float}',
  function (this: PrivateerWorld, sidebar: number, vertical: number) {
    this.geoSidebarRatio = sidebar;
    this.geoVerticalRatio = vertical;
  },
);

Given(
  'the detail pane is {word}',
  function (this: PrivateerWorld, state: string) {
    this.geoShowDetail = state === 'open';
  },
);

function build(world: PrivateerWorld, showDetail: boolean): Frame {
  return computeFrame({
    columns: world.geoColumns,
    rows: world.geoRows,
    sidebarRatio: world.geoSidebarRatio,
    verticalRatio: world.geoVerticalRatio,
    showDetail,
  });
}

When('I compute the layout frame', function (this: PrivateerWorld) {
  this.geoFrame = build(this, this.geoShowDetail);
});

When(
  'I compute the layout frame with the detail pane closed',
  function (this: PrivateerWorld) {
    this.geoFrameClosed = build(this, false);
  },
);

When(
  'I compute the layout frame with the detail pane open',
  function (this: PrivateerWorld) {
    this.geoFrameOpen = build(this, true);
  },
);

Then(
  'the list inner width is at least 1 and less than {int}',
  function (this: PrivateerWorld, cols: number) {
    assert.ok(this.geoFrame !== null);
    assert.ok(this.geoFrame.list.width >= 1, 'list width >= 1');
    assert.ok(this.geoFrame.list.width < cols, 'list width < terminal cols');
  },
);

Then(
  'the list region stays inside the terminal width',
  function (this: PrivateerWorld) {
    assert.ok(this.geoFrame !== null);
    assert.ok(
      this.geoFrame.list.x + this.geoFrame.list.width <= this.geoColumns,
    );
  },
);

Then('no region has a negative dimension', function (this: PrivateerWorld) {
  const frame = this.geoFrame;
  assert.ok(frame !== null);
  for (const r of rects(frame)) {
    assert.ok(r.width >= 0, 'width non-negative');
    assert.ok(r.height >= 0, 'height non-negative');
  }
});

Then(
  'the list inner width is the same in both frames',
  function (this: PrivateerWorld) {
    assert.ok(this.geoFrameClosed !== null && this.geoFrameOpen !== null);
    assert.equal(this.geoFrameOpen.list.width, this.geoFrameClosed.list.width);
  },
);

Then(
  'the detail inner width equals the list inner width',
  function (this: PrivateerWorld) {
    assert.ok(this.geoFrameOpen !== null);
    assert.ok(this.geoFrameOpen.detail !== null);
    assert.equal(this.geoFrameOpen.detail.width, this.geoFrameOpen.list.width);
  },
);

Then(
  'the list and detail inner heights plus the shared line equal the body height',
  function (this: PrivateerWorld) {
    const frame = this.geoFrame;
    assert.ok(frame !== null);
    assert.ok(frame.detail !== null);
    // Six fixed non-body rows: top edge, header inner, header│body line,
    // body│commandbar line, command bar inner, bottom edge.
    const body = this.geoRows - 6;
    assert.equal(frame.list.height + frame.detail.height + 1, body);
  },
);

Then(
  'the list│detail handle sits between the list and the detail pane',
  function (this: PrivateerWorld) {
    const frame = this.geoFrame;
    assert.ok(frame !== null);
    assert.ok(frame.detail !== null);
    assert.ok(frame.handles.vertical !== null);
    assert.equal(
      frame.handles.vertical.position,
      frame.list.y + frame.list.height,
    );
    assert.equal(frame.detail.y, frame.handles.vertical.position + 1);
  },
);

Then(
  'the sidebar inner width is {int}',
  function (this: PrivateerWorld, width: number) {
    assert.ok(this.geoFrame !== null);
    assert.equal(this.geoFrame.sidebar.width, width);
  },
);

Then('the computed frame has no detail pane', function (this: PrivateerWorld) {
  assert.ok(this.geoFrame !== null);
  assert.equal(this.geoFrame.detail, null);
  assert.equal(this.geoFrame.handles.vertical, null);
});
