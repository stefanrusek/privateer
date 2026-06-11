/**
 * Step definitions for features/07-agent/no-agent-mode.feature.
 *
 * Drives the pure --no-agent helpers (Spec 07 §11.4) directly. Step text is
 * scoped with "no-agent" / "agent mode" wording to avoid Cucumber ambiguity
 * with other agent features.
 */

import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import {
  isAgentEnabled,
  agentTabVisible,
  commandBarIsCommandOnly,
  spaceOpensMode,
  normalizeNoAgentInput,
  NO_AGENT_COMMAND_BAR_HINT,
} from '../../src/model/no-agent.js';

let naFlags: string[] = [];
let naAgentEnabled = true;
let naOpenedMode: 'command' | 'agent' | null = null;
let naNormalized = '';

Given('the CLI flags {string}', function (flags: string) {
  naFlags = flags.length === 0 ? [] : flags.split(/\s+/);
});

When('I resolve the agent mode', function () {
  naAgentEnabled = isAgentEnabled(naFlags);
});

Then('the resolved agent mode is disabled', function () {
  assert.strictEqual(naAgentEnabled, false);
});

Then('the resolved agent mode is enabled', function () {
  assert.strictEqual(naAgentEnabled, true);
});

Given('the agent mode is disabled', function () {
  naAgentEnabled = false;
  naOpenedMode = null;
  naNormalized = '';
});

Given('the agent mode is enabled', function () {
  naAgentEnabled = true;
  naOpenedMode = null;
  naNormalized = '';
});

Then('the AgentTab is hidden in no-agent mode', function () {
  assert.strictEqual(agentTabVisible(naAgentEnabled), false);
});

Then('the AgentTab is visible in no-agent mode', function () {
  assert.strictEqual(agentTabVisible(naAgentEnabled), true);
});

Then('the command bar is command-only', function () {
  assert.strictEqual(commandBarIsCommandOnly(naAgentEnabled), true);
});

Then('the command bar is not command-only', function () {
  assert.strictEqual(commandBarIsCommandOnly(naAgentEnabled), false);
});

Then('the no-agent command-bar hint is {string}', function (hint: string) {
  assert.strictEqual(commandBarIsCommandOnly(naAgentEnabled), true);
  assert.strictEqual(NO_AGENT_COMMAND_BAR_HINT, hint);
});

When('Space is pressed to open the command bar in no-agent mode', function () {
  naOpenedMode = spaceOpensMode(naAgentEnabled);
});

Then('the opened command-bar mode is {string}', function (mode: string) {
  assert.strictEqual(naOpenedMode, mode);
});

When('the no-agent input {string} is normalized', function (input: string) {
  naNormalized = normalizeNoAgentInput(input);
});

Then('the normalized command is {string}', function (expected: string) {
  assert.strictEqual(naNormalized, expected);
});
