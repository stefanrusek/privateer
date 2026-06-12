/**
 * Step definitions for:
 *   features/07-agent/tool-dispatch.feature
 *   features/07-agent/agent-actions.feature
 *   features/07-agent/secret-redaction-agent.feature
 *
 * All logic is pure — no I/O, no network. Tests drive the dispatcher, parser,
 * and loop directly with deterministic fakes.
 */

import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { StateStore } from '../../src/store/state-store.js';
import { AgentToolDispatcher } from '../../src/agent/dispatcher.js';
import { parseAgentOutput } from '../../src/agent/parser.js';
import { runLoop } from '../../src/agent/loop.js';
import { FixtureEngine } from '../../src/boundaries/inference-engine.fake.js';
import { FakeClock } from '../../src/boundaries/clock.fake.js';
import type { ResourceEvent, ResourceObject } from '../../src/core/types.js';
import type { LoopResult } from '../../src/agent/loop.js';

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

const CONTEXT = 'test-ctx';
const NOW_MS = new Date('2026-06-10T13:00:00Z').getTime();

let store: StateStore;
let dispatcher: AgentToolDispatcher;
let dispatchResult: unknown;
let dispatchThrew: Error | null;

let parseResult: ReturnType<typeof parseAgentOutput>;

let loopResult: LoopResult | null;
let toolsCalled: string[];
let fixtureEngine: FixtureEngine;
let fakeClock: FakeClock;
let neverResolveEngine: {
  generate: () => Promise<never>;
} | null;

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

function makeStore(): StateStore {
  return new StateStore((event: ResourceEvent): ResourceObject => {
    const meta = event.object.metadata ?? {};
    return {
      uid: `${event.namespace ?? '~'}/${event.name}`,
      kind: event.kind,
      apiVersion: event.apiVersion,
      name: event.name,
      namespace: event.namespace,
      labels: meta.labels ?? {},
      annotations: meta.annotations ?? {},
      creationTimestamp: meta.creationTimestamp ?? '2026-06-01T00:00:00Z',
      resourceVersion: meta.resourceVersion ?? '1',
      status: { color: 'green', label: 'Running' },
      raw: event.object,
    };
  });
}

function makeColoredStore(
  colorMap: Map<string, 'green' | 'yellow' | 'red' | 'grey'>,
): StateStore {
  return new StateStore((event: ResourceEvent): ResourceObject => {
    const meta = event.object.metadata ?? {};
    const color = colorMap.get(event.name) ?? 'green';
    return {
      uid: `${event.namespace ?? '~'}/${event.name}`,
      kind: event.kind,
      apiVersion: event.apiVersion,
      name: event.name,
      namespace: event.namespace,
      labels: meta.labels ?? {},
      annotations: meta.annotations ?? {},
      creationTimestamp: '2026-06-01T00:00:00Z',
      resourceVersion: '1',
      status: {
        color,
        label:
          color === 'red'
            ? 'Error'
            : color === 'yellow'
              ? 'Warning'
              : 'Running',
      },
      raw: event.object,
    };
  });
}

function addToStore(
  s: StateStore,
  kind: string,
  namespace: string,
  name: string,
  extra?: Record<string, unknown>,
): void {
  s.applyEvent(CONTEXT, {
    type: 'ADDED',
    apiVersion: 'v1',
    kind,
    namespace,
    name,
    receivedAt: NOW_MS,
    object: {
      apiVersion: 'v1',
      kind,
      metadata: {
        name,
        namespace,
        creationTimestamp: '2026-06-01T00:00:00Z',
      },
      ...(extra ?? {}),
    },
  });
}

function parseRef(ref: string): { namespace: string; name: string } {
  const slash = ref.indexOf('/');
  assert.ok(slash !== -1, `expected "namespace/name" ref, got "${ref}"`);
  return { namespace: ref.slice(0, slash), name: ref.slice(slash + 1) };
}

// ---------------------------------------------------------------------------
// Given — dispatcher setup
// ---------------------------------------------------------------------------

Given('an agent tool dispatcher is initialized', function () {
  store = makeStore();
  dispatcher = new AgentToolDispatcher(store, CONTEXT, NOW_MS);
  dispatchResult = undefined;
  dispatchThrew = null;
});

Given('the store has a Pod {string}', function (ref: string) {
  const { namespace, name } = parseRef(ref);
  addToStore(store, 'Pod', namespace, name);
});

Given('the store has a healthy Pod {string}', function (ref: string) {
  const { namespace, name } = parseRef(ref);
  const colorMap = new Map<string, 'green' | 'yellow' | 'red' | 'grey'>();
  colorMap.set(name, 'green');
  const coloredStore = makeColoredStore(colorMap);
  addToStore(coloredStore, 'Pod', namespace, name);
  // Re-initialize dispatcher with a store that maps color correctly
  store = makeColoredStore(colorMap);
  addToStore(store, 'Pod', namespace, name);
  dispatcher = new AgentToolDispatcher(store, CONTEXT, NOW_MS);
});

Given('the store has an erroring Pod {string}', function (ref: string) {
  const { namespace, name } = parseRef(ref);
  // We need to get existing pods from the current store and add the new one
  // Since the store is already created, we need to use a trick:
  // Add to a NEW store that has all previous items + this one
  const existingItems: {
    kind: string;
    namespace: string | null;
    name: string;
    color: 'green' | 'yellow' | 'red' | 'grey';
  }[] = store.all(CONTEXT).map((obj) => ({
    kind: obj.kind,
    namespace: obj.namespace,
    name: obj.name,
    color: obj.status.color,
  }));
  existingItems.push({ kind: 'Pod', namespace, name, color: 'red' });

  const newColorMap = new Map<string, 'green' | 'yellow' | 'red' | 'grey'>();
  for (const item of existingItems) {
    newColorMap.set(item.name, item.color);
  }
  store = makeColoredStore(newColorMap);
  for (const item of existingItems) {
    addToStore(store, item.kind, item.namespace ?? 'default', item.name);
  }
  dispatcher = new AgentToolDispatcher(store, CONTEXT, NOW_MS);
});

Given(
  'the store has a Secret {string} with data key {string} value {string}',
  function (ref: string, key: string, value: string) {
    const { namespace, name } = parseRef(ref);
    store = makeStore();
    addToStore(store, 'Secret', namespace, name, {
      data: { [key]: value },
    });
    dispatcher = new AgentToolDispatcher(store, CONTEXT, NOW_MS);
  },
);

Given(
  'the store has a Secret {string} with stringData key {string} value {string}',
  function (ref: string, key: string, value: string) {
    const { namespace, name } = parseRef(ref);
    store = makeStore();
    addToStore(store, 'Secret', namespace, name, {
      stringData: { [key]: value },
    });
    dispatcher = new AgentToolDispatcher(store, CONTEXT, NOW_MS);
  },
);

Given(
  'the store has a Secret {string} with multiple data keys',
  function (ref: string, dataTable: { rows(): string[][] }) {
    const { namespace, name } = parseRef(ref);
    const data: Record<string, string> = {};
    for (const row of dataTable.rows()) {
      const [key, value] = row;
      if (key !== undefined && value !== undefined) {
        data[key] = value;
      }
    }
    store = makeStore();
    addToStore(store, 'Secret', namespace, name, { data });
    dispatcher = new AgentToolDispatcher(store, CONTEXT, NOW_MS);
  },
);

Given(
  'the store has a ConfigMap {string} with data key {string} value {string}',
  function (ref: string, key: string, value: string) {
    const { namespace, name } = parseRef(ref);
    store = makeStore();
    addToStore(store, 'ConfigMap', namespace, name, {
      data: { [key]: value },
    });
    dispatcher = new AgentToolDispatcher(store, CONTEXT, NOW_MS);
  },
);

Given(
  'the store has an erroring Secret {string} with data key {string} value {string}',
  function (ref: string, key: string, value: string) {
    const { namespace, name } = parseRef(ref);
    const colorMap = new Map<string, 'green' | 'yellow' | 'red' | 'grey'>();
    colorMap.set(name, 'red');
    store = makeColoredStore(colorMap);
    addToStore(store, 'Secret', namespace, name, {
      data: { [key]: value },
    });
    dispatcher = new AgentToolDispatcher(store, CONTEXT, NOW_MS);
  },
);

// ---------------------------------------------------------------------------
// When — dispatcher dispatch
// ---------------------------------------------------------------------------

When(
  'I dispatch {string} with kind {string}',
  function (tool: string, kind: string) {
    dispatchThrew = null;
    try {
      dispatchResult = dispatcher.dispatch(tool, { kind });
    } catch (e: unknown) {
      dispatchThrew = e instanceof Error ? e : new Error(String(e));
    }
  },
);

When(
  'I dispatch {string} with kind {string} and namespace {string}',
  function (tool: string, kind: string, namespace: string) {
    dispatchThrew = null;
    try {
      dispatchResult = dispatcher.dispatch(tool, { kind, namespace });
    } catch (e: unknown) {
      dispatchThrew = e instanceof Error ? e : new Error(String(e));
    }
  },
);

When(
  'I dispatch {string} with kind {string} and status {string}',
  function (tool: string, kind: string, status: string) {
    dispatchThrew = null;
    try {
      dispatchResult = dispatcher.dispatch(tool, { kind, status });
    } catch (e: unknown) {
      dispatchThrew = e instanceof Error ? e : new Error(String(e));
    }
  },
);

When(
  'I dispatch {string} with kind {string} name {string} namespace {string}',
  function (tool: string, kind: string, name: string, namespace: string) {
    dispatchThrew = null;
    try {
      dispatchResult = dispatcher.dispatch(tool, { kind, name, namespace });
    } catch (e: unknown) {
      dispatchThrew = e instanceof Error ? e : new Error(String(e));
    }
  },
);

When('I dispatch unknown tool {string}', function (tool: string) {
  dispatchThrew = null;
  try {
    dispatchResult = dispatcher.dispatch(tool, {});
  } catch (e: unknown) {
    dispatchThrew = e instanceof Error ? e : new Error(String(e));
  }
});

// ---------------------------------------------------------------------------
// Then — dispatcher assertions
// ---------------------------------------------------------------------------

Then('the result contains {int} resources', function (count: number) {
  assert.ok(
    Array.isArray(dispatchResult),
    `expected array result, got ${typeof dispatchResult}`,
  );
  assert.strictEqual(
    dispatchResult.length,
    count,
    `expected ${String(count)} resources, got ${String(dispatchResult.length)}`,
  );
});

Then(
  'the result resource {int} has name {string}',
  function (index: number, name: string) {
    assert.ok(Array.isArray(dispatchResult), 'expected array result');
    const item = dispatchResult[index] as Record<string, unknown> | undefined;
    assert.ok(item !== undefined, `no item at index ${String(index)}`);
    assert.strictEqual(item.name, name);
  },
);

Then('the result JSON does not contain {string}', function (value: string) {
  const json = JSON.stringify(dispatchResult);
  assert.ok(
    !json.includes(value),
    `expected result JSON not to contain "${value}", but it did.\nResult: ${json}`,
  );
});

Then('the result is not null', function () {
  assert.ok(dispatchResult !== null, 'expected non-null result');
  assert.ok(dispatchResult !== undefined, 'expected non-undefined result');
});

Then('the count result has total {int}', function (total: number) {
  const result = dispatchResult as { total: number } | null | undefined;
  assert.ok(result !== null && result !== undefined, 'expected a count result');
  assert.strictEqual(
    result.total,
    total,
    `expected total ${String(total)}, got ${String(result.total)}`,
  );
});

Then(
  'the dispatch throws with message containing {string}',
  function (msg: string) {
    assert.ok(
      dispatchThrew !== null,
      'expected dispatch to throw, but it did not',
    );
    assert.ok(
      dispatchThrew.message.includes(msg),
      `expected error message to contain "${msg}", got: "${dispatchThrew.message}"`,
    );
  },
);

// ---------------------------------------------------------------------------
// Given — loop setup
// ---------------------------------------------------------------------------

Given('an agent loop is initialized', function () {
  store = makeStore();
  dispatcher = new AgentToolDispatcher(store, CONTEXT, NOW_MS);
  fixtureEngine = new FixtureEngine();
  fakeClock = new FakeClock(0);
  toolsCalled = [];
  loopResult = null;
  neverResolveEngine = null;
  parseResult = { ok: false, raw: '' };
});

Given('the fixture engine will answer {string}', function (content: string) {
  fixtureEngine = new FixtureEngine();
  fixtureEngine.pushAnswer(content);
});

Given(
  'the fixture engine will call tool {string} then answer {string}',
  function (toolName: string, answer: string) {
    fixtureEngine = new FixtureEngine();
    fixtureEngine.pushToolCalls([
      { id: 'call-1', name: toolName, arguments: '{"kind":"Pod"}' },
    ]);
    fixtureEngine.pushAnswer(answer);
  },
);

Given('the fixture engine will error with {string}', function (msg: string) {
  fixtureEngine = new FixtureEngine();
  fixtureEngine.pushError({ kind: 'runtimeError', message: msg });
});

Given('the fixture engine will never respond', function () {
  neverResolveEngine = {
    generate: () => new Promise<never>(() => undefined),
  };
});

Given(
  'the fixture engine will call tool {string} {int} times with no final answer',
  function (toolName: string, times: number) {
    fixtureEngine = new FixtureEngine();
    for (let i = 0; i < times; i++) {
      fixtureEngine.pushToolCalls([
        {
          id: `call-${String(i)}`,
          name: toolName,
          arguments: '{"kind":"Pod"}',
        },
      ]);
    }
    // No final answer — engine exhausted after 5 rounds
  },
);

// ---------------------------------------------------------------------------
// When — parser
// ---------------------------------------------------------------------------

When('I parse model output {string}', function (content: string) {
  // Unescape newlines in the string
  const unescaped = content.replace(/\\n/g, '\n');
  parseResult = parseAgentOutput(unescaped);
});

// ---------------------------------------------------------------------------
// When — loop
// ---------------------------------------------------------------------------

When(
  'I run the agent loop with query {string}',
  async function (query: string) {
    const messages = [
      { role: 'system' as const, content: 'You are Privateer.' },
      { role: 'user' as const, content: query },
    ];
    const engine = neverResolveEngine ?? fixtureEngine;
    loopResult = await runLoop({
      engine,
      dispatcher,
      clock: fakeClock,
      messages,
      thinking: false,
      onToolCall: (name) => {
        toolsCalled.push(name);
      },
    });
  },
);

When(
  'I run the agent loop with query {string} and advance clock {int}ms',
  async function (query: string, ms: number) {
    const messages = [
      { role: 'system' as const, content: 'You are Privateer.' },
      { role: 'user' as const, content: query },
    ];
    const engine = neverResolveEngine ?? fixtureEngine;
    const loopPromise = runLoop({
      engine,
      dispatcher,
      clock: fakeClock,
      messages,
      thinking: false,
    });
    // Advance clock to trigger timeout
    fakeClock.advance(ms);
    loopResult = await loopPromise;
  },
);

// ---------------------------------------------------------------------------
// Then — parser assertions
// ---------------------------------------------------------------------------

Then('the parse fails', function () {
  assert.ok(!parseResult.ok, 'expected parse to fail, but it succeeded');
});

Then('the parsed action is navigate to {string}', function (resource: string) {
  assert.ok(parseResult.ok, 'expected parse to succeed');
  assert.strictEqual(parseResult.action.action, 'navigate');
  const nav = parseResult.action;
  assert.strictEqual(nav.resource, resource);
});

Then(
  'the parsed action is filter with namespace {string} and search {string}',
  function (namespace: string, search: string) {
    assert.ok(parseResult.ok, 'expected parse to succeed');
    assert.strictEqual(parseResult.action.action, 'filter');
    const filter = parseResult.action;
    assert.strictEqual(filter.namespace, namespace);
    assert.strictEqual(filter.search, search);
  },
);

Then(
  'the parsed action is filter with namespace {string}',
  function (namespace: string) {
    assert.ok(parseResult.ok, 'expected parse to succeed');
    assert.strictEqual(parseResult.action.action, 'filter');
    const filter = parseResult.action;
    assert.strictEqual(filter.namespace, namespace);
  },
);

Then('the parsed action is filter', function () {
  assert.ok(parseResult.ok, 'expected parse to succeed');
  assert.strictEqual(parseResult.action.action, 'filter');
});

Then('the parsed action is answer with text {string}', function (text: string) {
  assert.ok(parseResult.ok, 'expected parse to succeed');
  assert.strictEqual(parseResult.action.action, 'answer');
  const answer = parseResult.action;
  assert.strictEqual(answer.text, text);
});

Then('the parsed multi action has {int} steps', function (count: number) {
  assert.ok(parseResult.ok, 'expected parse to succeed');
  assert.strictEqual(parseResult.action.action, 'multi');
  const multi = parseResult.action;
  assert.strictEqual(
    multi.steps.length,
    count,
    `expected ${String(count)} steps, got ${String(multi.steps.length)}`,
  );
});

Then('the parsed action is unknown with raw {string}', function (raw: string) {
  assert.ok(parseResult.ok, 'expected parse to succeed');
  assert.strictEqual(parseResult.action.action, 'unknown');
  const unknown = parseResult.action;
  assert.strictEqual(unknown.raw, raw);
});

// ---------------------------------------------------------------------------
// Then — loop assertions
// ---------------------------------------------------------------------------

Then('the loop result is action with kind {string}', function (kind: string) {
  assert.ok(loopResult !== null, 'loop result is null');
  assert.strictEqual(
    loopResult.kind,
    'action',
    `expected loop result kind "action", got "${loopResult.kind}"`,
  );
  assert.strictEqual(loopResult.action.action, kind);
});

Then('the loop result is error', function () {
  assert.ok(loopResult !== null, 'loop result is null');
  assert.strictEqual(
    loopResult.kind,
    'error',
    `expected loop result kind "error", got "${loopResult.kind}"`,
  );
});

Then(
  'the loop result is error with message containing {string}',
  function (msg: string) {
    assert.ok(loopResult !== null, 'loop result is null');
    assert.strictEqual(loopResult.kind, 'error');
    assert.ok(
      loopResult.message.includes(msg),
      `expected message to contain "${msg}", got "${loopResult.message}"`,
    );
  },
);

Then('the loop result is parseError', function () {
  assert.ok(loopResult !== null, 'loop result is null');
  assert.strictEqual(
    loopResult.kind,
    'parseError',
    `expected loop result kind "parseError", got "${loopResult.kind}"`,
  );
});

Then('the loop result is timeout', function () {
  assert.ok(loopResult !== null, 'loop result is null');
  assert.strictEqual(
    loopResult.kind,
    'timeout',
    `expected loop result kind "timeout", got "${loopResult.kind}"`,
  );
});

Then('the tool {string} was called', function (toolName: string) {
  assert.ok(
    toolsCalled.includes(toolName),
    `expected tool "${toolName}" to be called, but called tools were: ${JSON.stringify(toolsCalled)}`,
  );
});
