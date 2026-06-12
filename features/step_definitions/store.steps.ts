import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import type { PrivateerWorld } from '../support/world.js';
import { StateStore } from '../../src/store/state-store.js';
import { WatchAggregator } from '../../src/store/watch-aggregator.js';
import { rollupByNamespace, rollupByNode } from '../../src/store/rollups.js';
import { FakeKubeClient } from '../../src/boundaries/kube-client.fake.js';
import type {
  ResourceEvent,
  ResourceObject,
  KubernetesObject,
  StatusColor,
} from '../../src/core/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse "namespace/name" into { namespace, name }. */
function parseRef(ref: string): { namespace: string; name: string } {
  const slash = ref.indexOf('/');
  assert.ok(slash !== -1, `expected "namespace/name", got "${ref}"`);
  return { namespace: ref.slice(0, slash), name: ref.slice(slash + 1) };
}

function makeStubMapper(
  colorOverrides: Map<string, StatusColor> = new Map<string, StatusColor>(),
  nodeOverrides: Map<string, string> = new Map<string, string>(),
): (event: ResourceEvent) => ResourceObject {
  return (event: ResourceEvent): ResourceObject => {
    const meta = event.object.metadata ?? {};
    const color = colorOverrides.get(event.name) ?? 'green';
    const nodeName = nodeOverrides.get(event.name);
    const rawSpec =
      nodeName !== undefined ? { nodeName } : (event.object.spec ?? undefined);
    return {
      uid: meta.uid ?? `${event.namespace ?? '~'}/${event.name}`,
      kind: event.kind,
      apiVersion: event.apiVersion,
      name: event.name,
      namespace: event.namespace,
      labels: meta.labels ?? {},
      annotations: meta.annotations ?? {},
      creationTimestamp: meta.creationTimestamp ?? '',
      resourceVersion: meta.resourceVersion ?? '',
      status: { color, label: 'Running' },
      raw: {
        ...event.object,
        ...(rawSpec !== undefined ? { spec: rawSpec } : {}),
      },
    };
  };
}

// ---------------------------------------------------------------------------
// World extension interface
// ---------------------------------------------------------------------------

interface StoreWorld extends PrivateerWorld {
  store: StateStore;
  aggregator: WatchAggregator;
  client: FakeKubeClient;
  notifyCount: number;
  /** Snapshot of notifyCount captured immediately after synchronous emit(s). */
  notifyCountAfterEmit: number;
  unsubscribe: (() => void) | undefined;
  colorOverrides: Map<string, StatusColor>;
  nodeOverrides: Map<string, string>;
}

// ---------------------------------------------------------------------------
// Rebuild store helper — called when overrides change mid-scenario
// ---------------------------------------------------------------------------

function rebuildStore(world: StoreWorld): void {
  const notify = world.unsubscribe;
  if (notify !== undefined) {
    notify();
  }
  world.store = new StateStore(
    makeStubMapper(world.colorOverrides, world.nodeOverrides),
  );
  world.notifyCount = 0;
  world.notifyCountAfterEmit = 0;

  const agg = new WatchAggregator();
  agg.watch(world.client, 'Pod', {});
  agg.subscribe((event) => {
    world.store.applyEvent('test-ctx', event);
  });
  world.aggregator = agg;
}

// ---------------------------------------------------------------------------
// Background
// ---------------------------------------------------------------------------

Given(
  'a fresh state store with context {string}',
  function (this: StoreWorld, _ctx: string) {
    this.client = new FakeKubeClient();
    this.colorOverrides = new Map();
    this.nodeOverrides = new Map();
    this.notifyCount = 0;
    this.notifyCountAfterEmit = 0;
    this.unsubscribe = undefined;

    this.store = new StateStore(
      makeStubMapper(this.colorOverrides, this.nodeOverrides),
    );
    this.aggregator = new WatchAggregator();
    this.aggregator.watch(this.client, 'Pod', {});
    this.aggregator.subscribe((event) => {
      this.store.applyEvent('test-ctx', event);
    });
  },
);

// ---------------------------------------------------------------------------
// Helpers to emit events
// ---------------------------------------------------------------------------

function emitAdded(
  world: StoreWorld,
  ref: string,
  extra?: Partial<KubernetesObject>,
): void {
  const { namespace, name } = parseRef(ref);
  const obj: KubernetesObject = {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: {
      name,
      namespace,
      uid: `${namespace}/${name}`,
      resourceVersion: '1',
      creationTimestamp: '2024-01-01T00:00:00Z',
      ...extra?.metadata,
    },
    ...extra,
  };
  world.client.emit({
    type: 'ADDED',
    apiVersion: 'v1',
    kind: 'Pod',
    namespace,
    name,
    object: obj,
  });
}

// ---------------------------------------------------------------------------
// When — emit events
// ---------------------------------------------------------------------------

When(
  'the watch aggregator receives an ADDED event for Pod {string}',
  function (this: StoreWorld, ref: string) {
    emitAdded(this, ref);
  },
);

When(
  'the watch aggregator receives a MODIFIED event for Pod {string}',
  function (this: StoreWorld, ref: string) {
    const { namespace, name } = parseRef(ref);
    const obj: KubernetesObject = {
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: {
        name,
        namespace,
        uid: `${namespace}/${name}`,
        resourceVersion: '2',
        creationTimestamp: '2024-01-01T00:00:00Z',
      },
    };
    this.client.emit({
      type: 'MODIFIED',
      apiVersion: 'v1',
      kind: 'Pod',
      namespace,
      name,
      object: obj,
    });
  },
);

When(
  'the watch aggregator receives a DELETED event for Pod {string}',
  function (this: StoreWorld, ref: string) {
    const { namespace, name } = parseRef(ref);
    const obj: KubernetesObject = {
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: { name, namespace },
    };
    this.client.emit({
      type: 'DELETED',
      apiVersion: 'v1',
      kind: 'Pod',
      namespace,
      name,
      object: obj,
    });
  },
);

When(
  'the watch aggregator receives an ADDED event for Pod {string} with managedFields',
  function (this: StoreWorld, ref: string) {
    const { namespace, name } = parseRef(ref);
    const obj: KubernetesObject = {
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: {
        name,
        namespace,
        uid: `${namespace}/${name}`,
        resourceVersion: '1',
        creationTimestamp: '',
        managedFields: [{ manager: 'kubectl', operation: 'Apply' }],
      },
    };
    this.client.emit({
      type: 'ADDED',
      apiVersion: 'v1',
      kind: 'Pod',
      namespace,
      name,
      object: obj,
    });
  },
);

When(
  'the watch aggregator receives an ADDED event for Pod {string} with last-applied-configuration annotation',
  function (this: StoreWorld, ref: string) {
    const { namespace, name } = parseRef(ref);
    const obj: KubernetesObject = {
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: {
        name,
        namespace,
        uid: `${namespace}/${name}`,
        resourceVersion: '1',
        creationTimestamp: '',
        annotations: {
          'kubectl.kubernetes.io/last-applied-configuration':
            '{"apiVersion":"v1"}',
          app: 'test',
        },
      },
    };
    this.client.emit({
      type: 'ADDED',
      apiVersion: 'v1',
      kind: 'Pod',
      namespace,
      name,
      object: obj,
    });
  },
);

/**
 * Emit a single ADDED event and capture the synchronous notification count
 * immediately after. This happens within one synchronous step so the count
 * is zero before any microtask has run.
 */
When(
  'a single ADDED event is emitted and the synchronous notification count is captured',
  function (this: StoreWorld) {
    emitAdded(this, 'default/notify-1');
    this.notifyCountAfterEmit = this.notifyCount;
  },
);

/**
 * Emit two ADDED events then capture the synchronous notification count.
 * Both emits happen in the same synchronous turn, so coalescing means the
 * count must still be zero.
 */
When(
  'two ADDED events are emitted and the synchronous notification count is captured',
  function (this: StoreWorld) {
    emitAdded(this, 'default/coalesce-a');
    emitAdded(this, 'default/coalesce-b');
    this.notifyCountAfterEmit = this.notifyCount;
  },
);

When(
  'the store has Pods {string} with color {string} and {string} with color {string}',
  function (
    this: StoreWorld,
    ref1: string,
    color1: string,
    ref2: string,
    color2: string,
  ) {
    const { name: name1 } = parseRef(ref1);
    const { name: name2 } = parseRef(ref2);
    this.colorOverrides.set(name1, color1 as StatusColor);
    this.colorOverrides.set(name2, color2 as StatusColor);
    rebuildStore(this);
    emitAdded(this, ref1);
    emitAdded(this, ref2);
  },
);

When(
  'the watch aggregator receives an ADDED event for Pod {string} on node {string}',
  function (this: StoreWorld, ref: string, nodeName: string) {
    const { name } = parseRef(ref);
    this.nodeOverrides.set(name, nodeName);
    rebuildStore(this);
    emitAdded(this, ref, { spec: { nodeName } });
  },
);

When(
  'the watch aggregator for context {string} receives an ADDED event for Pod {string}',
  function (this: StoreWorld, ctx: string, ref: string) {
    const { namespace, name } = parseRef(ref);
    const obj: KubernetesObject = {
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: {
        name,
        namespace,
        uid: `${namespace}/${name}`,
        resourceVersion: '1',
        creationTimestamp: '',
      },
    };
    // Use a separate client+aggregator for this context so it does not
    // interfere with the primary "test-ctx" wiring.
    const extraClient = new FakeKubeClient();
    const agg = new WatchAggregator();
    agg.watch(extraClient, 'Pod', {});
    agg.subscribe((event) => {
      this.store.applyEvent(ctx, event);
    });
    extraClient.emit({
      type: 'ADDED',
      apiVersion: 'v1',
      kind: 'Pod',
      namespace,
      name,
      object: obj,
    });
  },
);

// ---------------------------------------------------------------------------
// Given — pre-existing state (aliases for When in Given position)
// ---------------------------------------------------------------------------

Given(
  'the watch aggregator has received an ADDED event for Pod {string}',
  function (this: StoreWorld, ref: string) {
    emitAdded(this, ref);
  },
);

Given('a subscriber is registered on the store', function (this: StoreWorld) {
  this.notifyCount = 0;
  this.notifyCountAfterEmit = 0;
  this.unsubscribe = this.store.subscribe(() => {
    this.notifyCount += 1;
  });
});

Given('the subscriber is unsubscribed', function (this: StoreWorld) {
  assert.ok(this.unsubscribe !== undefined, 'unsubscribe fn is not set');
  this.unsubscribe();
});

// ---------------------------------------------------------------------------
// Then — assertions
// ---------------------------------------------------------------------------

Then(
  'the store contains Pod {string} in context {string}',
  function (this: StoreWorld, ref: string, ctx: string) {
    const { namespace, name } = parseRef(ref);
    const obj = this.store.get(ctx, 'Pod', namespace, name);
    assert.ok(
      obj !== undefined,
      `expected Pod ${ref} in context ${ctx} but it was absent`,
    );
  },
);

Then(
  'the store does not contain Pod {string} in context {string}',
  function (this: StoreWorld, ref: string, ctx: string) {
    const { namespace, name } = parseRef(ref);
    const obj = this.store.get(ctx, 'Pod', namespace, name);
    assert.ok(
      obj === undefined,
      `expected Pod ${ref} to be absent from context ${ctx} but it was present`,
    );
  },
);

Then(
  'the store lists {int} Pod in namespace {string}',
  function (this: StoreWorld, count: number, ns: string) {
    const items = this.store.list('test-ctx', 'Pod', ns);
    assert.strictEqual(
      items.length,
      count,
      `expected ${String(count)} Pod(s) in ns ${ns}, got ${String(items.length)}`,
    );
  },
);

Then(
  'the store lists {int} Pods in namespace {string}',
  function (this: StoreWorld, count: number, ns: string) {
    const items = this.store.list('test-ctx', 'Pod', ns);
    assert.strictEqual(
      items.length,
      count,
      `expected ${String(count)} Pod(s) in ns ${ns}, got ${String(items.length)}`,
    );
  },
);

Then(
  'the stored Pod {string} has no managedFields',
  function (this: StoreWorld, ref: string) {
    const { namespace, name } = parseRef(ref);
    const obj = this.store.get('test-ctx', 'Pod', namespace, name);
    assert.ok(obj !== undefined, `Pod ${ref} not found`);
    assert.ok(
      obj.raw.metadata?.managedFields === undefined,
      'expected managedFields to be stripped',
    );
  },
);

Then(
  'the stored Pod {string} has no last-applied-configuration annotation',
  function (this: StoreWorld, ref: string) {
    const { namespace, name } = parseRef(ref);
    const obj = this.store.get('test-ctx', 'Pod', namespace, name);
    assert.ok(obj !== undefined, `Pod ${ref} not found`);
    const lastApplied =
      obj.raw.metadata?.annotations?.[
        'kubectl.kubernetes.io/last-applied-configuration'
      ];
    assert.ok(
      lastApplied === undefined,
      'expected last-applied-configuration to be stripped',
    );
  },
);

Then(
  'the synchronous notification count is {int}',
  function (this: StoreWorld, expected: number) {
    assert.strictEqual(
      this.notifyCountAfterEmit,
      expected,
      `expected synchronous notification count to be ${String(expected)}, got ${String(this.notifyCountAfterEmit)}`,
    );
  },
);

Then(
  'after awaiting a microtask the subscriber has been called once',
  async function (this: StoreWorld) {
    await Promise.resolve();
    assert.strictEqual(
      this.notifyCount,
      1,
      `expected 1 notification after microtask, got ${String(this.notifyCount)}`,
    );
  },
);

Then('after awaiting a microtask', async function (this: StoreWorld) {
  await Promise.resolve();
});

Then(
  'the subscriber has been called {int} times',
  function (this: StoreWorld, count: number) {
    assert.strictEqual(
      this.notifyCount,
      count,
      `expected ${String(count)} notification(s), got ${String(this.notifyCount)}`,
    );
  },
);

Then(
  'the namespace rollup for {string} in context {string} has green count {int} and red count {int}',
  function (
    this: StoreWorld,
    ns: string,
    ctx: string,
    greenCount: number,
    redCount: number,
  ) {
    const resources = this.store.all(ctx);
    const rollups = rollupByNamespace(resources);
    const rollup = rollups.get(ns);
    assert.ok(rollup !== undefined, `no rollup for namespace "${ns}"`);
    assert.strictEqual(
      rollup.counts.green,
      greenCount,
      `green: expected ${String(greenCount)}, got ${String(rollup.counts.green)}`,
    );
    assert.strictEqual(
      rollup.counts.red,
      redCount,
      `red: expected ${String(redCount)}, got ${String(rollup.counts.red)}`,
    );
  },
);

Then(
  'the node rollup for {string} in context {string} has total count {int}',
  function (this: StoreWorld, nodeName: string, ctx: string, total: number) {
    const resources = this.store.all(ctx);
    const rollups = rollupByNode(resources);
    const rollup = rollups.get(nodeName);
    assert.ok(rollup !== undefined, `no rollup for node "${nodeName}"`);
    assert.strictEqual(
      rollup.total,
      total,
      `total: expected ${String(total)}, got ${String(rollup.total)}`,
    );
  },
);
