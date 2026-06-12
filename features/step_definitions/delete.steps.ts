/**
 * Step definitions for:
 *   features/05-actions/delete-confirmation.feature
 *
 * Tests the ConfirmDialog component and delete action logic directly with
 * plain data and FakeKubeClient.
 */

import { Given, When, Then, Before } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { render } from 'ink-testing-library';
import React from 'react';
import type { PrivateerWorld } from '../support/world.js';
import { ConfirmDialog } from '../../src/ui/components/ConfirmDialog.js';
import {
  buildDeleteConfirmMessage,
  executeDelete,
} from '../../src/actions/delete.js';
import { FakeKubeClient } from '../../src/boundaries/kube-client.fake.js';
import type { Result } from '../../src/core/result.js';

// Stdin type inferred from render() return to avoid relying on unexported types
type RenderStdin = ReturnType<typeof render>['stdin'];

// ---------------------------------------------------------------------------
// World augmentation
// ---------------------------------------------------------------------------

declare module '../support/world.js' {
  interface PrivateerWorld {
    deleteDialogFrame: string;
    deleteDialogStdin: RenderStdin;
    deleteOnConfirmCalled: boolean;
    deleteOnCancelCalled: boolean;
    deleteConfirmMessage: string;
    deleteResult: Result<void, string> | null;
    deleteClient: FakeKubeClient;
  }
}

// ---------------------------------------------------------------------------
// Reset per-scenario state
// ---------------------------------------------------------------------------

Before(function (this: PrivateerWorld) {
  this.deleteDialogFrame = '';
  this.deleteOnConfirmCalled = false;
  this.deleteOnCancelCalled = false;
  this.deleteConfirmMessage = '';
  this.deleteResult = null;
  this.deleteClient = new FakeKubeClient();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Yield to the macrotask queue so ink's useInput useEffect attaches. */
function yieldToEventLoop(): Promise<void> {
  return new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
}

function renderDeleteDialog(
  kind: string,
  name: string,
  namespace: string,
  onConfirm: () => void,
  onCancel: () => void,
  destructive = true,
): ReturnType<typeof render> {
  const message = buildDeleteConfirmMessage(kind, name, namespace);
  return render(
    React.createElement(ConfirmDialog, {
      message,
      confirmLabel: 'Delete',
      onConfirm,
      onCancel,
      destructive,
    }),
  );
}

// ---------------------------------------------------------------------------
// Given steps — distinct from other features (prefixed with "delete")
// ---------------------------------------------------------------------------

Given(
  'a delete confirm dialog for kind {string} named {string} in namespace {string}',
  async function (
    this: PrivateerWorld,
    kind: string,
    name: string,
    namespace: string,
  ) {
    const instance = renderDeleteDialog(
      kind,
      name,
      namespace,
      () => {
        this.deleteOnConfirmCalled = true;
      },
      () => {
        this.deleteOnCancelCalled = true;
      },
    );
    this.deleteDialogFrame = instance.lastFrame() ?? '';
    this.deleteDialogStdin = instance.stdin;
    // Yield so useInput's useEffect attaches the stdin listener.
    await yieldToEventLoop();
  },
);

Given(
  'a destructive delete confirm dialog for kind {string} named {string} in namespace {string}',
  async function (
    this: PrivateerWorld,
    kind: string,
    name: string,
    namespace: string,
  ) {
    const instance = renderDeleteDialog(
      kind,
      name,
      namespace,
      () => {
        this.deleteOnConfirmCalled = true;
      },
      () => {
        this.deleteOnCancelCalled = true;
      },
      true,
    );
    this.deleteDialogFrame = instance.lastFrame() ?? '';
    this.deleteDialogStdin = instance.stdin;
    await yieldToEventLoop();
  },
);

Given(
  'a fake kube client with a {string} named {string} in namespace {string}',
  function (
    this: PrivateerWorld,
    kind: string,
    name: string,
    namespace: string,
  ) {
    this.deleteClient = new FakeKubeClient();
    this.deleteClient.seed({
      kind,
      metadata: { name, namespace },
    });
  },
);

Given('a fake kube client with no resources', function (this: PrivateerWorld) {
  this.deleteClient = new FakeKubeClient();
});

// ---------------------------------------------------------------------------
// When steps
// ---------------------------------------------------------------------------

When('I press Enter on the delete dialog', function (this: PrivateerWorld) {
  this.deleteDialogStdin.write('\r');
});

When(
  'I press the right arrow on the delete dialog',
  async function (this: PrivateerWorld) {
    // ESC + [C is the ANSI right-arrow sequence.
    this.deleteDialogStdin.write('\x1B[C');
    // Yield so React can process the setSelection state update before next step.
    await yieldToEventLoop();
  },
);

When('I press Escape on the delete dialog', function (this: PrivateerWorld) {
  // ESC character.
  this.deleteDialogStdin.write('\x1B');
});

When(
  'I execute delete for kind {string} named {string} in namespace {string}',
  async function (
    this: PrivateerWorld,
    kind: string,
    name: string,
    namespace: string,
  ) {
    this.deleteResult = await executeDelete(
      this.deleteClient,
      kind,
      name,
      namespace,
    );
  },
);

When(
  'I build the delete confirm message for kind {string} named {string} in namespace {string}',
  function (
    this: PrivateerWorld,
    kind: string,
    name: string,
    namespace: string,
  ) {
    this.deleteConfirmMessage = buildDeleteConfirmMessage(
      kind,
      name,
      namespace,
    );
  },
);

// ---------------------------------------------------------------------------
// Then steps
// ---------------------------------------------------------------------------

Then(
  'the delete dialog frame contains {string}',
  function (this: PrivateerWorld, text: string) {
    assert.ok(
      this.deleteDialogFrame.includes(text),
      `Expected delete dialog frame to contain "${text}", got:\n${this.deleteDialogFrame}`,
    );
  },
);

Then(
  'the delete dialog default selection is {string}',
  async function (this: PrivateerWorld, selection: string) {
    // The default selection is Cancel — confirmed by pressing Enter and checking
    // which callback fires. We do a fresh render for this assertion.
    let cancelCalled = false;
    let confirmCalled = false;
    const message = buildDeleteConfirmMessage('Pod', 'test', 'default');
    const instance = render(
      React.createElement(ConfirmDialog, {
        message,
        confirmLabel: 'Delete',
        onConfirm: () => {
          confirmCalled = true;
        },
        onCancel: () => {
          cancelCalled = true;
        },
      }),
    );
    // Yield so useInput's useEffect attaches the stdin listener.
    await yieldToEventLoop();
    instance.stdin.write('\r');
    if (selection === 'Cancel') {
      assert.ok(cancelCalled, 'Expected onCancel to be called for Cancel');
      assert.ok(!confirmCalled, 'Expected onConfirm NOT to be called');
    } else {
      assert.ok(confirmCalled, 'Expected onConfirm to be called for Confirm');
      assert.ok(!cancelCalled, 'Expected onCancel NOT to be called');
    }
  },
);

Then('onConfirm was called', function (this: PrivateerWorld) {
  assert.ok(
    this.deleteOnConfirmCalled,
    'Expected onConfirm to have been called',
  );
});

Then('onConfirm was not called', function (this: PrivateerWorld) {
  assert.ok(
    !this.deleteOnConfirmCalled,
    'Expected onConfirm NOT to have been called',
  );
});

Then('onCancel was called', function (this: PrivateerWorld) {
  assert.ok(this.deleteOnCancelCalled, 'Expected onCancel to have been called');
});

Then('onCancel was not called', function (this: PrivateerWorld) {
  assert.ok(
    !this.deleteOnCancelCalled,
    'Expected onCancel NOT to have been called',
  );
});

Then(
  'the delete dialog has a destructive confirm button',
  function (this: PrivateerWorld) {
    // The button must appear in the frame; ANSI color codes are in the output
    // but we verify the label text is present.
    assert.ok(
      this.deleteDialogFrame.includes('[Delete]'),
      `Expected delete dialog to contain "[Delete]", got:\n${this.deleteDialogFrame}`,
    );
  },
);

Then('the delete result is ok', function (this: PrivateerWorld) {
  assert.ok(this.deleteResult !== null, 'Expected a delete result');
  assert.ok(this.deleteResult.ok, 'Expected delete result to be ok');
});

Then('the delete result is an error', function (this: PrivateerWorld) {
  assert.ok(this.deleteResult !== null, 'Expected a delete result');
  assert.ok(!this.deleteResult.ok, 'Expected delete result to be an error');
});

Then(
  'the delete confirm message contains {string}',
  function (this: PrivateerWorld, text: string) {
    assert.ok(
      this.deleteConfirmMessage.includes(text),
      `Expected confirm message to contain "${text}", got: "${this.deleteConfirmMessage}"`,
    );
  },
);

Then(
  'the delete confirm message does not contain {string}',
  function (this: PrivateerWorld, text: string) {
    assert.ok(
      !this.deleteConfirmMessage.includes(text),
      `Expected confirm message NOT to contain "${text}", got: "${this.deleteConfirmMessage}"`,
    );
  },
);
