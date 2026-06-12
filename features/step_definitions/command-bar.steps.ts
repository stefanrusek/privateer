/**
 * Step definitions for:
 *   features/07-agent/fast-path.feature
 *   features/02-navigation/command-bar.feature
 *
 * All logic is pure — no Ink, no I/O. Tests drive the parser and executor
 * directly with plain data.
 */

import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import {
  parseFastPath,
  type FastPathResult,
} from '../../src/command/fast-path.js';
import {
  parseBangCommand,
  type BangCommand,
} from '../../src/command/commands.js';
import { executeAction, type UiIntent } from '../../src/command/executor.js';
import type { AgentAction } from '../../src/command/action.js';

// ---------------------------------------------------------------------------
// Shared state (reset per scenario by Cucumber's World mechanism)
// ---------------------------------------------------------------------------

let fastPathResult: FastPathResult = null;
let knownNamespaces = new Set<string>();

let bangResult: BangCommand | null = null;

let executorState: UiIntent = { kind: '', namespace: '', search: '' };

// ---------------------------------------------------------------------------
// Type-narrowing helpers (avoid no-unnecessary-type-assertion for union checks)
// ---------------------------------------------------------------------------

function isNavigate(
  a: AgentAction,
): a is AgentAction & { action: 'navigate'; resource: string } {
  return a.action === 'navigate';
}

function isFilter(a: AgentAction): a is AgentAction & {
  action: 'filter';
  namespace?: string;
  search?: string;
} {
  return a.action === 'filter';
}

function isMulti(
  a: AgentAction,
): a is AgentAction & { action: 'multi'; steps: AgentAction[] } {
  return a.action === 'multi';
}

function isBangNavigate(b: BangCommand): b is BangCommand & {
  kind: 'navigate';
  action: AgentAction & { action: 'navigate' };
} {
  return b.kind === 'navigate';
}

function isBangNs(
  b: BangCommand,
): b is BangCommand & { kind: 'ns'; namespace: string } {
  return b.kind === 'ns';
}

// ---------------------------------------------------------------------------
// Fast-path parser steps
// ---------------------------------------------------------------------------

Given('the fast-path parser is initialized', function () {
  fastPathResult = null;
  knownNamespaces = new Set<string>();
});

Given('the known namespaces are {string}', function (nsString: string) {
  knownNamespaces = new Set<string>(nsString.split(',').map((s) => s.trim()));
});

When('I parse {string}', function (query: string) {
  fastPathResult = parseFastPath(query, knownNamespaces);
});

Then('the fast-path action is navigate to {string}', function (kind: string) {
  assert.ok(fastPathResult !== null, 'expected a fast-path match, got null');
  assert.ok(isNavigate(fastPathResult), 'expected navigate action');
  assert.equal(fastPathResult.resource, kind);
});

Then('the fast-path action is no match', function () {
  assert.equal(fastPathResult, null);
});

Then(
  'the fast-path action is filter namespace {string}',
  function (ns: string) {
    assert.ok(fastPathResult !== null, 'expected a fast-path match, got null');
    assert.ok(isFilter(fastPathResult), 'expected filter action');
    assert.equal(fastPathResult.namespace, ns);
  },
);

/**
 * Data table rows: | action | resource/kind | namespace-or-search |
 *
 * Navigate rows: | navigate | KindName |       |
 * Filter rows:   | filter   |          | value |
 *
 * The "value" in filter rows may be a namespace name OR a search term.
 * The step checks whether the actual step has namespace===value OR search===value.
 */
Then(
  'the fast-path action is multi with steps:',
  function (dataTable: { raw(): string[][] }) {
    assert.ok(fastPathResult !== null, 'expected a fast-path match, got null');
    assert.ok(isMulti(fastPathResult), 'expected multi action');

    const rows = dataTable.raw();
    assert.equal(
      fastPathResult.steps.length,
      rows.length,
      `expected ${String(rows.length)} steps, got ${String(fastPathResult.steps.length)}`,
    );

    for (let i = 0; i < rows.length; i++) {
      const row: string[] | undefined = rows[i];
      const step: AgentAction | undefined = fastPathResult.steps[i];

      if (row === undefined || step === undefined) {
        assert.fail(`row or step at index ${String(i)} is undefined`);
      }

      const [actionType, col2, col3] = row;

      if (actionType === 'navigate') {
        assert.ok(isNavigate(step), `step ${String(i)} expected navigate`);
        assert.equal(step.resource, col2 ?? '');
      } else if (actionType === 'filter') {
        assert.ok(isFilter(step), `step ${String(i)} expected filter`);
        const value = col3 ?? '';
        if (value.length > 0) {
          const hasNamespace =
            step.namespace !== undefined && step.namespace === value;
          const hasSearch = step.search !== undefined && step.search === value;
          assert.ok(
            hasNamespace || hasSearch,
            `expected filter step to have namespace="${value}" or search="${value}", ` +
              `got namespace=${String(step.namespace)} search=${String(step.search)}`,
          );
        }
        const col2Val = col2 ?? '';
        if (col2Val.length > 0) {
          assert.fail(`unexpected col2 "${col2Val}" for filter step`);
        }
      } else {
        assert.fail(
          `unexpected action type "${String(actionType)}" in data table`,
        );
      }
    }
  },
);

// ---------------------------------------------------------------------------
// Bang command parser steps
// ---------------------------------------------------------------------------

Given('the command parser is initialized', function () {
  bangResult = null;
  executorState = { kind: '', namespace: '', search: '' };
});

When('I parse command {string}', function (input: string) {
  bangResult = parseBangCommand(input);
});

Then('the command action is {string}', function (expected: string) {
  assert.ok(bangResult !== null, 'expected a bang command result, got null');
  assert.equal(bangResult.kind, expected);
});

Then(
  'the command action is {string} with argument {string}',
  function (kind: string, arg: string) {
    assert.ok(bangResult !== null, 'expected a bang command result, got null');
    assert.equal(bangResult.kind, kind);
    assert.ok(isBangNs(bangResult), 'expected ns command');
    assert.equal(bangResult.namespace, arg);
  },
);

Then(
  'the command action produces navigate to {string}',
  function (kind: string) {
    assert.ok(bangResult !== null, 'expected a bang command result, got null');
    assert.ok(isBangNavigate(bangResult), 'expected navigate command');
    assert.equal(bangResult.action.resource, kind);
  },
);

Then('the command action is unknown', function () {
  assert.ok(bangResult !== null, 'expected a bang command result, got null');
  assert.equal(bangResult.kind, 'unknown');
});

Then('the command is not a bang command', function () {
  assert.equal(bangResult, null);
});

// ---------------------------------------------------------------------------
// Executor steps
// ---------------------------------------------------------------------------

Given(
  'the executor starts with kind {string} namespace {string} search {string}',
  function (kind: string, namespace: string, search: string) {
    executorState = { kind, namespace, search };
  },
);

When('I execute navigate to {string}', function (kind: string) {
  const action: AgentAction = { action: 'navigate', resource: kind };
  executorState = executeAction(executorState, action);
});

When(
  'I execute filter namespace {string} search {string}',
  function (namespace: string, search: string) {
    const action: AgentAction = {
      action: 'filter',
      ...(namespace.length > 0 ? { namespace } : {}),
      ...(search.length > 0 ? { search } : {}),
    };
    executorState = executeAction(executorState, action);
  },
);

When('I execute filter with no fields', function () {
  const action: AgentAction = { action: 'filter' };
  executorState = executeAction(executorState, action);
});

When(
  'I execute multi navigate {string} then filter namespace {string} search {string}',
  function (kind: string, namespace: string, search: string) {
    const filterFields: { namespace?: string; search?: string } = {};
    if (namespace.length > 0) filterFields.namespace = namespace;
    if (search.length > 0) filterFields.search = search;

    const action: AgentAction = {
      action: 'multi',
      steps: [
        { action: 'navigate', resource: kind },
        { action: 'filter', ...filterFields },
      ],
    };
    executorState = executeAction(executorState, action);
  },
);

Then(
  'the executor result has kind {string} namespace {string} search {string}',
  function (kind: string, namespace: string, search: string) {
    assert.equal(executorState.kind, kind);
    assert.equal(executorState.namespace, namespace);
    assert.equal(executorState.search, search);
  },
);
