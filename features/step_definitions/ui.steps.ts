import { Given, When, Then, Before } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { render } from 'ink-testing-library';
import React from 'react';
import { Sidebar } from '../../src/ui/components/Sidebar.js';
import { SIDEBAR_CATEGORIES } from '../../src/ui/sidebar-data.js';
import type { FocusRegion } from '../../src/ui/types.js';
import { nextRegion, regionOrder } from '../../src/ui/navigation.js';
import {
  navigableTabsFor,
  nextTab,
  prevTab,
  jumpTab,
  type TabId,
} from '../../src/ui/detail-tabs.js';

// ---------------------------------------------------------------------------
// Reset per-scenario state
// ---------------------------------------------------------------------------

Before(function () {
  sidebarFrame = '';
  activeKind = '';
  collapsedCategories = new Set();
  badgeCounts = new Map();
  forbiddenKinds = new Set();
  currentFocus = 'sidebar';
  detailVisible = false;
  focusWasSet = false;
});

// ---------------------------------------------------------------------------
// Shared state for sidebar scenarios
// ---------------------------------------------------------------------------

function noop(): void {
  return;
}

let sidebarFrame = '';
let activeKind = '';
let collapsedCategories = new Set<string>();
let badgeCounts = new Map<string, number>();
let forbiddenKinds = new Set<string>();

function renderSidebar(): void {
  const { lastFrame } = render(
    React.createElement(Sidebar, {
      items: SIDEBAR_CATEGORIES,
      activeKind,
      badgeCounts,
      dimmedKinds: new Set<string>(),
      forbiddenKinds,
      focusActive: false,
      onSelect: noop,
      onToggleCategory: noop,
      collapsedCategories,
    }),
  );
  sidebarFrame = lastFrame() ?? '';
}

// ---------------------------------------------------------------------------
// Sidebar Background
// ---------------------------------------------------------------------------

Given('the sidebar is rendered with default data', function () {
  activeKind = '';
  collapsedCategories = new Set();
  badgeCounts = new Map();
  forbiddenKinds = new Set();
  renderSidebar();
});

// ---------------------------------------------------------------------------
// Sidebar assertion steps
// ---------------------------------------------------------------------------

Then('the sidebar contains {string}', function (text: string) {
  assert.ok(
    sidebarFrame.includes(text),
    `Expected sidebar to contain "${text}", got:\n${sidebarFrame}`,
  );
});

Then('the sidebar does not contain {string}', function (text: string) {
  assert.ok(
    !sidebarFrame.includes(text),
    `Expected sidebar NOT to contain "${text}", got:\n${sidebarFrame}`,
  );
});

// ---------------------------------------------------------------------------
// Sidebar state manipulation steps
// ---------------------------------------------------------------------------

Given('the {string} category is expanded', function (category: string) {
  collapsedCategories.delete(category.toLowerCase().replace(/ /g, '-'));
  renderSidebar();
});

When('the {string} category is collapsed', function (category: string) {
  collapsedCategories.add(category.toLowerCase().replace(/ /g, '-'));
  renderSidebar();
});

Given(
  'the {string} resource has a live count of {int}',
  function (kind: string, count: number) {
    badgeCounts.set(kind, count);
    renderSidebar();
  },
);

Given('the {string} resource is forbidden', function (kind: string) {
  forbiddenKinds.add(kind);
  renderSidebar();
});

Given('{string} is the active resource kind', function (kind: string) {
  activeKind = kind;
  renderSidebar();
});

// ---------------------------------------------------------------------------
// Focus cycling — pure state machine
// ---------------------------------------------------------------------------

let currentFocus: FocusRegion = 'sidebar';
let detailVisible = false;
/** True once the initial focus has been set via the setup step. */
let focusWasSet = false;

function computeNextFocus(current: FocusRegion, detail: boolean): FocusRegion {
  return nextRegion(regionOrder(detail), current, false);
}

function computePrevFocus(current: FocusRegion, detail: boolean): FocusRegion {
  return nextRegion(regionOrder(detail), current, true);
}

Given('the layout has detail visible', function () {
  detailVisible = true;
});

Given('the layout has no detail visible', function () {
  detailVisible = false;
});

/**
 * This step is used in two ways:
 * 1. As "And the current focus is X" after a Given — sets the initial focus
 * 2. As "Then the current focus is X" — asserts the current focus
 *
 * We distinguish by whether a Tab/Shift+Tab has been pressed (focusWasSet flag).
 * Before pressing any key, the step sets the focus. After pressing a key, it asserts.
 */
Then('the current focus is {string}', function (region: string) {
  if (!focusWasSet) {
    // Setup mode: set the initial focus value
    currentFocus = region as FocusRegion;
  } else {
    // Assertion mode: check the current focus
    assert.equal(
      currentFocus,
      region as FocusRegion,
      `Expected focus to be "${region}", got "${currentFocus}"`,
    );
  }
});

When('I press Tab', function () {
  focusWasSet = true;
  currentFocus = computeNextFocus(currentFocus, detailVisible);
});

When('I press Shift+Tab', function () {
  focusWasSet = true;
  currentFocus = computePrevFocus(currentFocus, detailVisible);
});

// ---------------------------------------------------------------------------
// Detail-pane tab navigation (chunk 01) — drives the pure detail-tabs module
// the same way the controller does.
// ---------------------------------------------------------------------------

let detailKind = 'Pod';
let detailHasPrometheus = false;
let activeDetailTab: TabId = 'overview';

Given(
  'a {string} detail pane is open on tab {string}',
  function (kind: string, tab: string) {
    detailKind = kind;
    activeDetailTab = tab as TabId;
  },
);

Given('the detail pane has Prometheus metrics', function () {
  detailHasPrometheus = true;
});

When('the detail pane moves to the next tab', function () {
  const tabs = navigableTabsFor(detailKind, detailHasPrometheus);
  const target = nextTab(tabs, activeDetailTab);
  if (target !== null) {
    activeDetailTab = target;
  }
});

When('the detail pane moves to the previous tab', function () {
  const tabs = navigableTabsFor(detailKind, detailHasPrometheus);
  const target = prevTab(tabs, activeDetailTab);
  if (target !== null) {
    activeDetailTab = target;
  }
});

When('the detail pane jumps to tab number {string}', function (n: string) {
  const tabs = navigableTabsFor(detailKind, detailHasPrometheus);
  const target = jumpTab(tabs, n);
  if (target !== null) {
    activeDetailTab = target;
  }
});

Then('the active detail tab is {string}', function (tab: string) {
  assert.equal(
    activeDetailTab,
    tab as TabId,
    `Expected active detail tab "${tab}", got "${activeDetailTab}"`,
  );
});

Before(function () {
  detailKind = 'Pod';
  detailHasPrometheus = false;
  activeDetailTab = 'overview';
});
