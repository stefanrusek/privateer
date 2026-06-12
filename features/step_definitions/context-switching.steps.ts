import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import type { PrivateerWorld } from '../support/world.js';
import { ContextModel } from '../../src/k8s/context-model.js';
import { FakeKubeClient } from '../../src/boundaries/kube-client.fake.js';
import type { Result } from '../../src/core/result.js';
import type { ContextSwitchError } from '../../src/k8s/context-model.js';

interface ContextWorld extends PrivateerWorld {
  contextModel: ContextModel;
  reinitCount: number;
  lastSwitchResult: Result<void, ContextSwitchError> | undefined;
}

Given(
  'a context model with contexts {string} and current {string}',
  function (this: ContextWorld, contextsStr: string, current: string) {
    const contextNames = contextsStr.split(',').map((s) => s.trim());
    const client = new FakeKubeClient({
      contexts: contextNames.map((n) => ({ name: n, cluster: n, user: n })),
      currentContext: current,
    });
    this.reinitCount = 0;
    this.lastSwitchResult = undefined;
    this.contextModel = new ContextModel(client, () => {
      this.reinitCount += 1;
    });
  },
);

When(
  'I switch to context {string}',
  function (this: ContextWorld, name: string) {
    this.lastSwitchResult = this.contextModel.switchContext(name);
  },
);

When(
  'I attempt to switch to context {string}',
  function (this: ContextWorld, name: string) {
    this.lastSwitchResult = this.contextModel.switchContext(name);
  },
);

Then(
  'the available contexts are {string}',
  function (this: ContextWorld, contextsStr: string) {
    const expected = contextsStr.split(',').map((s) => s.trim());
    assert.deepStrictEqual(this.contextModel.listContexts(), expected);
  },
);

Then(
  'the current context is {string}',
  function (this: ContextWorld, expected: string) {
    assert.strictEqual(this.contextModel.currentContext(), expected);
  },
);

Then(
  'the current context is still {string}',
  function (this: ContextWorld, expected: string) {
    assert.strictEqual(this.contextModel.currentContext(), expected);
  },
);

Then('a reinit signal was emitted', function (this: ContextWorld) {
  assert.ok(
    this.reinitCount > 0,
    `expected reinit signal but reinitCount is ${String(this.reinitCount)}`,
  );
});

Then('no reinit signal was emitted', function (this: ContextWorld) {
  assert.strictEqual(
    this.reinitCount,
    0,
    `expected no reinit signal but reinitCount is ${String(this.reinitCount)}`,
  );
});

Then(
  'the switch fails with error {string}',
  function (this: ContextWorld, expectedMessage: string) {
    const result = this.lastSwitchResult;
    assert.ok(result !== undefined, 'no switch result recorded');
    // Narrow to Err branch before accessing .error
    assert.ok(!result.ok, 'expected switch to fail but it succeeded');
    assert.strictEqual(result.error.message, expectedMessage);
  },
);
