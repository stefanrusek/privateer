import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import {
  dispatch,
  type Action,
  type Entry,
  type RegistrySnapshot,
} from '../../src/input/dispatch.js';
import {
  renderAccelerator,
  matchAccelerator,
  type AcceleratorButton,
} from '../../src/ui/accelerator.js';

// The overlay layer the DropdownButton wrapper uses (mirrors OVERLAY_LAYER).
const OVERLAY_LAYER = 10;

let mwSnapshot: RegistrySnapshot = [];
let mwAction: Action = { kind: 'none' };

function press(x: number, y: number): void {
  const ev = {
    type: 'down' as const,
    button: 0,
    x,
    y,
    shift: false,
    meta: false,
    ctrl: false,
  };
  mwAction = dispatch(ev, mwSnapshot, null).action;
}

function field(key: string): unknown {
  return (mwAction as unknown as Record<string, unknown>)[key];
}

// ---------------------------------------------------------------------------
// Nested button over a region
// ---------------------------------------------------------------------------

Given(
  'a registry with the detail region and a {string} button nested in it',
  function (id: string) {
    const region: Entry = {
      kind: 'region',
      region: 'detail',
      rect: { x: 0, y: 10, width: 60, height: 20 },
      layer: 0,
    };
    const button: Entry = {
      kind: 'button',
      id,
      rect: { x: 2, y: 10, width: 8, height: 1 },
      layer: 0,
    };
    // Region registered AFTER the button (like the controller merges measured
    // entries last) — the nested-Button winner must still pick the button.
    mwSnapshot = [button, region];
  },
);

When('I press inside the {string} button', function (_id: string) {
  press(4, 10);
});

When('I press the detail region away from the button', function () {
  press(30, 20);
});

Then('the action is a button press for {string}', function (id: string) {
  assert.equal(field('kind'), 'buttonPress');
  assert.equal(field('id'), id);
});

Then('the action focuses the {string} region', function (region: string) {
  assert.equal(field('kind'), 'focusRegion');
  assert.equal(field('region'), region);
});

// ---------------------------------------------------------------------------
// Overlay above a base list region
// ---------------------------------------------------------------------------

Given(
  'a registry with the list region and a namespace overlay open above it',
  function () {
    const list: Entry = {
      kind: 'list',
      region: 'list',
      rect: { x: 0, y: 3, width: 40, height: 20 },
      layer: 0,
      rowOffset: 0,
      selectedIndex: 0,
    };
    const backdrop: Entry = {
      kind: 'button',
      id: 'header.namespace.backdrop',
      rect: { x: 0, y: 0, width: 9999, height: 9999 },
      layer: OVERLAY_LAYER - 1,
    };
    const items: Entry[] = ['default', 'kube-system', 'kube-public'].map(
      (ns, i) => ({
        kind: 'button',
        id: `header.namespace.item.${ns}`,
        rect: { x: 5, y: 4 + i, width: 16, height: 1 },
        layer: OVERLAY_LAYER,
      }),
    );
    mwSnapshot = [list, backdrop, ...items];
  },
);

When('I press an overlay item at overlay row {int}', function (row: number) {
  press(6, 4 + row);
});

When('I press far outside the overlay', function () {
  // A point over the base list but not over any overlay item → backdrop wins.
  press(2, 15);
});

Then('the list row beneath is NOT selected', function () {
  assert.notEqual(field('kind'), 'selectRow');
});

// ---------------------------------------------------------------------------
// Accelerators
// ---------------------------------------------------------------------------

let mwButtons: readonly AcceleratorButton[] = [];
let mwMatched: string | null = null;

Given(
  'active button {string} with accelerator {string} and button {string} with accelerator {string}',
  function (l1: string, k1: string, l2: string, k2: string) {
    mwButtons = [
      { id: 'container', accelerator: k1 },
      { id: 'lines', accelerator: k2 },
    ];
    // Stash the labels for the underline assertion.
    labels = { container: l1, lines: l2 };
  },
);

let labels: Record<string, string> = {};

When('I press the accelerator key {string}', function (key: string) {
  mwMatched = matchAccelerator(mwButtons, key);
});

Then('the matched button is {string}', function (id: string) {
  assert.equal(mwMatched, id);
});

Then(
  'the {string} in {string} renders underlined',
  function (key: string, label: string) {
    const segments = renderAccelerator(label, key);
    const underlined = segments.find((s) => s.underline);
    assert.ok(underlined !== undefined, 'no underlined segment');
    assert.equal(underlined.text.toLowerCase(), key.toLowerCase());
    // Sanity: the label we underlined is the one we declared.
    assert.ok(Object.values(labels).includes(label));
  },
);

// ---------------------------------------------------------------------------
// Filterable dropdown
// ---------------------------------------------------------------------------

let mwItems: readonly string[] = [];
let mwVisible: readonly string[] = [];

Given(
  'the namespace items {string}, {string}, {string}',
  function (a: string, b: string, c: string) {
    mwItems = [a, b, c];
  },
);

When('I filter the items by {string}', function (q: string) {
  mwVisible = mwItems.filter((it) =>
    it.toLowerCase().includes(q.toLowerCase()),
  );
});

Then('the visible items are {string}', function (csv: string) {
  assert.deepEqual(
    mwVisible,
    csv.split(',').map((s) => s.trim()),
  );
});
