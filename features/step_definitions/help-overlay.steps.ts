import { When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import {
  groupsFor,
  scopeForFocus,
  acceleratorSet,
  keymapIssues,
  type KeyGroup,
  type Scope,
} from '../../src/ui/keymap.js';
import { LOGS_TOOLBAR_ACCELERATORS } from '../../src/ui/logs-toolbar.js';

let helpGroups: readonly KeyGroup[] = [];

// Every accelerator declared by a measured <Button>/<DropdownButton> in the app
// (the Logs toolbar map + the header/context buttons). Mirrors the unit drift
// test so a button added without a keymap entry fails the suite.
const BUTTON_ACCELERATORS: readonly string[] = [
  ...Object.values(LOGS_TOOLBAR_ACCELERATORS),
  'c', // header.context
  'r', // context.retry
  'c', // context.switch
];

When('I build the help groups for focus {string}', function (focus: string) {
  helpGroups = groupsFor(scopeForFocus(focus));
});

When(
  'I build the help groups for the detail tab {string}',
  function (tab: string) {
    helpGroups = groupsFor(scopeForFocus('detail', tab));
  },
);

Then('the help groups include {string}', function (title: string) {
  assert.ok(
    helpGroups.some((g) => g.title === title),
    `expected a group titled "${title}"`,
  );
});

Then('the first help group is {string}', function (title: string) {
  assert.equal(helpGroups[0]?.title, title);
});

Then(
  'the {string} group documents keys {string}',
  function (scopeTitle: string, csv: string) {
    const group = helpGroups.find((g) => g.title === scopeTitle);
    assert.ok(group, `no group titled "${scopeTitle}"`);
    const keys = new Set(group.bindings.map((b) => b.keys));
    for (const key of csv.split(',').map((k) => k.trim())) {
      assert.ok(
        keys.has(key),
        `expected the ${scopeTitle} group to document "${key}"`,
      );
    }
  },
);

Then('every measured-button accelerator appears in the keymap', function () {
  const documented = acceleratorSet();
  for (const accel of BUTTON_ACCELERATORS) {
    assert.ok(
      documented.has(accel.toLowerCase()),
      `button accelerator "${accel}" is not in KEYMAP`,
    );
  }
});

Then('the keymap reports no consistency issues', function () {
  const issues: readonly { scope: Scope; message: string }[] = keymapIssues();
  assert.deepEqual([...issues], []);
});
