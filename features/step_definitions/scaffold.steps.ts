import { When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import type { PrivateerWorld } from '../support/world.js';

When(
  'I run p9r with arguments {string}',
  function (this: PrivateerWorld, args: string) {
    this.runApp(args.split(' ').filter((a) => a.length > 0));
  },
);

Then(
  'the output contains {string}',
  function (this: PrivateerWorld, expected: string) {
    assert.ok(
      this.output.some((line) => line.includes(expected)),
      `expected output to contain "${expected}", got: ${JSON.stringify(this.output)}`,
    );
  },
);
