/**
 * Step definitions for features/05-actions/exec-handover.feature
 * (Spec 05 §4.2–4.3 — command history, container selection, suspend-and-handover).
 *
 * All state is local to the step module — each scenario gets a clean slate via
 * the Before hook. No shared globals that bleed between Cucumber scenarios.
 */

import { Given, When, Then, Before } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { InMemoryFileSink } from '../../src/boundaries/config-store.fake.js';
import { CapturedTty } from '../../src/boundaries/tty.fake.js';
import { FakeExecSession } from '../../src/exec/exec-session.fake.js';
import {
  resolveCommand,
  loadHistory,
  appendHistory,
  CommandInput,
} from '../../src/exec/command-history.js';
import {
  selectContainer,
  type ContainerEntry,
  type ContainerSelection,
} from '../../src/exec/container-picker.js';
import { startExecHandover } from '../../src/exec/exec-handover.js';

// ---------------------------------------------------------------------------
// Per-scenario state
// ---------------------------------------------------------------------------

let sink: InMemoryFileSink;
let commandInput: CommandInput;
let lastResolvedCommand: string;
let containerEntries: ContainerEntry[];
let containerSelection: ContainerSelection;
let tty: CapturedTty;
let session: FakeExecSession;

Before(function () {
  sink = new InMemoryFileSink();
  commandInput = new CommandInput([]);
  lastResolvedCommand = '';
  containerEntries = [];
  containerSelection = { kind: 'picker', entries: [], defaultContainer: null };
  tty = new CapturedTty({ columns: 80, rows: 24 });
  session = new FakeExecSession();
});

// ---------------------------------------------------------------------------
// Command-history steps
// ---------------------------------------------------------------------------

Given('an empty exec history', function () {
  sink = new InMemoryFileSink();
  commandInput = new CommandInput([]);
});

Given(
  'an exec history containing {string} then {string}',
  async function (first: string, second: string) {
    sink = new InMemoryFileSink();
    await appendHistory(sink, first);
    await appendHistory(sink, second);
    const entries = await loadHistory(sink);
    commandInput = new CommandInput(entries);
  },
);

Given(
  'an exec history with {int} entries ending with {string}',
  async function (count: number, last: string) {
    sink = new InMemoryFileSink();
    for (let i = 1; i < count; i++) {
      await appendHistory(sink, `entry${String(i)}`);
    }
    await appendHistory(sink, last);
    const entries = await loadHistory(sink);
    commandInput = new CommandInput(entries);
  },
);

When('I request the exec command with empty input', function () {
  lastResolvedCommand = resolveCommand('');
});

When(
  'I request the exec command with input {string}',
  function (input: string) {
    lastResolvedCommand = resolveCommand(input);
  },
);

When('I press up in the command input', function () {
  commandInput.up();
});

When('I press down in the command input', function () {
  commandInput.down();
});

When('I submit the exec command {string}', async function (cmd: string) {
  await appendHistory(sink, cmd);
});

Then('the resolved command is {string}', function (expected: string) {
  assert.equal(lastResolvedCommand, expected);
});

Then('the visible command input is {string}', function (expected: string) {
  assert.equal(commandInput.value, expected);
});

Then('the exec-history file contains {string}', async function (line: string) {
  const entries = await loadHistory(sink);
  assert.ok(
    entries.includes(line),
    `expected history to contain "${line}", got: ${JSON.stringify(entries)}`,
  );
});

Then(
  'the exec-history file line count is {int}',
  async function (count: number) {
    const entries = await loadHistory(sink);
    assert.equal(
      entries.length,
      count,
      `expected ${String(count)} history entries, got ${String(entries.length)}`,
    );
  },
);

Then('the history length is {int}', function (expected: number) {
  assert.equal(commandInput.historyLength, expected);
});

// ---------------------------------------------------------------------------
// Container-selection steps
// ---------------------------------------------------------------------------

Given('a pod with one running container {string}', function (name: string) {
  containerEntries = [{ name, phase: 'running', init: false }];
});

Given(
  'a pod with containers {string} running and {string} running',
  function (a: string, b: string) {
    containerEntries = [
      { name: a, phase: 'running', init: false },
      { name: b, phase: 'running', init: false },
    ];
  },
);

Given(
  'a pod with containers {string} running and {string} waiting',
  function (a: string, b: string) {
    containerEntries = [
      { name: a, phase: 'running', init: false },
      { name: b, phase: 'waiting', init: false },
    ];
  },
);

Given(
  'a pod with containers {string} running and {string} terminated',
  function (a: string, b: string) {
    containerEntries = [
      { name: a, phase: 'running', init: false },
      { name: b, phase: 'terminated', init: false },
    ];
  },
);

When('I request container selection for exec', function () {
  containerSelection = selectContainer(containerEntries);
});

Then('the selected container is {string}', function (expected: string) {
  assert.ok(
    containerSelection.kind === 'autoSelected',
    `expected autoSelected, got ${containerSelection.kind}`,
  );
  assert.equal(containerSelection.container, expected);
});

Then('no picker is shown', function () {
  assert.equal(containerSelection.kind, 'autoSelected');
});

Then(
  'a container picker is shown with options {string} and {string}',
  function (a: string, b: string) {
    assert.ok(
      containerSelection.kind === 'picker',
      `expected picker, got ${containerSelection.kind}`,
    );
    const names = containerSelection.entries.map((e) => e.name);
    assert.ok(
      names.includes(a),
      `expected picker to include "${a}", got ${JSON.stringify(names)}`,
    );
    assert.ok(
      names.includes(b),
      `expected picker to include "${b}", got ${JSON.stringify(names)}`,
    );
  },
);

Then('the picker default selection is {string}', function (expected: string) {
  assert.ok(
    containerSelection.kind === 'picker',
    `expected picker, got ${containerSelection.kind}`,
  );
  assert.equal(containerSelection.defaultContainer, expected);
});

Then('the picker shows {string} as terminated', function (name: string) {
  assert.ok(
    containerSelection.kind === 'picker',
    `expected picker, got ${containerSelection.kind}`,
  );
  const entry = containerSelection.entries.find((e) => e.name === name);
  assert.ok(entry !== undefined, `expected "${name}" in picker entries`);
  assert.equal(entry.phase, 'terminated');
});

// ---------------------------------------------------------------------------
// Suspend-and-handover steps
// ---------------------------------------------------------------------------

Given('a fake TTY and a fake exec session', function () {
  tty = new CapturedTty({ columns: 80, rows: 24 });
  session = new FakeExecSession();
});

When(
  'I start an exec handover for container {string} with command {string}',
  function (_container: string, _command: string) {
    startExecHandover({ tty, session });
  },
);

When('the TTY emits input {string}', function (data: string) {
  tty.pushInput(data);
});

When('the session emits output {string}', function (data: string) {
  session.pushData(data);
});

When(
  'the TTY resizes to {int} columns and {int} rows',
  function (cols: number, rows: number) {
    tty.resize({ columns: cols, rows: rows });
  },
);

When('the session closes cleanly', function () {
  session.emitClose();
});

When('the session drops with error {string}', function (reason: string) {
  session.emitDrop(reason);
});

Then('the TTY is suspended', function () {
  assert.equal(tty.suspended, true);
});

Then('the TTY is resumed', function () {
  assert.equal(tty.suspended, false);
});

Then('the session received data {string}', function (expected: string) {
  assert.ok(
    session.writes.includes(expected),
    `expected session writes to contain "${expected}", got: ${JSON.stringify(session.writes)}`,
  );
});

Then('the TTY output contains {string}', function (expected: string) {
  const output = tty.output();
  assert.ok(
    output.includes(expected),
    `expected TTY output to contain "${expected}", got: ${JSON.stringify(output)}`,
  );
});

Then(
  'the session received a resize to {int} columns and {int} rows',
  function (cols: number, rows: number) {
    const found = session.resizes.some(
      (r) => r.cols === cols && r.rows === rows,
    );
    assert.ok(
      found,
      `expected resize to ${String(cols)}x${String(rows)}, got: ${JSON.stringify(session.resizes)}`,
    );
  },
);
