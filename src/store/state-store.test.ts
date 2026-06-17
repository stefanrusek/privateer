import { describe, it, expect, vi } from 'vitest';
import { StateStore, stripHeavyFields } from './state-store.js';
import type {
  ResourceEvent,
  ResourceObject,
  KubernetesObject,
} from '../core/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(
  type: ResourceEvent['type'],
  name: string,
  namespace: string | null = 'default',
  extra: Partial<KubernetesObject> = {},
): ResourceEvent {
  const obj: KubernetesObject = {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: {
      name,
      uid: `${namespace ?? '~'}/${name}`,
      resourceVersion: '1',
      creationTimestamp: '2024-01-01T00:00:00Z',
      ...(namespace !== null ? { namespace } : {}),
    },
    ...extra,
  };
  return {
    type,
    apiVersion: 'v1',
    kind: 'Pod',
    namespace,
    name,
    object: obj,
    receivedAt: 0,
  };
}

/** Stub mapper — fills in required ResourceObject fields from the event. */
function stubMapper(event: ResourceEvent): ResourceObject {
  const meta = event.object.metadata ?? {};
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
    status: { color: 'green', label: 'Running' },
    raw: event.object,
  };
}

function makeStore(): StateStore {
  return new StateStore(stubMapper);
}

// ---------------------------------------------------------------------------
// stripHeavyFields
// ---------------------------------------------------------------------------

describe('stripHeavyFields', () => {
  it('removes managedFields from metadata', () => {
    const obj: KubernetesObject = {
      metadata: { name: 'a', managedFields: [{ manager: 'kubectl' }] },
    };
    const stripped = stripHeavyFields(obj);
    expect(stripped.metadata?.managedFields).toBeUndefined();
    expect(stripped.metadata?.name).toBe('a');
  });

  it('removes last-applied-configuration annotation', () => {
    const obj: KubernetesObject = {
      metadata: {
        name: 'a',
        annotations: {
          'kubectl.kubernetes.io/last-applied-configuration': '{}',
          other: 'keep',
        },
      },
    };
    const stripped = stripHeavyFields(obj);
    expect(
      stripped.metadata?.annotations?.[
        'kubectl.kubernetes.io/last-applied-configuration'
      ],
    ).toBeUndefined();
    expect(stripped.metadata?.annotations?.other).toBe('keep');
  });

  it('drops annotations entirely when only last-applied-configuration was present', () => {
    const obj: KubernetesObject = {
      metadata: {
        name: 'a',
        annotations: {
          'kubectl.kubernetes.io/last-applied-configuration': '{}',
        },
      },
    };
    const stripped = stripHeavyFields(obj);
    expect(stripped.metadata?.annotations).toBeUndefined();
  });

  it('leaves an object with no metadata unchanged (same reference)', () => {
    const obj: KubernetesObject = { kind: 'Pod' };
    expect(stripHeavyFields(obj)).toBe(obj);
  });

  it('handles metadata with no annotations', () => {
    const obj: KubernetesObject = {
      metadata: { name: 'b', managedFields: [] },
    };
    const stripped = stripHeavyFields(obj);
    expect(stripped.metadata?.managedFields).toBeUndefined();
    expect(stripped.metadata?.annotations).toBeUndefined();
  });

  it('does not mutate the original object', () => {
    const mf = [{ manager: 'kubectl' }];
    const obj: KubernetesObject = { metadata: { managedFields: mf } };
    const stripped = stripHeavyFields(obj);
    expect(obj.metadata?.managedFields).toBe(mf);
    expect(stripped.metadata?.managedFields).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// StateStore — mutations
// ---------------------------------------------------------------------------

describe('StateStore mutations', () => {
  it('inserts a resource on ADDED', () => {
    const store = makeStore();
    store.applyEvent('ctx', makeEvent('ADDED', 'web-1'));
    expect(store.get('ctx', 'Pod', 'default', 'web-1')).toBeDefined();
  });

  it('updates a resource on MODIFIED', () => {
    const store = makeStore();
    store.applyEvent('ctx', makeEvent('ADDED', 'web-1'));
    const modified = makeEvent('MODIFIED', 'web-1');
    (modified.object.metadata as { resourceVersion: string }).resourceVersion =
      '2';
    store.applyEvent('ctx', modified);
    const obj = store.get('ctx', 'Pod', 'default', 'web-1');
    expect(obj?.resourceVersion).toBe('2');
  });

  it('removes a resource on DELETED', () => {
    const store = makeStore();
    store.applyEvent('ctx', makeEvent('ADDED', 'web-1'));
    store.applyEvent('ctx', makeEvent('DELETED', 'web-1'));
    expect(store.get('ctx', 'Pod', 'default', 'web-1')).toBeUndefined();
  });

  it('handles cluster-scoped resources (namespace = null)', () => {
    const store = makeStore();
    store.applyEvent('ctx', makeEvent('ADDED', 'my-node', null));
    expect(store.get('ctx', 'Pod', null, 'my-node')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// StateStore — reconcileList (refresh prune; BUG-C1 regression)
// ---------------------------------------------------------------------------

describe('StateStore.reconcileList', () => {
  it('removes stored items of the kind absent from the fresh LIST', () => {
    const store = makeStore();
    store.applyEvent('ctx', makeEvent('ADDED', 'web-1'));
    store.applyEvent('ctx', makeEvent('ADDED', 'web-2'));
    // Fresh LIST only saw web-1 — web-2 was deleted while we missed the event.
    const removed = store.reconcileList(
      'ctx',
      'Pod',
      new Set(['default/web-1']),
    );
    expect(removed.map((r) => r.name)).toEqual(['web-2']);
    expect(store.get('ctx', 'Pod', 'default', 'web-1')).toBeDefined();
    expect(store.get('ctx', 'Pod', 'default', 'web-2')).toBeUndefined();
  });

  it('keeps items present in the fresh LIST and returns nothing removed', () => {
    const store = makeStore();
    store.applyEvent('ctx', makeEvent('ADDED', 'web-1'));
    const removed = store.reconcileList(
      'ctx',
      'Pod',
      new Set(['default/web-1']),
    );
    expect(removed).toEqual([]);
    expect(store.get('ctx', 'Pod', 'default', 'web-1')).toBeDefined();
  });

  it('only prunes the requested kind, leaving other kinds intact', () => {
    const store = makeStore();
    store.applyEvent('ctx', makeEvent('ADDED', 'web-1'));
    const svc = makeEvent('ADDED', 'svc-1');
    svc.kind = 'Service';
    (svc.object as { kind: string }).kind = 'Service';
    store.applyEvent('ctx', svc);
    // Reconcile Pods with an empty present set — Service must survive.
    const removed = store.reconcileList('ctx', 'Pod', new Set());
    expect(removed.map((r) => r.name)).toEqual(['web-1']);
    expect(store.get('ctx', 'Service', 'default', 'svc-1')).toBeDefined();
  });

  it('narrows to a namespace when one is given', () => {
    const store = makeStore();
    store.applyEvent('ctx', makeEvent('ADDED', 'a', 'demo'));
    store.applyEvent('ctx', makeEvent('ADDED', 'b', 'prod'));
    // Reconcile only the demo namespace with an empty present set: b (prod)
    // is out of scope and must remain.
    const removed = store.reconcileList('ctx', 'Pod', new Set(), 'demo');
    expect(removed.map((r) => r.name)).toEqual(['a']);
    expect(store.get('ctx', 'Pod', 'prod', 'b')).toBeDefined();
  });

  it('handles cluster-scoped (null namespace) identities', () => {
    const store = makeStore();
    store.applyEvent('ctx', makeEvent('ADDED', 'node-1', null));
    store.applyEvent('ctx', makeEvent('ADDED', 'node-2', null));
    const removed = store.reconcileList('ctx', 'Pod', new Set(['~/node-1']));
    expect(removed.map((r) => r.name)).toEqual(['node-2']);
    expect(store.get('ctx', 'Pod', null, 'node-1')).toBeDefined();
  });

  it('returns nothing for an unknown context', () => {
    const store = makeStore();
    expect(store.reconcileList('missing', 'Pod', new Set())).toEqual([]);
  });

  it('notifies subscribers when something was removed', async () => {
    const store = makeStore();
    store.applyEvent('ctx', makeEvent('ADDED', 'web-1'));
    await Promise.resolve();
    const fn = vi.fn();
    store.subscribe(fn);
    store.reconcileList('ctx', 'Pod', new Set());
    await Promise.resolve();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not notify when nothing was removed', async () => {
    const store = makeStore();
    store.applyEvent('ctx', makeEvent('ADDED', 'web-1'));
    await Promise.resolve();
    const fn = vi.fn();
    store.subscribe(fn);
    store.reconcileList('ctx', 'Pod', new Set(['default/web-1']));
    await Promise.resolve();
    expect(fn).not.toHaveBeenCalled();
  });

  it('strips managedFields before storing', () => {
    const store = makeStore();
    const event = makeEvent('ADDED', 'w', 'default', {
      metadata: {
        name: 'w',
        namespace: 'default',
        uid: 'default/w',
        resourceVersion: '1',
        creationTimestamp: '',
        managedFields: [{ manager: 'kubectl' }],
      },
    });
    store.applyEvent('ctx', event);
    const obj = store.get('ctx', 'Pod', 'default', 'w');
    expect(obj?.raw.metadata?.managedFields).toBeUndefined();
  });

  it('strips last-applied-configuration annotation before storing', () => {
    const store = makeStore();
    const event = makeEvent('ADDED', 'la', 'default', {
      metadata: {
        name: 'la',
        namespace: 'default',
        uid: 'default/la',
        resourceVersion: '1',
        creationTimestamp: '',
        annotations: {
          'kubectl.kubernetes.io/last-applied-configuration': '{}',
          app: 'test',
        },
      },
    });
    store.applyEvent('ctx', event);
    const obj = store.get('ctx', 'Pod', 'default', 'la');
    expect(
      obj?.raw.metadata?.annotations?.[
        'kubectl.kubernetes.io/last-applied-configuration'
      ],
    ).toBeUndefined();
    expect(obj?.raw.metadata?.annotations?.app).toBe('test');
  });
});

// ---------------------------------------------------------------------------
// StateStore — queries
// ---------------------------------------------------------------------------

describe('StateStore queries', () => {
  it('returns undefined for missing context', () => {
    const store = makeStore();
    expect(store.get('nope', 'Pod', 'default', 'x')).toBeUndefined();
  });

  it('returns undefined for missing resource', () => {
    const store = makeStore();
    store.applyEvent('ctx', makeEvent('ADDED', 'a'));
    expect(store.get('ctx', 'Pod', 'default', 'missing')).toBeUndefined();
  });

  it('list returns all resources of a kind', () => {
    const store = makeStore();
    store.applyEvent('ctx', makeEvent('ADDED', 'a'));
    store.applyEvent('ctx', makeEvent('ADDED', 'b'));
    expect(store.list('ctx', 'Pod')).toHaveLength(2);
  });

  it('list filters by namespace', () => {
    const store = makeStore();
    store.applyEvent('ctx', makeEvent('ADDED', 'a', 'ns1'));
    store.applyEvent('ctx', makeEvent('ADDED', 'b', 'ns2'));
    expect(store.list('ctx', 'Pod', 'ns1')).toHaveLength(1);
  });

  it('list excludes other kinds', () => {
    const store = makeStore();
    const deplEvent: ResourceEvent = {
      ...makeEvent('ADDED', 'dep', 'default'),
      kind: 'Deployment',
      apiVersion: 'apps/v1',
    };
    store.applyEvent('ctx', makeEvent('ADDED', 'pod-a'));
    store.applyEvent('ctx', deplEvent);
    expect(store.list('ctx', 'Pod')).toHaveLength(1);
    expect(store.list('ctx', 'Deployment')).toHaveLength(1);
  });

  it('list returns empty array for unknown context', () => {
    const store = makeStore();
    expect(store.list('ghost', 'Pod')).toEqual([]);
  });

  it('all returns everything in a context', () => {
    const store = makeStore();
    store.applyEvent('ctx', makeEvent('ADDED', 'a'));
    store.applyEvent('ctx', makeEvent('ADDED', 'b'));
    expect(store.all('ctx')).toHaveLength(2);
  });

  it('all returns empty array for unknown context', () => {
    const store = makeStore();
    expect(store.all('ghost')).toEqual([]);
  });

  it('stores resources across multiple contexts independently', () => {
    const store = makeStore();
    store.applyEvent('ctx-a', makeEvent('ADDED', 'pod-a'));
    store.applyEvent('ctx-b', makeEvent('ADDED', 'pod-b'));
    expect(store.list('ctx-a', 'Pod')).toHaveLength(1);
    expect(store.list('ctx-b', 'Pod')).toHaveLength(1);
    expect(store.list('ctx-a', 'Pod')[0]?.name).toBe('pod-a');
    expect(store.list('ctx-b', 'Pod')[0]?.name).toBe('pod-b');
  });
});

// ---------------------------------------------------------------------------
// StateStore — subscriptions
// ---------------------------------------------------------------------------

describe('StateStore subscriptions', () => {
  it('does not call the listener synchronously', () => {
    const store = makeStore();
    const fn = vi.fn();
    store.subscribe(fn);
    store.applyEvent('ctx', makeEvent('ADDED', 'x'));
    expect(fn).not.toHaveBeenCalled();
  });

  it('calls the listener after a microtask', async () => {
    const store = makeStore();
    const fn = vi.fn();
    store.subscribe(fn);
    store.applyEvent('ctx', makeEvent('ADDED', 'x'));
    await Promise.resolve();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('coalesces multiple mutations into one notification', async () => {
    const store = makeStore();
    const fn = vi.fn();
    store.subscribe(fn);
    store.applyEvent('ctx', makeEvent('ADDED', 'a'));
    store.applyEvent('ctx', makeEvent('ADDED', 'b'));
    store.applyEvent('ctx', makeEvent('ADDED', 'c'));
    await Promise.resolve();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('calls multiple listeners', async () => {
    const store = makeStore();
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    store.subscribe(fn1);
    store.subscribe(fn2);
    store.applyEvent('ctx', makeEvent('ADDED', 'x'));
    await Promise.resolve();
    expect(fn1).toHaveBeenCalledTimes(1);
    expect(fn2).toHaveBeenCalledTimes(1);
  });

  it('does not call unsubscribed listener', async () => {
    const store = makeStore();
    const fn = vi.fn();
    const unsub = store.subscribe(fn);
    unsub();
    store.applyEvent('ctx', makeEvent('ADDED', 'x'));
    await Promise.resolve();
    expect(fn).not.toHaveBeenCalled();
  });

  it('unsubscribe is idempotent', async () => {
    const store = makeStore();
    const fn = vi.fn();
    const unsub = store.subscribe(fn);
    unsub();
    unsub(); // should not throw
    store.applyEvent('ctx', makeEvent('ADDED', 'x'));
    await Promise.resolve();
    expect(fn).not.toHaveBeenCalled();
  });

  it('fires again after a second batch of mutations', async () => {
    const store = makeStore();
    const fn = vi.fn();
    store.subscribe(fn);

    store.applyEvent('ctx', makeEvent('ADDED', 'a'));
    await Promise.resolve();
    expect(fn).toHaveBeenCalledTimes(1);

    store.applyEvent('ctx', makeEvent('ADDED', 'b'));
    await Promise.resolve();
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
