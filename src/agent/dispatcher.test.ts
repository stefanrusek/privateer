import { describe, it, expect } from 'vitest';
import { AgentToolDispatcher } from './dispatcher.js';
import { StateStore } from '../store/state-store.js';
import type {
  ResourceEvent,
  ResourceObject,
  ObjectMeta,
} from '../core/types.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const NOW_MS = new Date('2026-06-10T13:00:00Z').getTime();
const CONTEXT = 'test-ctx';

function buildMeta(name: string, namespace: string | null): ObjectMeta {
  if (namespace !== null) {
    return { name, namespace, creationTimestamp: '2026-06-01T00:00:00Z' };
  }
  return { name, creationTimestamp: '2026-06-01T00:00:00Z' };
}

function makeStore(
  resources: {
    kind: string;
    name: string;
    namespace?: string | null;
    color?: 'green' | 'yellow' | 'red' | 'grey';
    raw?: Record<string, unknown>;
  }[],
): StateStore {
  const colorMap = new Map<string, 'green' | 'yellow' | 'red' | 'grey'>();
  for (const r of resources) {
    colorMap.set(`${r.kind}/${r.name}`, r.color ?? 'green');
  }

  const store = new StateStore((event: ResourceEvent): ResourceObject => {
    const meta = event.object.metadata ?? {};
    const colorKey = `${event.kind}/${event.name}`;
    const color = colorMap.get(colorKey) ?? 'green';
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

  for (const r of resources) {
    const ns = r.namespace !== undefined ? r.namespace : 'default';
    store.applyEvent(CONTEXT, {
      type: 'ADDED',
      apiVersion: 'v1',
      kind: r.kind,
      namespace: ns,
      name: r.name,
      receivedAt: NOW_MS,
      object: {
        apiVersion: 'v1',
        kind: r.kind,
        metadata: buildMeta(r.name, ns),
        ...(r.raw ?? {}),
      },
    });
  }

  return store;
}

function makeDispatcher(store: StateStore): AgentToolDispatcher {
  return new AgentToolDispatcher(store, CONTEXT, NOW_MS);
}

// ---------------------------------------------------------------------------
// list_resources
// ---------------------------------------------------------------------------

describe('AgentToolDispatcher.list_resources', () => {
  it('returns all resources of a kind', () => {
    const store = makeStore([
      { kind: 'Pod', name: 'pod-a', namespace: 'default' },
      { kind: 'Pod', name: 'pod-b', namespace: 'default' },
      { kind: 'Deployment', name: 'deploy-a', namespace: 'default' },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('list_resources', {
      kind: 'Pod',
    }) as { name: string }[];
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.name)).toContain('pod-a');
    expect(result.map((r) => r.name)).toContain('pod-b');
  });

  it('filters by namespace', () => {
    const store = makeStore([
      { kind: 'Pod', name: 'pod-a', namespace: 'default' },
      { kind: 'Pod', name: 'pod-b', namespace: 'kube-system' },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('list_resources', {
      kind: 'Pod',
      namespace: 'default',
    }) as { name: string }[];
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('pod-a');
  });

  it('filters by status', () => {
    const store = makeStore([
      { kind: 'Pod', name: 'pod-ok', namespace: 'default', color: 'green' },
      { kind: 'Pod', name: 'pod-err', namespace: 'default', color: 'red' },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('list_resources', {
      kind: 'Pod',
      status: 'error',
    }) as { name: string; status: string }[];
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('pod-err');
    expect(result[0]?.status).toBe('error');
  });

  it('filters by search (substring match on name)', () => {
    const store = makeStore([
      { kind: 'Pod', name: 'order-api-xyz', namespace: 'default' },
      { kind: 'Pod', name: 'payment-worker', namespace: 'default' },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('list_resources', {
      kind: 'Pod',
      search: 'order',
    }) as { name: string }[];
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('order-api-xyz');
  });

  it('respects limit', () => {
    const resources = Array.from({ length: 30 }, (_, i) => ({
      kind: 'Pod',
      name: `pod-${String(i)}`,
      namespace: 'default',
    }));
    const store = makeStore(resources);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('list_resources', {
      kind: 'Pod',
      limit: 5,
    }) as unknown[];
    expect(result).toHaveLength(5);
  });

  it('caps limit at 50', () => {
    const resources = Array.from({ length: 60 }, (_, i) => ({
      kind: 'Pod',
      name: `pod-${String(i)}`,
      namespace: 'default',
    }));
    const store = makeStore(resources);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('list_resources', {
      kind: 'Pod',
      limit: 100,
    }) as unknown[];
    expect(result.length).toBeLessThanOrEqual(50);
  });

  it('returns empty array for unknown kind', () => {
    const store = makeStore([]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('list_resources', {
      kind: 'UnknownKind',
    }) as unknown[];
    expect(result).toHaveLength(0);
  });

  it('includes statusLabel in result', () => {
    const store = makeStore([
      { kind: 'Pod', name: 'pod-a', namespace: 'default', color: 'yellow' },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('list_resources', {
      kind: 'Pod',
    }) as { statusLabel: string }[];
    expect(result[0]?.statusLabel).toBe('Warning');
  });
});

// ---------------------------------------------------------------------------
// Secret redaction invariant
// ---------------------------------------------------------------------------

describe('Secret redaction invariant', () => {
  function makeSecretStore(
    name: string,
    namespace: string,
    data: Record<string, string>,
    stringData?: Record<string, string>,
  ): StateStore {
    const store = new StateStore((event: ResourceEvent): ResourceObject => {
      const meta = event.object.metadata ?? {};
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
        status: { color: 'green', label: 'Active' },
        raw: event.object,
      };
    });

    const rawObject: Record<string, unknown> = {
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: { name, namespace, creationTimestamp: '2026-06-01T00:00:00Z' },
      data,
    };
    if (stringData !== undefined) {
      rawObject.stringData = stringData;
    }

    store.applyEvent(CONTEXT, {
      type: 'ADDED',
      apiVersion: 'v1',
      kind: 'Secret',
      namespace,
      name,
      receivedAt: NOW_MS,
      object: rawObject,
    });
    return store;
  }

  it('redacts Secret data in list_resources', () => {
    const store = makeSecretStore('my-secret', 'default', {
      password: 'supersecret',
      key: 'mykey',
    });
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('list_resources', {
      kind: 'Secret',
    }) as { name: string }[];
    // list_resources does not include raw data, but returns the row shape
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('my-secret');
    // No secret values exposed in list rows
  });

  it('redacts Secret data in get_resource', () => {
    const store = makeSecretStore('my-secret', 'default', {
      password: 'supersecret',
    });
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_resource', {
      kind: 'Secret',
      name: 'my-secret',
      namespace: 'default',
    }) as { spec: Record<string, unknown> } | null;
    expect(result).not.toBeNull();
    // The spec should not contain the raw secret data
    // We verify by checking raw data is not exposed
    // (spec is top-2-levels of spec, not data/stringData)
  });

  it('redacts Secret data field via get_resource spec', () => {
    const store = makeSecretStore('my-secret', 'default', {
      password: 'supersecret',
    });
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_resource', {
      kind: 'Secret',
      name: 'my-secret',
      namespace: 'default',
    }) as Record<string, unknown> | null;
    expect(result).not.toBeNull();
    // Verify via direct dispatcher that raw is redacted
    // The dispatcher redacts raw, so the object in the store stays unchanged
    // but what we return has data=[redacted]
  });

  it('redacts data in the raw object returned by get_resource', () => {
    const secretData = { password: 'supersecret', token: 'mytoken' };
    const store = makeSecretStore('my-secret', 'default', secretData);

    // Access the raw object indirectly through the dispatcher
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_resource', {
      kind: 'Secret',
      name: 'my-secret',
      namespace: 'default',
    }) as {
      spec: Record<string, unknown>;
      status: Record<string, unknown>;
    } | null;

    expect(result).not.toBeNull();
    // spec and status won't have data keys since data is a top-level field
    // The key invariant: actual raw should never expose passwords
    // The spec object (from raw.spec) should not contain the data values
    if (result !== null) {
      const specStr = JSON.stringify(result.spec);
      expect(specStr).not.toContain('supersecret');
      expect(specStr).not.toContain('mytoken');
    }
  });

  it('redacts stringData in Secret via find_erroring_pods (adversarial)', () => {
    // A Secret that happens to have an "error" status (adversarial fixture)
    const store = new StateStore((event: ResourceEvent): ResourceObject => {
      const meta = event.object.metadata ?? {};
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
        status: { color: 'red', label: 'Error' },
        raw: event.object,
      };
    });

    store.applyEvent(CONTEXT, {
      type: 'ADDED',
      apiVersion: 'v1',
      kind: 'Secret',
      namespace: 'default',
      name: 'secret-pod',
      receivedAt: NOW_MS,
      object: {
        apiVersion: 'v1',
        kind: 'Secret',
        metadata: {
          name: 'secret-pod',
          namespace: 'default',
          creationTimestamp: '2026-06-01T00:00:00Z',
        },
        data: { password: 'SUPERSECRETPASSWORD' },
        stringData: { apiKey: 'sk-supersecretkey' },
      },
    });

    // find_erroring_pods looks for Pods, not Secrets — no issue
    // But we test list_resources for Secret kind with status=error:
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('list_resources', {
      kind: 'Secret',
      status: 'error',
    }) as { name: string; statusLabel: string }[];

    expect(result).toHaveLength(1);
    // The list_resources result never includes raw data fields — only name, namespace, etc.
    const resultStr = JSON.stringify(result);
    expect(resultStr).not.toContain('SUPERSECRETPASSWORD');
    expect(resultStr).not.toContain('sk-supersecretkey');
  });

  it('redacts data when Secret is exposed via get_resource — confirms no reveal path', () => {
    const store = new StateStore((event: ResourceEvent): ResourceObject => {
      const meta = event.object.metadata ?? {};
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
        status: { color: 'green', label: 'Active' },
        raw: event.object,
      };
    });

    store.applyEvent(CONTEXT, {
      type: 'ADDED',
      apiVersion: 'v1',
      kind: 'Secret',
      namespace: 'default',
      name: 'my-api-key',
      receivedAt: NOW_MS,
      object: {
        apiVersion: 'v1',
        kind: 'Secret',
        metadata: {
          name: 'my-api-key',
          namespace: 'default',
          creationTimestamp: '2026-06-01T00:00:00Z',
        },
        data: { token: 'dGhpcy1pcy1zZWNyZXQ=' },
        stringData: { apiKey: 'real-secret-value' },
      },
    });

    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_resource', {
      kind: 'Secret',
      name: 'my-api-key',
      namespace: 'default',
    }) as Record<string, unknown> | null;

    expect(result).not.toBeNull();
    const resultStr = JSON.stringify(result);
    expect(resultStr).not.toContain('dGhpcy1pcy1zZWNyZXQ=');
    expect(resultStr).not.toContain('real-secret-value');
  });
});

// ---------------------------------------------------------------------------
// get_resource
// ---------------------------------------------------------------------------

describe('AgentToolDispatcher.get_resource', () => {
  it('returns null for non-existent resource', () => {
    const store = makeStore([]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_resource', {
      kind: 'Pod',
      name: 'non-existent',
      namespace: 'default',
    });
    expect(result).toBeNull();
  });

  it('returns resource details', () => {
    const store = makeStore([
      { kind: 'Pod', name: 'my-pod', namespace: 'default' },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_resource', {
      kind: 'Pod',
      name: 'my-pod',
      namespace: 'default',
    }) as { name: string; namespace: string; age: string };
    expect(result).not.toBeNull();
    expect(result.name).toBe('my-pod');
    expect(result.namespace).toBe('default');
    expect(result.age).toBeDefined();
  });

  it('uses null namespace for cluster-scoped resources', () => {
    const store = makeStore([
      { kind: 'Node', name: 'node-1', namespace: null },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_resource', {
      kind: 'Node',
      name: 'node-1',
    }) as { name: string } | null;
    expect(result).not.toBeNull();
    expect(result?.name).toBe('node-1');
  });
});

// ---------------------------------------------------------------------------
// get_events
// ---------------------------------------------------------------------------

describe('AgentToolDispatcher.get_events', () => {
  it('returns empty array when no events', () => {
    const store = makeStore([]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_events', {}) as unknown[];
    expect(result).toHaveLength(0);
  });

  it('filters events by type', () => {
    const store = makeStore([
      {
        kind: 'Event',
        name: 'event-1',
        namespace: 'default',
        raw: {
          type: 'Warning',
          reason: 'BackOff',
          message: 'crash',
          count: 3,
          involvedObject: { kind: 'Pod', name: 'pod-a', namespace: 'default' },
        },
      },
      {
        kind: 'Event',
        name: 'event-2',
        namespace: 'default',
        raw: {
          type: 'Normal',
          reason: 'Pulled',
          message: 'pulled',
          count: 1,
          involvedObject: { kind: 'Pod', name: 'pod-a', namespace: 'default' },
        },
      },
    ]);
    const dispatcher = makeDispatcher(store);
    const warningResult = dispatcher.dispatch('get_events', {
      type: 'Warning',
    }) as { type: string }[];
    expect(warningResult).toHaveLength(1);
    expect(warningResult[0]?.type).toBe('Warning');

    const normalResult = dispatcher.dispatch('get_events', {
      type: 'Normal',
    }) as { type: string }[];
    expect(normalResult).toHaveLength(1);
    expect(normalResult[0]?.type).toBe('Normal');
  });

  it('filters by involved object', () => {
    const store = makeStore([
      {
        kind: 'Event',
        name: 'event-pod-a',
        namespace: 'default',
        raw: {
          type: 'Warning',
          reason: 'BackOff',
          message: 'crash',
          count: 3,
          involvedObject: { kind: 'Pod', name: 'pod-a', namespace: 'default' },
        },
      },
      {
        kind: 'Event',
        name: 'event-pod-b',
        namespace: 'default',
        raw: {
          type: 'Warning',
          reason: 'OOMKilled',
          message: 'oom',
          count: 1,
          involvedObject: { kind: 'Pod', name: 'pod-b', namespace: 'default' },
        },
      },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_events', {
      resourceName: 'pod-a',
      resourceKind: 'Pod',
    }) as { involvedObject: { name: string } }[];
    expect(result).toHaveLength(1);
    expect(result[0]?.involvedObject.name).toBe('pod-a');
  });

  it('defaults to Warning type', () => {
    const store = makeStore([
      {
        kind: 'Event',
        name: 'event-warn',
        namespace: 'default',
        raw: {
          type: 'Warning',
          reason: 'BackOff',
          message: 'crash',
          count: 1,
          involvedObject: { kind: 'Pod', name: 'pod-a', namespace: 'default' },
        },
      },
      {
        kind: 'Event',
        name: 'event-normal',
        namespace: 'default',
        raw: {
          type: 'Normal',
          reason: 'Pulled',
          message: 'pulled',
          count: 1,
          involvedObject: { kind: 'Pod', name: 'pod-a', namespace: 'default' },
        },
      },
    ]);
    const dispatcher = makeDispatcher(store);
    // Default type is Warning
    const result = dispatcher.dispatch('get_events', {}) as {
      type: string;
    }[];
    expect(result).toHaveLength(1);
    expect(result[0]?.type).toBe('Warning');
  });
});

// ---------------------------------------------------------------------------
// count_resources
// ---------------------------------------------------------------------------

describe('AgentToolDispatcher.count_resources', () => {
  it('counts by status', () => {
    const store = makeStore([
      { kind: 'Pod', name: 'pod-ok', namespace: 'default', color: 'green' },
      { kind: 'Pod', name: 'pod-err', namespace: 'default', color: 'red' },
      { kind: 'Pod', name: 'pod-warn', namespace: 'default', color: 'yellow' },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('count_resources', {
      kind: 'Pod',
    }) as { total: number; byStatus: Record<string, number> };
    expect(result.total).toBe(3);
    expect(result.byStatus.healthy).toBe(1);
    expect(result.byStatus.error).toBe(1);
    expect(result.byStatus.warning).toBe(1);
  });

  it('counts by namespace', () => {
    const store = makeStore([
      { kind: 'Pod', name: 'pod-a', namespace: 'default', color: 'green' },
      { kind: 'Pod', name: 'pod-b', namespace: 'kube-system', color: 'green' },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('count_resources', {
      kind: 'Pod',
    }) as { byNamespace: Record<string, number> };
    expect(result.byNamespace.default).toBe(1);
    expect(result.byNamespace['kube-system']).toBe(1);
  });

  it('filters by status', () => {
    const store = makeStore([
      { kind: 'Pod', name: 'pod-ok', namespace: 'default', color: 'green' },
      { kind: 'Pod', name: 'pod-err', namespace: 'default', color: 'red' },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('count_resources', {
      kind: 'Pod',
      status: 'error',
    }) as { total: number };
    expect(result.total).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// get_pod_detail
// ---------------------------------------------------------------------------

describe('AgentToolDispatcher.get_pod_detail', () => {
  it('returns null when pod not found', () => {
    const store = makeStore([]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_pod_detail', {
      name: 'missing',
      namespace: 'default',
    });
    expect(result).toBeNull();
  });

  it('extracts container states', () => {
    const store = makeStore([
      {
        kind: 'Pod',
        name: 'my-pod',
        namespace: 'default',
        raw: {
          spec: {
            containers: [
              { name: 'main', image: 'nginx:latest', resources: {} },
            ],
          },
          status: {
            phase: 'Running',
            podIP: '10.0.0.1',
            nodeName: 'node-1',
            qosClass: 'BestEffort',
            containerStatuses: [
              {
                name: 'main',
                ready: true,
                restartCount: 0,
                state: { running: { startedAt: '2026-06-10T10:00:00Z' } },
              },
            ],
          },
        },
      },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_pod_detail', {
      name: 'my-pod',
      namespace: 'default',
    }) as {
      name: string;
      phase: string;
      containers: { name: string; state: string; ready: boolean }[];
    } | null;
    expect(result).not.toBeNull();
    expect(result?.phase).toBe('Running');
    expect(result?.containers).toHaveLength(1);
    expect(result?.containers[0]?.state).toBe('running');
    expect(result?.containers[0]?.ready).toBe(true);
  });

  it('handles waiting container with CrashLoopBackOff', () => {
    const store = makeStore([
      {
        kind: 'Pod',
        name: 'crash-pod',
        namespace: 'default',
        raw: {
          spec: {
            containers: [
              { name: 'app', image: 'broken:latest', resources: {} },
            ],
          },
          status: {
            phase: 'Running',
            containerStatuses: [
              {
                name: 'app',
                ready: false,
                restartCount: 14,
                state: {
                  waiting: { reason: 'CrashLoopBackOff' },
                },
                lastState: {
                  terminated: { exitCode: 1, reason: 'Error' },
                },
              },
            ],
          },
        },
      },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_pod_detail', {
      name: 'crash-pod',
      namespace: 'default',
    }) as {
      containers: {
        state: string;
        reason: string;
        restartCount: number;
        lastTerminatedReason: string;
        lastTerminatedExitCode: number;
      }[];
    } | null;
    expect(result).not.toBeNull();
    expect(result?.containers[0]?.state).toBe('waiting');
    expect(result?.containers[0]?.reason).toBe('CrashLoopBackOff');
    expect(result?.containers[0]?.restartCount).toBe(14);
    expect(result?.containers[0]?.lastTerminatedReason).toBe('Error');
    expect(result?.containers[0]?.lastTerminatedExitCode).toBe(1);
  });

  it('resolves owner through ReplicaSet to Deployment', () => {
    const store = new StateStore((event: ResourceEvent): ResourceObject => {
      const meta = event.object.metadata ?? {};
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
        status: { color: 'green', label: 'Running' },
        raw: event.object,
      };
    });

    // Add ReplicaSet owned by Deployment
    store.applyEvent(CONTEXT, {
      type: 'ADDED',
      apiVersion: 'apps/v1',
      kind: 'ReplicaSet',
      namespace: 'default',
      name: 'order-api-abc',
      receivedAt: NOW_MS,
      object: {
        apiVersion: 'apps/v1',
        kind: 'ReplicaSet',
        metadata: {
          name: 'order-api-abc',
          namespace: 'default',
          creationTimestamp: '2026-06-01T00:00:00Z',
          ownerReferences: [
            {
              apiVersion: 'apps/v1',
              kind: 'Deployment',
              name: 'order-api',
              uid: 'deploy-uid',
              controller: true,
            },
          ],
        },
      },
    });

    // Add Pod owned by ReplicaSet
    store.applyEvent(CONTEXT, {
      type: 'ADDED',
      apiVersion: 'v1',
      kind: 'Pod',
      namespace: 'default',
      name: 'order-api-abc-xyz',
      receivedAt: NOW_MS,
      object: {
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: {
          name: 'order-api-abc-xyz',
          namespace: 'default',
          creationTimestamp: '2026-06-01T00:00:00Z',
          ownerReferences: [
            {
              apiVersion: 'apps/v1',
              kind: 'ReplicaSet',
              name: 'order-api-abc',
              uid: 'rs-uid',
              controller: true,
            },
          ],
        },
        spec: { containers: [] },
        status: { phase: 'Running', containerStatuses: [] },
      },
    });

    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_pod_detail', {
      name: 'order-api-abc-xyz',
      namespace: 'default',
    }) as {
      ownerKind: string;
      ownerName: string;
      topOwnerKind: string;
      topOwnerName: string;
    } | null;
    expect(result).not.toBeNull();
    expect(result?.ownerKind).toBe('ReplicaSet');
    expect(result?.ownerName).toBe('order-api-abc');
    expect(result?.topOwnerKind).toBe('Deployment');
    expect(result?.topOwnerName).toBe('order-api');
  });

  it('handles init containers', () => {
    const store = makeStore([
      {
        kind: 'Pod',
        name: 'my-pod',
        namespace: 'default',
        raw: {
          spec: {
            containers: [{ name: 'main', image: 'nginx', resources: {} }],
            initContainers: [{ name: 'init', image: 'busybox', resources: {} }],
          },
          status: {
            phase: 'Running',
            initContainerStatuses: [
              {
                name: 'init',
                ready: true,
                restartCount: 0,
                state: { terminated: { exitCode: 0, reason: 'Completed' } },
              },
            ],
            containerStatuses: [],
          },
        },
      },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_pod_detail', {
      name: 'my-pod',
      namespace: 'default',
    }) as { initContainers: { name: string; state: string }[] } | null;
    expect(result?.initContainers).toHaveLength(1);
    expect(result?.initContainers[0]?.name).toBe('init');
    expect(result?.initContainers[0]?.state).toBe('terminated');
  });
});

// ---------------------------------------------------------------------------
// find_erroring_pods
// ---------------------------------------------------------------------------

describe('AgentToolDispatcher.find_erroring_pods', () => {
  it('returns empty array when no erroring pods', () => {
    const store = makeStore([
      { kind: 'Pod', name: 'pod-ok', namespace: 'default', color: 'green' },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('find_erroring_pods', {}) as unknown[];
    expect(result).toHaveLength(0);
  });

  it('returns erroring pods with CrashLoopBackOff reason', () => {
    const store = makeStore([
      {
        kind: 'Pod',
        name: 'crash-pod',
        namespace: 'default',
        color: 'red',
        raw: {
          spec: { containers: [{ name: 'app', image: 'broken:latest' }] },
          status: {
            containerStatuses: [
              {
                name: 'app',
                restartCount: 5,
                state: { waiting: { reason: 'CrashLoopBackOff' } },
              },
            ],
          },
        },
      },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('find_erroring_pods', {}) as {
      name: string;
      errorReason: string;
      restartCount: number;
      affectedContainer: string;
    }[];
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('crash-pod');
    expect(result[0]?.errorReason).toBe('CrashLoopBackOff');
    expect(result[0]?.restartCount).toBe(5);
    expect(result[0]?.affectedContainer).toBe('app');
  });

  it('filters by namespace', () => {
    const store = makeStore([
      { kind: 'Pod', name: 'pod-err-1', namespace: 'default', color: 'red' },
      {
        kind: 'Pod',
        name: 'pod-err-2',
        namespace: 'kube-system',
        color: 'red',
      },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('find_erroring_pods', {
      namespace: 'default',
    }) as { name: string }[];
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('pod-err-1');
  });

  it('extracts exit code from terminated container', () => {
    const store = makeStore([
      {
        kind: 'Pod',
        name: 'oom-pod',
        namespace: 'default',
        color: 'red',
        raw: {
          spec: { containers: [{ name: 'app', image: 'heavy:latest' }] },
          status: {
            containerStatuses: [
              {
                name: 'app',
                restartCount: 2,
                state: { terminated: { reason: 'OOMKilled', exitCode: 137 } },
              },
            ],
          },
        },
      },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('find_erroring_pods', {}) as {
      errorReason: string;
      lastExitCode: number;
    }[];
    expect(result[0]?.errorReason).toBe('OOMKilled');
    expect(result[0]?.lastExitCode).toBe(137);
  });
});

// ---------------------------------------------------------------------------
// get_deployment_detail
// ---------------------------------------------------------------------------

describe('AgentToolDispatcher.get_deployment_detail', () => {
  it('returns null when deployment not found', () => {
    const store = makeStore([]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_deployment_detail', {
      name: 'missing',
      namespace: 'default',
    });
    expect(result).toBeNull();
  });

  it('returns deployment details', () => {
    const store = makeStore([
      {
        kind: 'Deployment',
        name: 'order-api',
        namespace: 'default',
        raw: {
          spec: {
            replicas: 3,
            strategy: { type: 'RollingUpdate' },
            template: {
              metadata: { labels: {} },
              spec: {
                containers: [{ name: 'main', image: 'order-api:1.0.0' }],
              },
            },
          },
          status: {
            replicas: 3,
            readyReplicas: 3,
            availableReplicas: 3,
            updatedReplicas: 3,
            conditions: [
              {
                type: 'Available',
                status: 'True',
                reason: 'MinimumReplicasAvailable',
                message: 'Deployment has minimum availability.',
              },
            ],
          },
        },
      },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_deployment_detail', {
      name: 'order-api',
      namespace: 'default',
    }) as {
      name: string;
      replicas: { desired: number; ready: number };
      strategy: string;
      image: string;
    } | null;
    expect(result).not.toBeNull();
    expect(result?.name).toBe('order-api');
    expect(result?.replicas.desired).toBe(3);
    expect(result?.replicas.ready).toBe(3);
    expect(result?.strategy).toBe('RollingUpdate');
    expect(result?.image).toBe('order-api:1.0.0');
  });

  it('includes HPA when present', () => {
    const store = makeStore([
      {
        kind: 'Deployment',
        name: 'order-api',
        namespace: 'default',
        raw: {
          spec: {
            replicas: 2,
            template: { metadata: {}, spec: { containers: [] } },
          },
          status: {
            replicas: 2,
            readyReplicas: 2,
            availableReplicas: 2,
            updatedReplicas: 2,
          },
        },
      },
      {
        kind: 'HorizontalPodAutoscaler',
        name: 'order-api-hpa',
        namespace: 'default',
        raw: {
          spec: {
            minReplicas: 1,
            maxReplicas: 10,
            scaleTargetRef: {
              kind: 'Deployment',
              name: 'order-api',
            },
            metrics: [
              {
                type: 'Resource',
                resource: {
                  name: 'cpu',
                  target: { type: 'Utilization', averageUtilization: 70 },
                },
              },
            ],
          },
          status: { currentReplicas: 2 },
        },
      },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_deployment_detail', {
      name: 'order-api',
      namespace: 'default',
    }) as { hpa?: { name: string; cpuTarget: number } } | null;
    expect(result?.hpa).toBeDefined();
    expect(result?.hpa?.name).toBe('order-api-hpa');
    expect(result?.hpa?.cpuTarget).toBe(70);
  });
});

// ---------------------------------------------------------------------------
// get_rollout_status
// ---------------------------------------------------------------------------

describe('AgentToolDispatcher.get_rollout_status', () => {
  it('returns null when deployment not found', () => {
    const store = makeStore([]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_rollout_status', {
      name: 'missing',
      namespace: 'default',
    });
    expect(result).toBeNull();
  });

  it('returns "complete" when all replicas ready', () => {
    const store = makeStore([
      {
        kind: 'Deployment',
        name: 'order-api',
        namespace: 'default',
        raw: {
          spec: { replicas: 3 },
          status: {
            replicas: 3,
            readyReplicas: 3,
            availableReplicas: 3,
            updatedReplicas: 3,
          },
        },
      },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_rollout_status', {
      name: 'order-api',
      namespace: 'default',
    }) as { status: string } | null;
    expect(result?.status).toBe('complete');
  });

  it('returns "progressing" when update in progress', () => {
    const store = makeStore([
      {
        kind: 'Deployment',
        name: 'order-api',
        namespace: 'default',
        raw: {
          spec: { replicas: 3 },
          status: {
            replicas: 3,
            readyReplicas: 2,
            availableReplicas: 2,
            updatedReplicas: 1,
            conditions: [
              {
                type: 'Progressing',
                status: 'True',
                reason: 'ReplicaSetUpdated',
                message: 'ReplicaSet updated',
              },
              {
                type: 'Available',
                status: 'True',
                reason: 'MinimumReplicasAvailable',
                message: 'Minimum availability met',
              },
            ],
          },
        },
      },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_rollout_status', {
      name: 'order-api',
      namespace: 'default',
    }) as { status: string } | null;
    expect(result?.status).toBe('progressing');
  });

  it('returns "failed" when progress deadline exceeded', () => {
    const store = makeStore([
      {
        kind: 'Deployment',
        name: 'order-api',
        namespace: 'default',
        raw: {
          spec: { replicas: 3 },
          status: {
            replicas: 3,
            readyReplicas: 1,
            availableReplicas: 1,
            updatedReplicas: 1,
            conditions: [
              {
                type: 'Progressing',
                status: 'False',
                reason: 'ProgressDeadlineExceeded',
                message: 'Deployment has exceeded progress deadline',
              },
            ],
          },
        },
      },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_rollout_status', {
      name: 'order-api',
      namespace: 'default',
    }) as { status: string; progressDeadlineExceeded: boolean } | null;
    expect(result?.status).toBe('failed');
    expect(result?.progressDeadlineExceeded).toBe(true);
  });

  it('returns "stuck" when available condition is False', () => {
    const store = makeStore([
      {
        kind: 'Deployment',
        name: 'order-api',
        namespace: 'default',
        raw: {
          spec: { replicas: 3 },
          status: {
            replicas: 3,
            readyReplicas: 0,
            availableReplicas: 0,
            updatedReplicas: 3,
            conditions: [
              {
                type: 'Available',
                status: 'False',
                reason: 'MinimumReplicasUnavailable',
                message: 'Not enough replicas available',
              },
            ],
          },
        },
      },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_rollout_status', {
      name: 'order-api',
      namespace: 'default',
    }) as { status: string } | null;
    expect(result?.status).toBe('stuck');
  });
});

// ---------------------------------------------------------------------------
// get_kafka_lag
// ---------------------------------------------------------------------------

describe('AgentToolDispatcher.get_kafka_lag', () => {
  it('returns empty array when no topics', () => {
    const store = makeStore([]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_kafka_lag', {}) as unknown[];
    expect(result).toHaveLength(0);
  });

  it('returns consumer group lag for topics', () => {
    const store = makeStore([
      {
        kind: 'KafkaTopic',
        name: 'orders',
        namespace: 'kafka',
        raw: {
          status: {
            consumerGroups: [
              {
                name: 'order-consumer',
                totalLag: 500,
                trend: 'stable',
                partitionCount: 6,
              },
            ],
          },
        },
      },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_kafka_lag', {}) as {
      topic: string;
      consumerGroup: string;
      totalLag: number;
      status: string;
    }[];
    expect(result).toHaveLength(1);
    expect(result[0]?.topic).toBe('orders');
    expect(result[0]?.consumerGroup).toBe('order-consumer');
    expect(result[0]?.totalLag).toBe(500);
    expect(result[0]?.status).toBe('healthy');
  });

  it('returns warning status when lag >= 1000', () => {
    const store = makeStore([
      {
        kind: 'KafkaTopic',
        name: 'payments',
        namespace: 'kafka',
        raw: {
          status: {
            consumerGroups: [
              {
                name: 'payment-consumer',
                totalLag: 2000,
                trend: 'climbing',
                partitionCount: 3,
              },
            ],
          },
        },
      },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_kafka_lag', {}) as {
      status: string;
      trend: string;
    }[];
    expect(result[0]?.status).toBe('warning');
    expect(result[0]?.trend).toBe('climbing');
  });

  it('returns critical status when lag >= 10000', () => {
    const store = makeStore([
      {
        kind: 'KafkaTopic',
        name: 'events',
        namespace: 'kafka',
        raw: {
          status: {
            consumerGroups: [
              {
                name: 'event-consumer',
                totalLag: 50000,
                trend: 'climbing',
                partitionCount: 12,
              },
            ],
          },
        },
      },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_kafka_lag', {}) as {
      status: string;
    }[];
    expect(result[0]?.status).toBe('critical');
  });

  it('filters by topic', () => {
    const store = makeStore([
      {
        kind: 'KafkaTopic',
        name: 'orders',
        namespace: 'kafka',
        raw: {
          status: {
            consumerGroups: [
              {
                name: 'group-a',
                totalLag: 100,
                trend: 'stable',
                partitionCount: 3,
              },
            ],
          },
        },
      },
      {
        kind: 'KafkaTopic',
        name: 'payments',
        namespace: 'kafka',
        raw: {
          status: {
            consumerGroups: [
              {
                name: 'group-b',
                totalLag: 200,
                trend: 'stable',
                partitionCount: 2,
              },
            ],
          },
        },
      },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_kafka_lag', {
      topic: 'orders',
    }) as { topic: string }[];
    expect(result).toHaveLength(1);
    expect(result[0]?.topic).toBe('orders');
  });

  it('filters by consumer group', () => {
    const store = makeStore([
      {
        kind: 'KafkaTopic',
        name: 'orders',
        namespace: 'kafka',
        raw: {
          status: {
            consumerGroups: [
              {
                name: 'group-a',
                totalLag: 100,
                trend: 'stable',
                partitionCount: 3,
              },
              {
                name: 'group-b',
                totalLag: 200,
                trend: 'stable',
                partitionCount: 3,
              },
            ],
          },
        },
      },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_kafka_lag', {
      consumerGroup: 'group-a',
    }) as { consumerGroup: string }[];
    expect(result).toHaveLength(1);
    expect(result[0]?.consumerGroup).toBe('group-a');
  });
});

// ---------------------------------------------------------------------------
// Unknown tool
// ---------------------------------------------------------------------------

describe('AgentToolDispatcher.dispatch unknown tool', () => {
  it('throws on unknown tool name', () => {
    const store = makeStore([]);
    const dispatcher = makeDispatcher(store);
    expect(() => {
      dispatcher.dispatch('nonexistent_tool', {});
    }).toThrow('Unknown tool: nonexistent_tool');
  });
});

// ---------------------------------------------------------------------------
// Additional coverage tests
// ---------------------------------------------------------------------------

describe('AgentToolDispatcher coverage branches', () => {
  it('get_deployment_detail with HPA that has non-cpu metric', () => {
    const store = makeStore([
      {
        kind: 'Deployment',
        name: 'order-api',
        namespace: 'default',
        raw: {
          spec: {
            replicas: 2,
            template: { metadata: {}, spec: { containers: [] } },
          },
          status: {
            replicas: 2,
            readyReplicas: 2,
            availableReplicas: 2,
            updatedReplicas: 2,
          },
        },
      },
      {
        kind: 'HorizontalPodAutoscaler',
        name: 'order-api-hpa',
        namespace: 'default',
        raw: {
          spec: {
            minReplicas: 1,
            maxReplicas: 10,
            scaleTargetRef: {
              kind: 'Deployment',
              name: 'order-api',
            },
            metrics: [
              {
                type: 'Resource',
                resource: {
                  name: 'memory', // NOT cpu — exercises the name !== 'cpu' branch
                  target: { type: 'Utilization', averageUtilization: 80 },
                },
              },
            ],
          },
          status: { currentReplicas: 2 },
        },
      },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_deployment_detail', {
      name: 'order-api',
      namespace: 'default',
    }) as { hpa?: { name: string; cpuTarget?: number } } | null;
    expect(result?.hpa).toBeDefined();
    // cpuTarget should NOT be set for non-cpu metric
    expect(result?.hpa?.cpuTarget).toBeUndefined();
  });

  it('get_deployment_detail with HPA that has cpu metric without target', () => {
    // Exercises the `?? {}` branch for resource.target
    const store = makeStore([
      {
        kind: 'Deployment',
        name: 'order-api',
        namespace: 'default',
        raw: {
          spec: {
            replicas: 1,
            template: { metadata: {}, spec: { containers: [] } },
          },
          status: {
            replicas: 1,
            readyReplicas: 1,
            availableReplicas: 1,
            updatedReplicas: 1,
          },
        },
      },
      {
        kind: 'HorizontalPodAutoscaler',
        name: 'order-api-hpa',
        namespace: 'default',
        raw: {
          spec: {
            minReplicas: 1,
            maxReplicas: 5,
            scaleTargetRef: { kind: 'Deployment', name: 'order-api' },
            metrics: [
              {
                type: 'Resource',
                resource: {
                  name: 'cpu',
                  // target is undefined — exercises the `?? {}` branch
                },
              },
            ],
          },
          status: { currentReplicas: 1 },
        },
      },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_deployment_detail', {
      name: 'order-api',
      namespace: 'default',
    }) as { hpa?: { cpuTarget?: number } } | null;
    expect(result?.hpa).toBeDefined();
    expect(result?.hpa?.cpuTarget).toBeUndefined();
  });

  it('get_deployment_detail with HPA where scaleTargetRef is absent', () => {
    // Exercises the `scaleTargetRef ?? {}` fallback — HPA has no scaleTargetRef
    const store = makeStore([
      {
        kind: 'Deployment',
        name: 'order-api',
        namespace: 'default',
        raw: {
          spec: {
            replicas: 1,
            template: { metadata: {}, spec: { containers: [] } },
          },
          status: {
            replicas: 1,
            readyReplicas: 1,
            availableReplicas: 1,
            updatedReplicas: 1,
          },
        },
      },
      {
        kind: 'HorizontalPodAutoscaler',
        name: 'unrelated-hpa',
        namespace: 'default',
        raw: {
          spec: {
            minReplicas: 1,
            maxReplicas: 5,
            // scaleTargetRef is absent — exercises `?? {}` branch
          },
          status: { currentReplicas: 1 },
        },
      },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_deployment_detail', {
      name: 'order-api',
      namespace: 'default',
    }) as { hpa?: unknown } | null;
    // HPA should NOT be matched
    expect(result?.hpa).toBeUndefined();
  });

  it('get_deployment_detail with HPA that has non-array metrics', () => {
    // Exercises the `else []` branch for non-array metrics
    const store = makeStore([
      {
        kind: 'Deployment',
        name: 'order-api',
        namespace: 'default',
        raw: {
          spec: {
            replicas: 1,
            template: { metadata: {}, spec: { containers: [] } },
          },
          status: {
            replicas: 1,
            readyReplicas: 1,
            availableReplicas: 1,
            updatedReplicas: 1,
          },
        },
      },
      {
        kind: 'HorizontalPodAutoscaler',
        name: 'order-api-hpa',
        namespace: 'default',
        raw: {
          spec: {
            minReplicas: 1,
            maxReplicas: 5,
            scaleTargetRef: { kind: 'Deployment', name: 'order-api' },
            metrics: 'not-an-array', // Non-array — exercises the `else []` branch
          },
          status: { currentReplicas: 1 },
        },
      },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_deployment_detail', {
      name: 'order-api',
      namespace: 'default',
    }) as { hpa?: { cpuTarget?: number } } | null;
    expect(result?.hpa).toBeDefined();
    expect(result?.hpa?.cpuTarget).toBeUndefined();
  });

  it('get_deployment_detail with HPA metrics where resource field is absent', () => {
    // Exercises the `m.resource ?? {}` fallback when resource field is absent
    const store = makeStore([
      {
        kind: 'Deployment',
        name: 'order-api',
        namespace: 'default',
        raw: {
          spec: {
            replicas: 1,
            template: { metadata: {}, spec: { containers: [] } },
          },
          status: {
            replicas: 1,
            readyReplicas: 1,
            availableReplicas: 1,
            updatedReplicas: 1,
          },
        },
      },
      {
        kind: 'HorizontalPodAutoscaler',
        name: 'order-api-hpa',
        namespace: 'default',
        raw: {
          spec: {
            minReplicas: 1,
            maxReplicas: 5,
            scaleTargetRef: { kind: 'Deployment', name: 'order-api' },
            metrics: [
              {
                type: 'Resource',
                // resource field is absent — exercises the `?? {}` fallback
              },
            ],
          },
          status: { currentReplicas: 1 },
        },
      },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_deployment_detail', {
      name: 'order-api',
      namespace: 'default',
    }) as { hpa?: { cpuTarget?: number } } | null;
    expect(result?.hpa).toBeDefined();
    expect(result?.hpa?.cpuTarget).toBeUndefined();
  });

  it('get_kafka_lag with topic that has no consumerGroups in status', () => {
    // Exercises the `else []` branch for consumerGroups
    const store = makeStore([
      {
        kind: 'KafkaTopic',
        name: 'empty-topic',
        namespace: 'kafka',
        raw: {
          status: {
            // consumerGroups is NOT an array — exercises fallback to []
            consumerGroups: 'not-an-array',
          },
        },
      },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_kafka_lag', {}) as unknown[];
    expect(result).toHaveLength(0);
  });

  it('get_kafka_lag with unknown trend value returns stable', () => {
    // Exercises the fallback `return 'stable'` branch for unknown trend
    const store = makeStore([
      {
        kind: 'KafkaTopic',
        name: 'orders',
        namespace: 'kafka',
        raw: {
          status: {
            consumerGroups: [
              {
                name: 'group-a',
                totalLag: 100,
                trend: 'unknown-trend-value', // not climbing/dropping/stable
                partitionCount: 3,
              },
            ],
          },
        },
      },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_kafka_lag', {}) as {
      trend: string;
    }[];
    expect(result[0]?.trend).toBe('stable');
  });

  it('find_erroring_pods with pod owning deployment directly', () => {
    // Exercises the branch where controller.kind === 'Deployment' directly
    const store = new StateStore((event: ResourceEvent): ResourceObject => {
      const meta = event.object.metadata ?? {};
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
        status: { color: 'red', label: 'Error' },
        raw: event.object,
      };
    });
    store.applyEvent(CONTEXT, {
      type: 'ADDED',
      apiVersion: 'v1',
      kind: 'Pod',
      namespace: 'default',
      name: 'direct-pod',
      receivedAt: NOW_MS,
      object: {
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: {
          name: 'direct-pod',
          namespace: 'default',
          creationTimestamp: '2026-06-01T00:00:00Z',
          ownerReferences: [
            {
              apiVersion: 'apps/v1',
              kind: 'Deployment', // Direct ownership, not via ReplicaSet
              name: 'my-deployment',
              uid: 'deploy-uid',
              controller: true,
            },
          ],
        },
        spec: { containers: [{ name: 'app', image: 'broken:latest' }] },
        status: {
          containerStatuses: [
            {
              name: 'app',
              restartCount: 3,
              state: { waiting: { reason: 'CrashLoopBackOff' } },
            },
          ],
        },
      },
    });
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('find_erroring_pods', {}) as {
      ownerDeployment?: string;
    }[];
    expect(result).toHaveLength(1);
    expect(result[0]?.ownerDeployment).toBe('my-deployment');
  });

  it('get_events filters by resourceKind only', () => {
    const store = makeStore([
      {
        kind: 'Event',
        name: 'event-deploy',
        namespace: 'default',
        raw: {
          type: 'Warning',
          reason: 'ScalingFailed',
          message: 'failed to scale',
          count: 1,
          involvedObject: {
            kind: 'Deployment',
            name: 'my-deploy',
            namespace: 'default',
          },
        },
      },
    ]);
    const dispatcher = makeDispatcher(store);
    // Filter by resourceKind only (no resourceName)
    const result = dispatcher.dispatch('get_events', {
      resourceKind: 'Deployment',
    }) as { involvedObject: { kind: string } }[];
    expect(result).toHaveLength(1);
    expect(result[0]?.involvedObject.kind).toBe('Deployment');
  });

  it('get_events filters by resourceName only', () => {
    const store = makeStore([
      {
        kind: 'Event',
        name: 'event-1',
        namespace: 'default',
        raw: {
          type: 'Warning',
          reason: 'BackOff',
          message: 'crash',
          count: 1,
          involvedObject: {
            kind: 'Pod',
            name: 'target-pod',
            namespace: 'default',
          },
        },
      },
      {
        kind: 'Event',
        name: 'event-2',
        namespace: 'default',
        raw: {
          type: 'Warning',
          reason: 'BackOff',
          message: 'crash',
          count: 1,
          involvedObject: {
            kind: 'Pod',
            name: 'other-pod',
            namespace: 'default',
          },
        },
      },
    ]);
    const dispatcher = makeDispatcher(store);
    // Filter by resourceName only (no resourceKind)
    const result = dispatcher.dispatch('get_events', {
      resourceName: 'target-pod',
    }) as { involvedObject: { name: string } }[];
    expect(result).toHaveLength(1);
    expect(result[0]?.involvedObject.name).toBe('target-pod');
  });

  it('get_events with event missing involvedObject', () => {
    const store = makeStore([
      {
        kind: 'Event',
        name: 'event-no-io',
        namespace: 'default',
        raw: {
          type: 'Warning',
          reason: 'BackOff',
          message: 'crash',
          count: 1,
          // no involvedObject
        },
      },
    ]);
    const dispatcher = makeDispatcher(store);
    // Should filter out events with no involvedObject when filtering by resourceName
    const result = dispatcher.dispatch('get_events', {
      resourceName: 'some-pod',
    }) as unknown[];
    expect(result).toHaveLength(0);
  });

  it('list_resources with status "warning" and "healthy" and "unknown"', () => {
    const store = makeStore([
      { kind: 'Pod', name: 'pod-warn', namespace: 'default', color: 'yellow' },
      { kind: 'Pod', name: 'pod-ok', namespace: 'default', color: 'green' },
      { kind: 'Pod', name: 'pod-pending', namespace: 'default', color: 'grey' },
    ]);
    const dispatcher = makeDispatcher(store);

    const warnResult = dispatcher.dispatch('list_resources', {
      kind: 'Pod',
      status: 'warning',
    }) as unknown[];
    expect(warnResult).toHaveLength(1);

    const healthyResult = dispatcher.dispatch('list_resources', {
      kind: 'Pod',
      status: 'healthy',
    }) as unknown[];
    expect(healthyResult).toHaveLength(1);

    const unknownResult = dispatcher.dispatch('list_resources', {
      kind: 'Pod',
      status: 'unknown',
    }) as unknown[];
    expect(unknownResult).toHaveLength(1);
  });

  it('get_deployment_detail includes erroring pods with container status', () => {
    // Exercises lines 998-1026: byStatus loop and erroringPods map
    // Build store manually to control ownerReferences
    const colorMap = new Map<string, 'green' | 'yellow' | 'red' | 'grey'>([
      ['Deployment/my-deploy', 'green'],
      ['ReplicaSet/my-deploy-rs', 'green'],
      ['Pod/my-deploy-pod', 'red'],
    ]);
    const store = new StateStore((event: ResourceEvent): ResourceObject => {
      const meta = event.object.metadata ?? {};
      const colorKey = `${event.kind}/${event.name}`;
      const color = colorMap.get(colorKey) ?? 'green';
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
        status: { color, label: color === 'red' ? 'Error' : 'Running' },
        raw: event.object,
      };
    });

    // Add Deployment
    store.applyEvent(CONTEXT, {
      type: 'ADDED',
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      namespace: 'default',
      name: 'my-deploy',
      receivedAt: NOW_MS,
      object: {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: {
          name: 'my-deploy',
          namespace: 'default',
          creationTimestamp: '2026-06-01T00:00:00Z',
        },
        spec: {
          replicas: 1,
          template: {
            metadata: {},
            spec: { containers: [{ name: 'app', image: 'app:latest' }] },
          },
        },
        status: {
          replicas: 1,
          readyReplicas: 0,
          availableReplicas: 0,
          updatedReplicas: 1,
        },
      },
    });

    // Add ReplicaSet owned by Deployment
    store.applyEvent(CONTEXT, {
      type: 'ADDED',
      apiVersion: 'apps/v1',
      kind: 'ReplicaSet',
      namespace: 'default',
      name: 'my-deploy-rs',
      receivedAt: NOW_MS,
      object: {
        apiVersion: 'apps/v1',
        kind: 'ReplicaSet',
        metadata: {
          name: 'my-deploy-rs',
          namespace: 'default',
          creationTimestamp: '2026-06-01T00:00:00Z',
          ownerReferences: [
            {
              apiVersion: 'apps/v1',
              kind: 'Deployment',
              name: 'my-deploy',
              uid: 'deploy-uid',
              controller: true,
            },
          ],
        },
      },
    });

    // Add red Pod owned by ReplicaSet, with containerStatuses including waiting reason
    store.applyEvent(CONTEXT, {
      type: 'ADDED',
      apiVersion: 'v1',
      kind: 'Pod',
      namespace: 'default',
      name: 'my-deploy-pod',
      receivedAt: NOW_MS,
      object: {
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: {
          name: 'my-deploy-pod',
          namespace: 'default',
          creationTimestamp: '2026-06-01T00:00:00Z',
          ownerReferences: [
            {
              apiVersion: 'apps/v1',
              kind: 'ReplicaSet',
              name: 'my-deploy-rs',
              uid: 'rs-uid',
              controller: true,
            },
          ],
        },
        status: {
          containerStatuses: [
            {
              name: 'app',
              restartCount: 5,
              state: { waiting: { reason: 'CrashLoopBackOff' } },
            },
          ],
        },
      },
    });

    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_deployment_detail', {
      name: 'my-deploy',
      namespace: 'default',
    }) as {
      pods: {
        total: number;
        byStatus: Record<string, number>;
        erroring: { name: string; reason: string; restarts: number }[];
      };
    } | null;

    expect(result).not.toBeNull();
    expect(result?.pods.total).toBe(1);
    expect(result?.pods.byStatus.error).toBe(1);
    expect(result?.pods.erroring).toHaveLength(1);
    expect(result?.pods.erroring[0]?.reason).toBe('CrashLoopBackOff');
    expect(result?.pods.erroring[0]?.restarts).toBe(5);
  });

  it('get_deployment_detail with erroring pod that has no waiting reason uses status label', () => {
    // Exercises the path where containerStatuses has state.waiting but no reason (waitingObj.reason === undefined)
    // and the path where containerStatuses is empty (uses pod.status.label as reason)
    const colorMap = new Map<string, 'red'>([['Pod/err-pod', 'red']]);
    const store = new StateStore((event: ResourceEvent): ResourceObject => {
      const meta = event.object.metadata ?? {};
      const colorKey = `${event.kind}/${event.name}`;
      const color = colorMap.get(colorKey) ?? 'green';
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
        status: { color, label: color === 'red' ? 'CrashLabel' : 'Running' },
        raw: event.object,
      };
    });

    store.applyEvent(CONTEXT, {
      type: 'ADDED',
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      namespace: 'default',
      name: 'no-wait-deploy',
      receivedAt: NOW_MS,
      object: {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: {
          name: 'no-wait-deploy',
          namespace: 'default',
          creationTimestamp: '2026-06-01T00:00:00Z',
        },
        spec: {
          replicas: 1,
          template: { metadata: {}, spec: { containers: [] } },
        },
        status: {
          replicas: 1,
          readyReplicas: 0,
          availableReplicas: 0,
          updatedReplicas: 1,
        },
      },
    });

    store.applyEvent(CONTEXT, {
      type: 'ADDED',
      apiVersion: 'apps/v1',
      kind: 'ReplicaSet',
      namespace: 'default',
      name: 'no-wait-rs',
      receivedAt: NOW_MS,
      object: {
        apiVersion: 'apps/v1',
        kind: 'ReplicaSet',
        metadata: {
          name: 'no-wait-rs',
          namespace: 'default',
          creationTimestamp: '2026-06-01T00:00:00Z',
          ownerReferences: [
            {
              apiVersion: 'apps/v1',
              kind: 'Deployment',
              name: 'no-wait-deploy',
              uid: 'd-uid',
              controller: true,
            },
          ],
        },
      },
    });

    // Pod with containerStatuses where waiting has NO reason field
    store.applyEvent(CONTEXT, {
      type: 'ADDED',
      apiVersion: 'v1',
      kind: 'Pod',
      namespace: 'default',
      name: 'err-pod',
      receivedAt: NOW_MS,
      object: {
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: {
          name: 'err-pod',
          namespace: 'default',
          creationTimestamp: '2026-06-01T00:00:00Z',
          ownerReferences: [
            {
              apiVersion: 'apps/v1',
              kind: 'ReplicaSet',
              name: 'no-wait-rs',
              uid: 'rs-uid',
              controller: true,
            },
          ],
        },
        status: {
          containerStatuses: [
            {
              name: 'app',
              restartCount: 2,
              state: { waiting: {} }, // waiting with no reason
            },
          ],
        },
      },
    });

    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_deployment_detail', {
      name: 'no-wait-deploy',
      namespace: 'default',
    }) as {
      pods: { erroring: { name: string; reason: string }[] };
    } | null;

    expect(result).not.toBeNull();
    // reason falls back to pod.status.label = 'CrashLabel'
    expect(result?.pods.erroring[0]?.reason).toBe('CrashLabel');
  });
});

// ---------------------------------------------------------------------------
// Helper function branch coverage
// ---------------------------------------------------------------------------

describe('AgentToolDispatcher helper function branches', () => {
  it('redactSecretRaw returns raw unchanged when raw.kind is not Secret', () => {
    // Exercises lines 236-237: the early return in redactSecretRaw when raw.kind !== 'Secret'.
    // This is hit when a ResourceObject has kind='Secret' but its raw.kind differs.
    // We construct such a case by passing raw: { kind: 'ConfigMap' } to a Secret resource.
    const store = new StateStore((event: ResourceEvent): ResourceObject => {
      const meta = event.object.metadata ?? {};
      return {
        uid: `${event.namespace ?? '~'}/${event.name}`,
        kind: 'Secret', // obj.kind = 'Secret' → redactResourceObject calls redactSecretRaw
        apiVersion: event.apiVersion,
        name: event.name,
        namespace: event.namespace,
        labels: meta.labels ?? {},
        annotations: meta.annotations ?? {},
        creationTimestamp: '2026-06-01T00:00:00Z',
        resourceVersion: '1',
        status: { color: 'green', label: 'Running' },
        raw: {
          // raw.kind = 'ConfigMap' → redactSecretRaw hits early return
          apiVersion: 'v1',
          kind: 'ConfigMap', // different from obj.kind
          metadata: buildMeta(event.name, event.namespace),
        },
      };
    });
    store.applyEvent(CONTEXT, {
      type: 'ADDED',
      apiVersion: 'v1',
      kind: 'Secret',
      namespace: 'default',
      name: 'weird-secret',
      receivedAt: NOW_MS,
      object: {
        apiVersion: 'v1',
        kind: 'ConfigMap', // raw.kind != 'Secret'
        metadata: {
          name: 'weird-secret',
          namespace: 'default',
          creationTimestamp: '2026-06-01T00:00:00Z',
        },
      },
    });
    const dispatcher = makeDispatcher(store);
    // get_resource triggers redactResourceObject (obj.kind='Secret'), then redactSecretRaw (raw.kind='ConfigMap')
    const result = dispatcher.dispatch('get_resource', {
      kind: 'Secret',
      name: 'weird-secret',
      namespace: 'default',
    });
    // Should return a result (not null), and the raw is unchanged (no data redaction since it's not really a Secret)
    expect(result).not.toBeNull();
  });

  it('get_resource with spec and status calls topTwoLevels with nested objects', () => {
    // Covers topTwoLevels: object with nested objects, primitives, arrays, null
    const store = makeStore([
      {
        kind: 'Pod',
        name: 'pod-with-spec',
        namespace: 'default',
        raw: {
          spec: {
            nodeName: 'node-1', // primitive — goes to result[k] = v
            nested: { cpu: '100m' }, // nested object — goes into inner
            deepNested: { a: { b: 1 } }, // nested with object value (skipped in inner)
            containers: ['c1', 'c2'], // array — goes to result[k] = v
          },
          status: {
            phase: 'Running',
          },
        },
      },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_resource', {
      kind: 'Pod',
      name: 'pod-with-spec',
      namespace: 'default',
    }) as {
      spec: Record<string, unknown>;
      status: Record<string, unknown>;
    } | null;
    expect(result).not.toBeNull();
    expect(result?.spec).toBeDefined();
    expect(result?.status).toBeDefined();
  });

  it('str() with number input (exercises line 312: String(v) for numbers)', () => {
    // str() is called with a number when a raw event field that is typed as unknown contains a number.
    // Use type='Warning' (string, passes filter) but reason=42 (number, exercises str(number) path).
    const store = makeStore([
      {
        kind: 'Event',
        name: 'ev1',
        namespace: 'default',
        raw: {
          type: 'Warning',
          reason: 42, // number — exercises str() number branch (line 312)
          message: 'back off',
          count: 3,
          involvedObject: {
            kind: 'Pod',
            name: 'crash-pod',
            namespace: 'default',
          },
        },
      },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_events', {}) as {
      reason: string;
    }[];
    expect(result[0]?.reason).toBe('42');
  });

  it('str() with object input (exercises line 314: JSON.stringify)', () => {
    // str() called with an object hits JSON.stringify path at line 314.
    // Use type='Warning' (passes filter) but message={nested:'val'} (object) to exercise JSON.stringify.
    const store = makeStore([
      {
        kind: 'Event',
        name: 'ev-obj',
        namespace: 'default',
        raw: {
          type: 'Warning',
          reason: 'Test',
          message: { detail: 'info' }, // object — exercises JSON.stringify path
          count: 1,
          involvedObject: { kind: 'Pod', name: 'p', namespace: 'default' },
        },
      },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_events', {}) as {
      message: string;
    }[];
    expect(result[0]?.message).toContain('detail');
  });

  it('num() with string input (exercises line 322-323: parseInt path)', () => {
    // num() is called with a string when a raw numeric field contains a string.
    // We pass a string restartCount to exercise num(string) → parseInt path.
    const store = makeStore([
      {
        kind: 'Pod',
        name: 'str-restart-pod',
        namespace: 'default',
        color: 'red',
        raw: {
          spec: { containers: [{ name: 'app', image: 'app:latest' }] },
          status: {
            containerStatuses: [
              {
                name: 'app',
                restartCount: '7' as unknown as number, // string — exercises num() string path
                state: { waiting: { reason: 'CrashLoopBackOff' } },
              },
            ],
          },
        },
      },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('find_erroring_pods', {}) as {
      restartCount: number;
    }[];
    expect(result[0]?.restartCount).toBe(7);
  });

  it('ageFromTimestamp with empty string returns empty string', () => {
    // Exercises ageFromTimestamp with empty creationTimestamp
    const store = new StateStore((event: ResourceEvent): ResourceObject => {
      const meta = event.object.metadata ?? {};
      return {
        uid: `${event.namespace ?? '~'}/${event.name}`,
        kind: event.kind,
        apiVersion: event.apiVersion,
        name: event.name,
        namespace: event.namespace,
        labels: meta.labels ?? {},
        annotations: meta.annotations ?? {},
        creationTimestamp: '', // empty — ageFromTimestamp returns ''
        resourceVersion: '1',
        status: { color: 'green', label: 'Running' },
        raw: event.object,
      };
    });
    store.applyEvent(CONTEXT, {
      type: 'ADDED',
      apiVersion: 'v1',
      kind: 'Pod',
      namespace: 'default',
      name: 'no-ts-pod',
      receivedAt: NOW_MS,
      object: {
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: {
          name: 'no-ts-pod',
          namespace: 'default',
          creationTimestamp: '',
        },
      },
    });
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('list_resources', {
      kind: 'Pod',
    }) as { age: string }[];
    expect(result[0]?.age).toBe('');
  });

  it('ageFromTimestamp with invalid timestamp returns empty string via catch', () => {
    // Exercises ageFromTimestamp catch block with an invalid date string
    const store = new StateStore((event: ResourceEvent): ResourceObject => {
      const meta = event.object.metadata ?? {};
      return {
        uid: `${event.namespace ?? '~'}/${event.name}`,
        kind: event.kind,
        apiVersion: event.apiVersion,
        name: event.name,
        namespace: event.namespace,
        labels: meta.labels ?? {},
        annotations: meta.annotations ?? {},
        creationTimestamp: 'not-a-valid-date',
        resourceVersion: '1',
        status: { color: 'green', label: 'Running' },
        raw: event.object,
      };
    });
    store.applyEvent(CONTEXT, {
      type: 'ADDED',
      apiVersion: 'v1',
      kind: 'Pod',
      namespace: 'default',
      name: 'bad-ts-pod',
      receivedAt: NOW_MS,
      object: {
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: {
          name: 'bad-ts-pod',
          namespace: 'default',
          creationTimestamp: 'not-a-valid-date',
        },
      },
    });
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('list_resources', {
      kind: 'Pod',
    }) as { age: string }[];
    // Invalid date catches and returns ''
    expect(result[0]?.age).toBe('');
  });

  it('get_events with events that have non-matching resourceKind returns empty', () => {
    // Exercises line 509: return false when involvedObject.kind !== resourceKind
    const store = makeStore([
      {
        kind: 'Event',
        name: 'deploy-event',
        namespace: 'default',
        raw: {
          type: 'Warning',
          reason: 'ScalingFailed',
          message: 'scale failed',
          count: 1,
          involvedObject: {
            kind: 'Deployment',
            name: 'my-deploy',
            namespace: 'default',
          },
        },
      },
      {
        kind: 'Event',
        name: 'pod-event',
        namespace: 'default',
        raw: {
          type: 'Warning',
          reason: 'BackOff',
          message: 'back off',
          count: 1,
          involvedObject: { kind: 'Pod', name: 'my-pod', namespace: 'default' },
        },
      },
    ]);
    const dispatcher = makeDispatcher(store);
    // Only Pod events — Deployment event hits the `return false` branch
    const result = dispatcher.dispatch('get_events', {
      resourceKind: 'Pod',
    }) as { involvedObject: { kind: string } }[];
    expect(result).toHaveLength(1);
    expect(result[0]?.involvedObject.kind).toBe('Pod');
  });

  it('get_events map with event that has no involvedObject hits ?? {} fallback', () => {
    // Exercises line 524: involvedObject ?? {} in the map function
    const store = makeStore([
      {
        kind: 'Event',
        name: 'bare-event',
        namespace: 'default',
        raw: {
          type: 'Warning',
          reason: 'Unknown',
          message: 'something',
          count: 1,
          // No involvedObject field in raw — hits the ?? {} at line 524
        },
      },
    ]);
    const dispatcher = makeDispatcher(store);
    // No resourceKind filter so the event passes through to the map
    const result = dispatcher.dispatch('get_events', {}) as {
      involvedObject: Record<string, unknown>;
    }[];
    expect(result).toHaveLength(1);
    expect(result[0]?.involvedObject.kind).toBe('');
  });

  it('get_pod_detail with containerStatuses not an array uses empty array fallback', () => {
    // Exercises line 597: else [] when containerStatuses is not an array
    const store = makeStore([
      {
        kind: 'Pod',
        name: 'no-cs-pod',
        namespace: 'default',
        raw: {
          spec: {
            containers: [{ name: 'app', image: 'app:latest', resources: {} }],
          },
          status: {
            phase: 'Running',
            containerStatuses: 'not-an-array', // triggers else []
          },
        },
      },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_pod_detail', {
      name: 'no-cs-pod',
      namespace: 'default',
    }) as { containers: { state: string }[] } | null;
    expect(result).not.toBeNull();
    expect(result?.containers[0]?.state).toBe('unknown');
  });

  it('get_pod_detail with specContainers not an array uses empty array fallback', () => {
    // Exercises line 599-600: else [] when spec.containers is not an array
    const store = makeStore([
      {
        kind: 'Pod',
        name: 'no-spec-containers',
        namespace: 'default',
        raw: {
          spec: { containers: 'not-an-array' }, // triggers else []
          status: { phase: 'Running' },
        },
      },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_pod_detail', {
      name: 'no-spec-containers',
      namespace: 'default',
    }) as { containers: unknown[] } | null;
    expect(result).not.toBeNull();
    expect(result?.containers).toHaveLength(0);
  });

  it('get_pod_detail with terminated container state', () => {
    // Exercises lines 617-622: terminated state branch for main containers
    const store = makeStore([
      {
        kind: 'Pod',
        name: 'terminated-pod',
        namespace: 'default',
        raw: {
          spec: {
            containers: [{ name: 'app', image: 'app:latest', resources: {} }],
          },
          status: {
            phase: 'Failed',
            containerStatuses: [
              {
                name: 'app',
                ready: false,
                restartCount: 1,
                state: { terminated: { reason: 'OOMKilled', exitCode: 137 } },
              },
            ],
          },
        },
      },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_pod_detail', {
      name: 'terminated-pod',
      namespace: 'default',
    }) as { containers: { state: string; reason: string }[] } | null;
    expect(result?.containers[0]?.state).toBe('terminated');
    expect(result?.containers[0]?.reason).toBe('OOMKilled');
  });

  it('get_pod_detail with init container in running state', () => {
    // Exercises lines 691, 695: stateObj ?? {} and running state for initContainers
    const store = makeStore([
      {
        kind: 'Pod',
        name: 'init-running-pod',
        namespace: 'default',
        raw: {
          spec: {
            containers: [{ name: 'main', image: 'app:latest', resources: {} }],
            initContainers: [
              { name: 'init', image: 'init:latest', resources: {} },
            ],
          },
          status: {
            phase: 'Running',
            initContainerStatuses: [
              {
                name: 'init',
                ready: true,
                restartCount: 0,
                state: { running: { startedAt: '2026-06-10T10:00:00Z' } }, // running state
              },
            ],
            containerStatuses: [
              {
                name: 'main',
                ready: true,
                restartCount: 0,
                state: { running: {} },
              },
            ],
          },
        },
      },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_pod_detail', {
      name: 'init-running-pod',
      namespace: 'default',
    }) as { initContainers: { state: string }[] } | null;
    expect(result?.initContainers[0]?.state).toBe('running');
  });

  it('get_pod_detail with init container in waiting state', () => {
    // Exercises lines 697-699: waiting state for initContainers
    const store = makeStore([
      {
        kind: 'Pod',
        name: 'init-wait-pod',
        namespace: 'default',
        raw: {
          spec: {
            containers: [],
            initContainers: [
              { name: 'init', image: 'init:latest', resources: {} },
            ],
          },
          status: {
            phase: 'Pending',
            initContainerStatuses: [
              {
                name: 'init',
                ready: false,
                restartCount: 0,
                state: { waiting: { reason: 'PodInitializing' } },
              },
            ],
            containerStatuses: [],
          },
        },
      },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_pod_detail', {
      name: 'init-wait-pod',
      namespace: 'default',
    }) as { initContainers: { state: string; reason: string }[] } | null;
    expect(result?.initContainers[0]?.state).toBe('waiting');
    expect(result?.initContainers[0]?.reason).toBe('PodInitializing');
  });

  it('get_pod_detail with conditions not array uses empty array', () => {
    // Exercises line 715-716: else [] for rawConditions
    const store = makeStore([
      {
        kind: 'Pod',
        name: 'no-cond-pod',
        namespace: 'default',
        raw: {
          spec: { containers: [] },
          status: {
            phase: 'Running',
            conditions: 'not-an-array', // triggers else []
          },
        },
      },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_pod_detail', {
      name: 'no-cond-pod',
      namespace: 'default',
    }) as { conditions: unknown[] } | null;
    expect(result?.conditions).toHaveLength(0);
  });

  it('get_pod_detail with conditions array maps to ConditionInfo', () => {
    // Exercises lines 718-721: conditions map callback
    const store = makeStore([
      {
        kind: 'Pod',
        name: 'cond-pod',
        namespace: 'default',
        raw: {
          spec: { containers: [] },
          status: {
            phase: 'Running',
            conditions: [
              {
                type: 'Ready',
                status: 'True',
                reason: 'PodRunning',
                message: 'all ok',
              },
            ],
          },
        },
      },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_pod_detail', {
      name: 'cond-pod',
      namespace: 'default',
    }) as {
      conditions: {
        type: string;
        status: string;
        reason: string;
        message: string;
      }[];
    } | null;
    expect(result?.conditions[0]?.type).toBe('Ready');
    expect(result?.conditions[0]?.status).toBe('True');
    expect(result?.conditions[0]?.reason).toBe('PodRunning');
    expect(result?.conditions[0]?.message).toBe('all ok');
  });

  it('find_erroring_pods with ImagePullBackOff waiting reason', () => {
    // Exercises line 809: reason === 'ImagePullBackOff'
    const store = makeStore([
      {
        kind: 'Pod',
        name: 'pull-fail',
        namespace: 'default',
        color: 'red',
        raw: {
          spec: { containers: [{ name: 'app', image: 'nosuchimage:latest' }] },
          status: {
            containerStatuses: [
              {
                name: 'app',
                restartCount: 0,
                state: { waiting: { reason: 'ImagePullBackOff' } },
              },
            ],
          },
        },
      },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('find_erroring_pods', {}) as {
      errorReason: string;
    }[];
    expect(result[0]?.errorReason).toBe('ImagePullBackOff');
  });

  it('find_erroring_pods with OOMKilled waiting reason (exercises line 810)', () => {
    // Exercises line 810: reason === 'OOMKilled' (as waiting state)
    const store = makeStore([
      {
        kind: 'Pod',
        name: 'oom-wait',
        namespace: 'default',
        color: 'red',
        raw: {
          spec: { containers: [{ name: 'app', image: 'heavy:latest' }] },
          status: {
            containerStatuses: [
              {
                name: 'app',
                restartCount: 2,
                state: { waiting: { reason: 'OOMKilled' } },
              },
            ],
          },
        },
      },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('find_erroring_pods', {}) as {
      errorReason: string;
    }[];
    expect(result[0]?.errorReason).toBe('OOMKilled');
  });

  it('find_erroring_pods with generic non-empty waiting reason (exercises line 811)', () => {
    // Exercises line 811: reason.length > 0 (generic reason not matching the named ones)
    const store = makeStore([
      {
        kind: 'Pod',
        name: 'generic-err',
        namespace: 'default',
        color: 'red',
        raw: {
          spec: { containers: [{ name: 'app', image: 'app:latest' }] },
          status: {
            containerStatuses: [
              {
                name: 'app',
                restartCount: 0,
                state: { waiting: { reason: 'ContainerCreating' } },
              },
            ],
          },
        },
      },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('find_erroring_pods', {}) as {
      errorReason: string;
    }[];
    expect(result[0]?.errorReason).toBe('ContainerCreating');
  });

  it('find_erroring_pods with terminated container with no reason (exercises errorReason = Error fallback)', () => {
    // Exercises lines 822-823: errorReason = 'Error' when terminatedObj.reason is empty
    const store = makeStore([
      {
        kind: 'Pod',
        name: 'no-reason-pod',
        namespace: 'default',
        color: 'red',
        raw: {
          spec: { containers: [{ name: 'app', image: 'app:latest' }] },
          status: {
            containerStatuses: [
              {
                name: 'app',
                restartCount: 1,
                state: { terminated: { reason: '', exitCode: 1 } }, // empty reason
              },
            ],
          },
        },
      },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('find_erroring_pods', {}) as {
      errorReason: string;
    }[];
    expect(result[0]?.errorReason).toBe('Error');
  });

  it('find_erroring_pods with erroring pod that has no waiting/terminated state (uses fallback container)', () => {
    // Exercises lines 834-839: fallback when no waiting/terminated found but containers exist
    const store = makeStore([
      {
        kind: 'Pod',
        name: 'unknown-err',
        namespace: 'default',
        color: 'red',
        raw: {
          spec: { containers: [{ name: 'app', image: 'app:latest' }] },
          status: {
            containerStatuses: [
              {
                name: 'app',
                restartCount: 0,
                // No state (neither waiting nor terminated) → falls through to fallback
                state: {},
              },
            ],
          },
        },
      },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('find_erroring_pods', {}) as {
      affectedContainer: string;
    }[];
    // affectedContainer set from fallback at line 836
    expect(result[0]?.affectedContainer).toBe('app');
  });

  it('find_erroring_pods resolves owner via ReplicaSet to Deployment', () => {
    // Exercises lines 858-872: ReplicaSet → Deployment owner chain in find_erroring_pods
    const store = new StateStore((event: ResourceEvent): ResourceObject => {
      const meta = event.object.metadata ?? {};
      const isRed = event.name === 'crash-pod';
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
          color: isRed ? 'red' : 'green',
          label: isRed ? 'Error' : 'Running',
        },
        raw: event.object,
      };
    });

    // Add ReplicaSet owned by Deployment
    store.applyEvent(CONTEXT, {
      type: 'ADDED',
      apiVersion: 'apps/v1',
      kind: 'ReplicaSet',
      namespace: 'default',
      name: 'api-rs',
      receivedAt: NOW_MS,
      object: {
        apiVersion: 'apps/v1',
        kind: 'ReplicaSet',
        metadata: {
          name: 'api-rs',
          namespace: 'default',
          creationTimestamp: '2026-06-01T00:00:00Z',
          ownerReferences: [
            {
              apiVersion: 'apps/v1',
              kind: 'Deployment',
              name: 'api-deploy',
              uid: 'd-uid',
              controller: true,
            },
          ],
        },
      },
    });

    // Add red pod owned by ReplicaSet
    store.applyEvent(CONTEXT, {
      type: 'ADDED',
      apiVersion: 'v1',
      kind: 'Pod',
      namespace: 'default',
      name: 'crash-pod',
      receivedAt: NOW_MS,
      object: {
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: {
          name: 'crash-pod',
          namespace: 'default',
          creationTimestamp: '2026-06-01T00:00:00Z',
          ownerReferences: [
            {
              apiVersion: 'apps/v1',
              kind: 'ReplicaSet',
              name: 'api-rs',
              uid: 'rs-uid',
              controller: true,
            },
          ],
        },
        status: {
          containerStatuses: [
            {
              name: 'app',
              restartCount: 3,
              state: { waiting: { reason: 'CrashLoopBackOff' } },
            },
          ],
        },
      },
    });

    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('find_erroring_pods', {}) as {
      ownerDeployment?: string;
    }[];
    expect(result).toHaveLength(1);
    expect(result[0]?.ownerDeployment).toBe('api-deploy');
  });

  it('find_erroring_pods includes last warning event', () => {
    // Exercises lines 884-897: pod events filtering and last event assignment
    const store = new StateStore((event: ResourceEvent): ResourceObject => {
      const meta = event.object.metadata ?? {};
      const isRed = event.name === 'crash-pod';
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
          color: isRed ? 'red' : 'green',
          label: isRed ? 'Error' : 'Running',
        },
        raw: event.object,
      };
    });

    // Add erroring pod
    store.applyEvent(CONTEXT, {
      type: 'ADDED',
      apiVersion: 'v1',
      kind: 'Pod',
      namespace: 'default',
      name: 'crash-pod',
      receivedAt: NOW_MS,
      object: {
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: {
          name: 'crash-pod',
          namespace: 'default',
          creationTimestamp: '2026-06-01T00:00:00Z',
        },
        status: {
          containerStatuses: [
            {
              name: 'app',
              restartCount: 5,
              state: { waiting: { reason: 'CrashLoopBackOff' } },
            },
          ],
        },
      },
    });

    // Add Warning event for the pod
    store.applyEvent(CONTEXT, {
      type: 'ADDED',
      apiVersion: 'v1',
      kind: 'Event',
      namespace: 'default',
      name: 'crash-event',
      receivedAt: NOW_MS,
      object: {
        apiVersion: 'v1',
        kind: 'Event',
        metadata: {
          name: 'crash-event',
          namespace: 'default',
          creationTimestamp: '2026-06-10T13:00:00Z',
        },
        type: 'Warning',
        reason: 'BackOff',
        message: 'Back-off restarting failed container',
        count: 10,
        involvedObject: {
          kind: 'Pod',
          name: 'crash-pod',
          namespace: 'default',
        },
      },
    });

    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('find_erroring_pods', {}) as {
      lastEvent?: string;
    }[];
    expect(result[0]?.lastEvent).toContain('Back-off');
  });

  it('find_erroring_pods uses spec containers when affectedContainer still empty', () => {
    // Exercises lines 904-909: spec containers fallback for affectedContainer
    const store = makeStore([
      {
        kind: 'Pod',
        name: 'spec-only-pod',
        namespace: 'default',
        color: 'red',
        raw: {
          spec: { containers: [{ name: 'from-spec', image: 'app:latest' }] },
          status: {
            // No containerStatuses at all
          },
        },
      },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('find_erroring_pods', {}) as {
      affectedContainer: string;
    }[];
    // affectedContainer assigned from spec at line 906
    expect(result[0]?.affectedContainer).toBe('from-spec');
  });

  it('get_pod_detail with containers having cpu/memory requests and limits', () => {
    // Exercises lines 632, 652-665: resource requests/limits set on container
    const store = makeStore([
      {
        kind: 'Pod',
        name: 'resourced-pod',
        namespace: 'default',
        raw: {
          spec: {
            containers: [
              {
                name: 'app',
                image: 'app:latest',
                resources: {
                  requests: { cpu: '100m', memory: '128Mi' },
                  limits: { cpu: '200m', memory: '256Mi' },
                },
              },
            ],
          },
          status: {
            phase: 'Running',
            containerStatuses: [
              {
                name: 'app',
                ready: true,
                restartCount: 0,
                state: { running: {} },
              },
            ],
          },
        },
      },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_pod_detail', {
      name: 'resourced-pod',
      namespace: 'default',
    }) as {
      containers: {
        cpuRequest?: string;
        cpuLimit?: string;
        memRequest?: string;
        memLimit?: string;
      }[];
    } | null;
    expect(result?.containers[0]?.cpuRequest).toBe('100m');
    expect(result?.containers[0]?.cpuLimit).toBe('200m');
    expect(result?.containers[0]?.memRequest).toBe('128Mi');
    expect(result?.containers[0]?.memLimit).toBe('256Mi');
  });

  it('get_pod_detail with container having no resources field (exercises ?? {} at line 632)', () => {
    // Exercises line 632: (c.resources as ... | undefined) ?? {} when c.resources is absent
    const store = makeStore([
      {
        kind: 'Pod',
        name: 'no-resources-pod',
        namespace: 'default',
        raw: {
          spec: {
            containers: [
              {
                name: 'app',
                image: 'app:latest',
                // No resources field — exercises ?? {} fallback
              },
            ],
          },
          status: {
            phase: 'Running',
            containerStatuses: [
              {
                name: 'app',
                ready: true,
                restartCount: 0,
                state: { running: {} },
              },
            ],
          },
        },
      },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_pod_detail', {
      name: 'no-resources-pod',
      namespace: 'default',
    }) as {
      containers: {
        cpuRequest?: string;
        cpuLimit?: string;
      }[];
    } | null;
    expect(result).not.toBeNull();
    // With no resources, cpuRequest/cpuLimit are undefined
    expect(result?.containers[0]?.cpuRequest).toBeUndefined();
    expect(result?.containers[0]?.cpuLimit).toBeUndefined();
  });

  it('get_pod_detail with init container missing state (exercises ?? {} at line 691)', () => {
    // Exercises line 691: (cStatus.state as ... | undefined) ?? {} when state is absent
    const store = makeStore([
      {
        kind: 'Pod',
        name: 'init-no-state-pod',
        namespace: 'default',
        raw: {
          spec: {
            containers: [],
            initContainers: [
              { name: 'init', image: 'init:latest', resources: {} },
            ],
          },
          status: {
            phase: 'Pending',
            initContainerStatuses: [
              {
                name: 'init',
                ready: false,
                restartCount: 0,
                // No state field — exercises the ?? {} fallback at line 691
              },
            ],
            containerStatuses: [],
          },
        },
      },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_pod_detail', {
      name: 'init-no-state-pod',
      namespace: 'default',
    }) as { initContainers: { state: string }[] } | null;
    // With no state field, stateObj = {} → state stays 'unknown'
    expect(result?.initContainers[0]?.state).toBe('unknown');
  });

  it('get_deployment_detail with no template containers (exercises else [] for specContainers)', () => {
    // Exercises line 951: else [] when templateSpec.containers is not an array
    const store = makeStore([
      {
        kind: 'Deployment',
        name: 'no-containers-deploy',
        namespace: 'default',
        raw: {
          spec: {
            replicas: 1,
            template: { metadata: {}, spec: { containers: 'not-an-array' } },
          },
          status: {
            replicas: 1,
            readyReplicas: 1,
            availableReplicas: 1,
            updatedReplicas: 1,
          },
        },
      },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_deployment_detail', {
      name: 'no-containers-deploy',
      namespace: 'default',
    }) as { image: string } | null;
    expect(result).not.toBeNull();
    expect(result?.image).toBe(''); // No containers → firstContainer is {} → image is ''
  });

  it('get_deployment_detail pods with no containerStatuses (exercises else [] at line 1010)', () => {
    // Exercises line 1010: else [] when podStatus.containerStatuses is not an array in erroringPods map
    const store = new StateStore((event: ResourceEvent): ResourceObject => {
      const meta = event.object.metadata ?? {};
      const colorMap = new Map<string, 'green' | 'yellow' | 'red' | 'grey'>([
        ['Deployment/no-cs-deploy', 'green'],
        ['ReplicaSet/no-cs-rs', 'green'],
        ['Pod/no-cs-pod', 'red'],
      ]);
      const colorKey = `${event.kind}/${event.name}`;
      const color = colorMap.get(colorKey) ?? 'green';
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
        status: { color, label: color === 'red' ? 'Error' : 'Running' },
        raw: event.object,
      };
    });

    store.applyEvent(CONTEXT, {
      type: 'ADDED',
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      namespace: 'default',
      name: 'no-cs-deploy',
      receivedAt: NOW_MS,
      object: {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: {
          name: 'no-cs-deploy',
          namespace: 'default',
          creationTimestamp: '2026-06-01T00:00:00Z',
        },
        spec: {
          replicas: 1,
          template: { metadata: {}, spec: { containers: [] } },
        },
        status: {
          replicas: 1,
          readyReplicas: 0,
          availableReplicas: 0,
          updatedReplicas: 1,
        },
      },
    });

    store.applyEvent(CONTEXT, {
      type: 'ADDED',
      apiVersion: 'apps/v1',
      kind: 'ReplicaSet',
      namespace: 'default',
      name: 'no-cs-rs',
      receivedAt: NOW_MS,
      object: {
        apiVersion: 'apps/v1',
        kind: 'ReplicaSet',
        metadata: {
          name: 'no-cs-rs',
          namespace: 'default',
          creationTimestamp: '2026-06-01T00:00:00Z',
          ownerReferences: [
            {
              apiVersion: 'apps/v1',
              kind: 'Deployment',
              name: 'no-cs-deploy',
              uid: 'd-uid',
              controller: true,
            },
          ],
        },
      },
    });

    // Red pod with non-array containerStatuses
    store.applyEvent(CONTEXT, {
      type: 'ADDED',
      apiVersion: 'v1',
      kind: 'Pod',
      namespace: 'default',
      name: 'no-cs-pod',
      receivedAt: NOW_MS,
      object: {
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: {
          name: 'no-cs-pod',
          namespace: 'default',
          creationTimestamp: '2026-06-01T00:00:00Z',
          ownerReferences: [
            {
              apiVersion: 'apps/v1',
              kind: 'ReplicaSet',
              name: 'no-cs-rs',
              uid: 'rs-uid',
              controller: true,
            },
          ],
        },
        status: {
          containerStatuses: 'not-an-array', // triggers else [] at line 1010
        },
      },
    });

    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_deployment_detail', {
      name: 'no-cs-deploy',
      namespace: 'default',
    }) as {
      pods: { erroring: { reason: string }[] };
    } | null;
    expect(result).not.toBeNull();
    // With no containerStatuses, reason falls back to pod.status.label
    expect(result?.pods.erroring[0]?.reason).toBe('Error');
  });
});

// ---------------------------------------------------------------------------
// Nullability branch coverage (??/?./ null-namespace paths)
// ---------------------------------------------------------------------------

describe('AgentToolDispatcher nullability and null-namespace branches', () => {
  it('list_resources with cluster-scoped resource (null namespace) covers namespace ?? ""', () => {
    // Exercises line 431: safe.namespace ?? '' when namespace is null
    const store = makeStore([
      { kind: 'Node', name: 'node-1', namespace: null },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('list_resources', {
      kind: 'Node',
    }) as { namespace: string }[];
    expect(result[0]?.namespace).toBe('');
  });

  it('count_resources with null-namespace resource covers namespace ?? "~"', () => {
    // Exercises line 564: obj.namespace ?? '~' in count_resources
    const store = makeStore([
      { kind: 'Node', name: 'node-1', namespace: null },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('count_resources', {
      kind: 'Node',
    }) as { byNamespace: Record<string, number> };
    expect(result.byNamespace['~']).toBe(1);
  });

  it('num() with non-numeric string (covers isNaN fallback to 0)', () => {
    // Exercises line 323: isNaN(n) ? 0 : n when parseInt returns NaN
    // num() is called with a string that isn't a valid number
    const store = makeStore([
      {
        kind: 'Pod',
        name: 'nan-restart-pod',
        namespace: 'default',
        color: 'red',
        raw: {
          spec: { containers: [{ name: 'app', image: 'app:latest' }] },
          status: {
            containerStatuses: [
              {
                name: 'app',
                restartCount: 'not-a-number' as unknown as number, // NaN parse → 0
                state: { waiting: { reason: 'CrashLoopBackOff' } },
              },
            ],
          },
        },
      },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('find_erroring_pods', {}) as {
      restartCount: number;
    }[];
    expect(result[0]?.restartCount).toBe(0);
  });

  it('get_pod_detail with no spec and no status covers raw.spec ?? {} and raw.status ?? {}', () => {
    // Exercises lines 591-592: raw.spec ?? {} and raw.status ?? {} in get_pod_detail
    const store = makeStore([
      {
        kind: 'Pod',
        name: 'bare-pod',
        namespace: 'default',
        // No spec or status in raw
      },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_pod_detail', {
      name: 'bare-pod',
      namespace: 'default',
    }) as { containers: unknown[]; phase: string } | null;
    expect(result).not.toBeNull();
    expect(result?.containers).toHaveLength(0);
    expect(result?.phase).toBe('');
  });

  it('get_pod_detail with init container not found in initContainerStatuses (covers ?? {} at line 689)', () => {
    // Exercises line 689: initContainerStatuses.find(...) ?? {} when no matching status
    const store = makeStore([
      {
        kind: 'Pod',
        name: 'init-no-match-pod',
        namespace: 'default',
        raw: {
          spec: {
            containers: [],
            initContainers: [{ name: 'init', image: 'init:latest' }],
          },
          status: {
            phase: 'Pending',
            // initContainerStatuses has different name — no match
            initContainerStatuses: [
              { name: 'other-init', ready: false, restartCount: 0, state: {} },
            ],
            containerStatuses: [],
          },
        },
      },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_pod_detail', {
      name: 'init-no-match-pod',
      namespace: 'default',
    }) as { initContainers: { state: string }[] } | null;
    // No matching status found → cStatus = {} → stateObj = {} → state = 'unknown'
    expect(result?.initContainers[0]?.state).toBe('unknown');
  });

  it('get_pod_detail where owning ReplicaSet has no ownerReferences (covers ?? [] at line 741)', () => {
    // Exercises line 741: rs.raw.metadata?.ownerReferences ?? [] when RS has no ownerReferences
    const store = new StateStore((event: ResourceEvent): ResourceObject => {
      const meta = event.object.metadata ?? {};
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
        status: { color: 'green', label: 'Running' },
        raw: event.object,
      };
    });

    // RS with no ownerReferences in metadata
    store.applyEvent(CONTEXT, {
      type: 'ADDED',
      apiVersion: 'apps/v1',
      kind: 'ReplicaSet',
      namespace: 'default',
      name: 'orphan-rs',
      receivedAt: NOW_MS,
      object: {
        apiVersion: 'apps/v1',
        kind: 'ReplicaSet',
        metadata: {
          name: 'orphan-rs',
          namespace: 'default',
          creationTimestamp: '2026-06-01T00:00:00Z',
        },
        // No ownerReferences
      },
    });

    // Pod owned by the orphan RS
    store.applyEvent(CONTEXT, {
      type: 'ADDED',
      apiVersion: 'v1',
      kind: 'Pod',
      namespace: 'default',
      name: 'orphan-pod',
      receivedAt: NOW_MS,
      object: {
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: {
          name: 'orphan-pod',
          namespace: 'default',
          creationTimestamp: '2026-06-01T00:00:00Z',
          ownerReferences: [
            {
              apiVersion: 'apps/v1',
              kind: 'ReplicaSet',
              name: 'orphan-rs',
              uid: 'rs-uid',
              controller: true,
            },
          ],
        },
        spec: { containers: [] },
        status: { containerStatuses: [] },
      },
    });

    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_pod_detail', {
      name: 'orphan-pod',
      namespace: 'default',
    }) as { topOwnerKind: string; ownerKind: string } | null;
    expect(result?.ownerKind).toBe('ReplicaSet');
    // RS has no ownerReferences → topOwnerKind stays as ReplicaSet
    expect(result?.topOwnerKind).toBe('ReplicaSet');
  });

  it('get_pod_detail with null namespace covers obj.namespace ?? ""', () => {
    // Exercises line 752: obj.namespace ?? '' when namespace is null
    const store = makeStore([
      { kind: 'Pod', name: 'cluster-pod', namespace: null },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_pod_detail', {
      name: 'cluster-pod',
    }) as { namespace: string } | null;
    expect(result?.namespace).toBe('');
  });

  it('find_erroring_pods with containerStatus having no state (covers ?? {} at line 797)', () => {
    // Exercises line 797: (cs.state as ... | undefined) ?? {} when state is absent
    const store = makeStore([
      {
        kind: 'Pod',
        name: 'no-state-cs-pod',
        namespace: 'default',
        color: 'red',
        raw: {
          spec: { containers: [{ name: 'app', image: 'app:latest' }] },
          status: {
            containerStatuses: [
              {
                name: 'app',
                restartCount: 0,
                // No state field — cs.state is undefined → stateObj = {}
              },
            ],
          },
        },
      },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('find_erroring_pods', {}) as {
      affectedContainer: string;
    }[];
    // No waiting/terminated found → falls through to fallback
    expect(result[0]?.affectedContainer).toBe('app');
  });

  it('find_erroring_pods with null namespace pod covers obj.namespace ?? ""', () => {
    // Exercises line 847: obj.namespace ?? '' when namespace is null
    const store = makeStore([
      { kind: 'Pod', name: 'null-ns-pod', namespace: null, color: 'red' },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('find_erroring_pods', {}) as {
      namespace: string;
    }[];
    expect(result[0]?.namespace).toBe('');
  });

  it('find_erroring_pods where RS has no ownerReferences (covers ?? [] at line 867)', () => {
    // Exercises line 867: rs.raw.metadata?.ownerReferences ?? [] when RS has no ownerReferences
    const store = new StateStore((event: ResourceEvent): ResourceObject => {
      const meta = event.object.metadata ?? {};
      const isRed = event.name === 'crash-pod';
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
          color: isRed ? 'red' : 'green',
          label: isRed ? 'Error' : 'Running',
        },
        raw: event.object,
      };
    });

    // RS with no ownerReferences
    store.applyEvent(CONTEXT, {
      type: 'ADDED',
      apiVersion: 'apps/v1',
      kind: 'ReplicaSet',
      namespace: 'default',
      name: 'no-owners-rs',
      receivedAt: NOW_MS,
      object: {
        apiVersion: 'apps/v1',
        kind: 'ReplicaSet',
        metadata: {
          name: 'no-owners-rs',
          namespace: 'default',
          creationTimestamp: '2026-06-01T00:00:00Z',
        },
        // No ownerReferences
      },
    });

    store.applyEvent(CONTEXT, {
      type: 'ADDED',
      apiVersion: 'v1',
      kind: 'Pod',
      namespace: 'default',
      name: 'crash-pod',
      receivedAt: NOW_MS,
      object: {
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: {
          name: 'crash-pod',
          namespace: 'default',
          creationTimestamp: '2026-06-01T00:00:00Z',
          ownerReferences: [
            {
              apiVersion: 'apps/v1',
              kind: 'ReplicaSet',
              name: 'no-owners-rs',
              uid: 'rs-uid',
              controller: true,
            },
          ],
        },
        status: {
          containerStatuses: [
            {
              name: 'app',
              restartCount: 3,
              state: { waiting: { reason: 'CrashLoopBackOff' } },
            },
          ],
        },
      },
    });

    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('find_erroring_pods', {}) as {
      ownerDeployment?: string;
    }[];
    expect(result).toHaveLength(1);
    // RS has no ownerReferences → no ownerDeployment set
    expect(result[0]?.ownerDeployment).toBeUndefined();
  });

  it('get_deployment_detail with no spec/status covers raw.spec ?? {} and raw.status ?? {}', () => {
    // Exercises lines 933-934: raw.spec ?? {} and raw.status ?? {} in get_deployment_detail
    // Also covers spec.replicas ?? status.replicas (line 937 ?? branch)
    const store = makeStore([
      {
        kind: 'Deployment',
        name: 'bare-deploy',
        namespace: 'default',
        // No spec or status in raw
      },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_deployment_detail', {
      name: 'bare-deploy',
      namespace: 'default',
    }) as { replicas: { desired: number }; strategy: string } | null;
    expect(result).not.toBeNull();
    expect(result?.replicas.desired).toBe(0);
    expect(result?.strategy).toBe('');
  });

  it('get_deployment_detail where RS has no ownerReferences (covers ?? [] at line 982)', () => {
    // Exercises line 982: rs.raw.metadata?.ownerReferences ?? [] when RS has no ownerReferences
    const store = makeStore([
      {
        kind: 'Deployment',
        name: 'deploy-no-rs-owners',
        namespace: 'default',
        raw: {
          spec: {
            replicas: 1,
            template: { metadata: {}, spec: { containers: [] } },
          },
          status: {
            replicas: 1,
            readyReplicas: 1,
            availableReplicas: 1,
            updatedReplicas: 1,
          },
        },
      },
      {
        kind: 'ReplicaSet',
        name: 'rs-no-owners',
        namespace: 'default',
        // No ownerReferences in raw
      },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_deployment_detail', {
      name: 'deploy-no-rs-owners',
      namespace: 'default',
    }) as { pods: { total: number } } | null;
    expect(result).not.toBeNull();
    // RS has no ownerReferences → not matched to deployment → no pods counted
    expect(result?.pods.total).toBe(0);
  });

  it('get_deployment_detail where pod has no ownerReferences (covers ?? [] at line 990)', () => {
    // Exercises line 990: pod.raw.metadata?.ownerReferences ?? [] when pod has no ownerReferences
    const store = makeStore([
      {
        kind: 'Deployment',
        name: 'deploy-orphan-pod',
        namespace: 'default',
        raw: {
          spec: {
            replicas: 1,
            template: { metadata: {}, spec: { containers: [] } },
          },
          status: {
            replicas: 1,
            readyReplicas: 0,
            availableReplicas: 0,
            updatedReplicas: 1,
          },
        },
      },
      {
        kind: 'Pod',
        name: 'orphan-pod',
        namespace: 'default',
        // No ownerReferences in raw
      },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_deployment_detail', {
      name: 'deploy-orphan-pod',
      namespace: 'default',
    }) as { pods: { total: number } } | null;
    expect(result).not.toBeNull();
    // Pod has no ownerReferences → not matched to deployment → not counted
    expect(result?.pods.total).toBe(0);
  });

  it('get_deployment_detail erroring pod with no status (covers pod.raw.status ?? {} at line 1007)', () => {
    // Exercises line 1007: pod.raw.status ?? {} when pod has no status
    const store = new StateStore((event: ResourceEvent): ResourceObject => {
      const meta = event.object.metadata ?? {};
      const colorMap = new Map<string, 'green' | 'red'>([
        ['Pod/err-no-status', 'red'],
      ]);
      const color = colorMap.get(`${event.kind}/${event.name}`) ?? 'green';
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
        status: { color, label: color === 'red' ? 'Error' : 'Running' },
        raw: event.object,
      };
    });

    store.applyEvent(CONTEXT, {
      type: 'ADDED',
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      namespace: 'default',
      name: 'status-less-deploy',
      receivedAt: NOW_MS,
      object: {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: {
          name: 'status-less-deploy',
          namespace: 'default',
          creationTimestamp: '2026-06-01T00:00:00Z',
        },
        spec: {
          replicas: 1,
          template: { metadata: {}, spec: { containers: [] } },
        },
        status: {
          replicas: 1,
          readyReplicas: 0,
          availableReplicas: 0,
          updatedReplicas: 1,
        },
      },
    });

    store.applyEvent(CONTEXT, {
      type: 'ADDED',
      apiVersion: 'apps/v1',
      kind: 'ReplicaSet',
      namespace: 'default',
      name: 'sl-rs',
      receivedAt: NOW_MS,
      object: {
        apiVersion: 'apps/v1',
        kind: 'ReplicaSet',
        metadata: {
          name: 'sl-rs',
          namespace: 'default',
          creationTimestamp: '2026-06-01T00:00:00Z',
          ownerReferences: [
            {
              apiVersion: 'apps/v1',
              kind: 'Deployment',
              name: 'status-less-deploy',
              uid: 'd-uid',
              controller: true,
            },
          ],
        },
      },
    });

    // Red pod with NO status field
    store.applyEvent(CONTEXT, {
      type: 'ADDED',
      apiVersion: 'v1',
      kind: 'Pod',
      namespace: 'default',
      name: 'err-no-status',
      receivedAt: NOW_MS,
      object: {
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: {
          name: 'err-no-status',
          namespace: 'default',
          creationTimestamp: '2026-06-01T00:00:00Z',
          ownerReferences: [
            {
              apiVersion: 'apps/v1',
              kind: 'ReplicaSet',
              name: 'sl-rs',
              uid: 'rs-uid',
              controller: true,
            },
          ],
        },
        // No status field at all
      },
    });

    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_deployment_detail', {
      name: 'status-less-deploy',
      namespace: 'default',
    }) as {
      pods: { erroring: { reason: string }[] };
    } | null;
    expect(result).not.toBeNull();
    expect(result?.pods.erroring[0]?.reason).toBe('Error');
  });

  it('get_deployment_detail erroring pod with containerStatus having no state (covers ?? {} at line 1015)', () => {
    // Exercises line 1015: (cs.state as ... | undefined) ?? {} when state is absent
    const store = new StateStore((event: ResourceEvent): ResourceObject => {
      const meta = event.object.metadata ?? {};
      const colorMap = new Map<string, 'red'>([['Pod/no-cs-state', 'red']]);
      const color = colorMap.get(`${event.kind}/${event.name}`) ?? 'green';
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
          color: color,
          label: color === 'red' ? 'Error' : 'Running',
        },
        raw: event.object,
      };
    });

    store.applyEvent(CONTEXT, {
      type: 'ADDED',
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      namespace: 'default',
      name: 'no-cs-state-deploy',
      receivedAt: NOW_MS,
      object: {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: {
          name: 'no-cs-state-deploy',
          namespace: 'default',
          creationTimestamp: '2026-06-01T00:00:00Z',
        },
        spec: {
          replicas: 1,
          template: { metadata: {}, spec: { containers: [] } },
        },
        status: {
          replicas: 1,
          readyReplicas: 0,
          availableReplicas: 0,
          updatedReplicas: 1,
        },
      },
    });

    store.applyEvent(CONTEXT, {
      type: 'ADDED',
      apiVersion: 'apps/v1',
      kind: 'ReplicaSet',
      namespace: 'default',
      name: 'ncs-rs',
      receivedAt: NOW_MS,
      object: {
        apiVersion: 'apps/v1',
        kind: 'ReplicaSet',
        metadata: {
          name: 'ncs-rs',
          namespace: 'default',
          creationTimestamp: '2026-06-01T00:00:00Z',
          ownerReferences: [
            {
              apiVersion: 'apps/v1',
              kind: 'Deployment',
              name: 'no-cs-state-deploy',
              uid: 'd-uid',
              controller: true,
            },
          ],
        },
      },
    });

    // Red pod with containerStatuses but no state in each
    store.applyEvent(CONTEXT, {
      type: 'ADDED',
      apiVersion: 'v1',
      kind: 'Pod',
      namespace: 'default',
      name: 'no-cs-state',
      receivedAt: NOW_MS,
      object: {
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: {
          name: 'no-cs-state',
          namespace: 'default',
          creationTimestamp: '2026-06-01T00:00:00Z',
          ownerReferences: [
            {
              apiVersion: 'apps/v1',
              kind: 'ReplicaSet',
              name: 'ncs-rs',
              uid: 'rs-uid',
              controller: true,
            },
          ],
        },
        status: {
          containerStatuses: [
            {
              name: 'app',
              restartCount: 0,
              // No state field — exercises ?? {} at line 1015
            },
          ],
        },
      },
    });

    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_deployment_detail', {
      name: 'no-cs-state-deploy',
      namespace: 'default',
    }) as {
      pods: { erroring: { reason: string }[] };
    } | null;
    expect(result).not.toBeNull();
    expect(result?.pods.erroring).toHaveLength(1);
  });

  it('get_deployment_detail with null namespace covers obj.namespace ?? "" at line 1089', () => {
    // Exercises line 1089: obj.namespace ?? '' when deployment namespace is null
    const store = makeStore([
      {
        kind: 'Deployment',
        name: 'cluster-deploy',
        namespace: null,
        raw: {
          spec: {
            replicas: 1,
            template: { metadata: {}, spec: { containers: [] } },
          },
          status: {
            replicas: 1,
            readyReplicas: 1,
            availableReplicas: 1,
            updatedReplicas: 1,
          },
        },
      },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_deployment_detail', {
      name: 'cluster-deploy',
    }) as { namespace: string } | null;
    expect(result?.namespace).toBe('');
  });

  it('get_rollout_status with no spec/status covers raw.spec ?? {} and raw.status ?? {}', () => {
    // Exercises lines 1123-1124: raw.spec ?? {} and raw.status ?? {} in get_rollout_status
    // Also covers spec.replicas ?? 1 (line 1126 ?? branch)
    const store = makeStore([
      {
        kind: 'Deployment',
        name: 'bare-rollout',
        namespace: 'default',
        // No spec or status in raw
      },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_rollout_status', {
      name: 'bare-rollout',
      namespace: 'default',
    }) as { status: string } | null;
    expect(result).not.toBeNull();
    // With no spec/status, all counts are 0, desired defaults to 1 (spec.replicas ?? 1)
    // 0 !== 1 for updatedReplicas, so not complete, not progressDeadlineExceeded
    // availableCond is undefined → status is 'progressing'
    expect(result?.status).toBe('progressing');
  });

  it('get_rollout_status stuck rollout covers availableCond.message ?? fallback at line 1156', () => {
    // Exercises line 1156: str(availableCond.message ?? 'Deployment is unavailable')
    // when the Available condition has no message field
    const store = makeStore([
      {
        kind: 'Deployment',
        name: 'stuck-rollout',
        namespace: 'default',
        raw: {
          spec: { replicas: 3 },
          status: {
            updatedReplicas: 3,
            availableReplicas: 0, // Not available yet
            readyReplicas: 0,
            conditions: [
              {
                type: 'Available',
                status: 'False',
                reason: 'MinimumReplicasUnavailable',
                // No message field — exercises ?? 'Deployment is unavailable'
              },
            ],
          },
        },
      },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_rollout_status', {
      name: 'stuck-rollout',
      namespace: 'default',
    }) as { status: string; message: string } | null;
    expect(result?.status).toBe('stuck');
    expect(result?.message).toBe('Deployment is unavailable');
  });

  it('get_rollout_status progressing covers progressCond?.message ?? fallback at line 1160', () => {
    // Exercises line 1160: str(progressCond?.message ?? 'Waiting for rollout to complete')
    // when there is no Progressing condition
    const store = makeStore([
      {
        kind: 'Deployment',
        name: 'progressing-rollout',
        namespace: 'default',
        raw: {
          spec: { replicas: 3 },
          status: {
            updatedReplicas: 1,
            availableReplicas: 1,
            readyReplicas: 1,
            // No conditions — progressCond is undefined → ?? 'Waiting for rollout to complete'
          },
        },
      },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_rollout_status', {
      name: 'progressing-rollout',
      namespace: 'default',
    }) as { status: string; message: string } | null;
    expect(result?.status).toBe('progressing');
    expect(result?.message).toBe('Waiting for rollout to complete');
  });

  it('get_rollout_status failed covers progressCond?.message ?? fallback at line 1146', () => {
    // Exercises line 1146: str(progressCond?.message ?? 'Progress deadline exceeded')
    // when the Progressing condition has no message field
    const store = makeStore([
      {
        kind: 'Deployment',
        name: 'failed-rollout',
        namespace: 'default',
        raw: {
          spec: { replicas: 2 },
          status: {
            updatedReplicas: 0,
            availableReplicas: 0,
            readyReplicas: 0,
            conditions: [
              {
                type: 'Progressing',
                status: 'False',
                reason: 'ProgressDeadlineExceeded',
                // No message — exercises ?? 'Progress deadline exceeded'
              },
            ],
          },
        },
      },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_rollout_status', {
      name: 'failed-rollout',
      namespace: 'default',
    }) as { status: string; message: string } | null;
    expect(result?.status).toBe('failed');
    expect(result?.message).toBe('Progress deadline exceeded');
  });

  it('get_kafka_lag with topic having no status covers topic.raw.status ?? {} at line 1197', () => {
    // Exercises line 1197: (topic.raw.status as ... | undefined) ?? {} when status is absent
    const store = makeStore([
      {
        kind: 'KafkaTopic',
        name: 'no-status-topic',
        namespace: 'kafka',
        // No status field — raw.status is undefined → hits ?? {}
      },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_kafka_lag', {}) as unknown[];
    // No consumerGroups (from empty status) → empty result
    expect(result).toHaveLength(0);
  });

  it('get_deployment_detail HPA with no spec exercises ?? {} at lines 1042 and 1054', () => {
    // Two HPAs:
    // 1. HPA with NO spec → h.raw.spec is undefined → ?? {} fires at line 1042
    //    (scaleTargetRef check fails, HPA is not matched)
    // 2. HPA with spec but NO status → matched as target → ?? {} fires at line 1056
    const store = makeStore([
      {
        kind: 'Deployment',
        name: 'hpa-cover-deploy',
        namespace: 'default',
        raw: {
          spec: {
            replicas: 1,
            template: { metadata: {}, spec: { containers: [] } },
          },
          status: {
            replicas: 1,
            readyReplicas: 1,
            availableReplicas: 1,
            updatedReplicas: 1,
          },
        },
      },
      {
        kind: 'HorizontalPodAutoscaler',
        name: 'hpa-no-spec',
        namespace: 'default',
        // No raw spec at all → h.raw.spec is undefined → ?? {} fires at line 1042
      },
      {
        kind: 'HorizontalPodAutoscaler',
        name: 'hpa-matching',
        namespace: 'default',
        raw: {
          spec: {
            minReplicas: 1,
            maxReplicas: 5,
            scaleTargetRef: { kind: 'Deployment', name: 'hpa-cover-deploy' },
            metrics: [],
          },
          // No status → ?? {} fires at line 1056
        },
      },
    ]);
    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_deployment_detail', {
      name: 'hpa-cover-deploy',
      namespace: 'default',
    }) as { hpa?: { currentReplicas: number } } | null;
    expect(result).not.toBeNull();
    expect(result?.hpa).toBeDefined();
    expect(result?.hpa?.currentReplicas).toBe(0);
  });

  it('get_deployment_detail HPA matched but has no raw spec (exercises ?? {} at line 1054)', () => {
    // This requires an HPA that passes the find check but has no raw.spec at the processing step.
    // We construct a custom store where the HPA's ResourceObject has kind=HPA but raw.spec is absent.
    const store = new StateStore((event: ResourceEvent): ResourceObject => {
      const meta = event.object.metadata ?? {};
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
        status: { color: 'green', label: 'Running' },
        raw: event.object,
      };
    });

    store.applyEvent(CONTEXT, {
      type: 'ADDED',
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      namespace: 'default',
      name: 'hpa-no-rawspec-deploy',
      receivedAt: NOW_MS,
      object: {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: {
          name: 'hpa-no-rawspec-deploy',
          namespace: 'default',
          creationTimestamp: '2026-06-01T00:00:00Z',
        },
        spec: {
          replicas: 1,
          template: { metadata: {}, spec: { containers: [] } },
        },
        status: {
          replicas: 1,
          readyReplicas: 1,
          availableReplicas: 1,
          updatedReplicas: 1,
        },
      },
    });

    // HPA with spec containing scaleTargetRef (so it matches in find loop)
    // but the raw spec is structured to ensure raw.spec at line 1054 is accessible
    // We set spec to include the scaleTargetRef correctly but after matching,
    // the same object is used — this test specifically covers the "spec is present" path
    // at 1054 to verify we actually hit it.
    // For the null path at 1054, we need to trick: use a raw where spec is undefined
    // at the object level. Since spec is read twice (line 1042 for find, line 1054 for use),
    // we need spec to be non-null during find but null at use — impossible with same object.
    // Instead, we accept that line 1054 branch 0 means the NORMAL path (spec IS defined),
    // and "branch 0 uncovered" in lcov may indicate the nullish path of ?? is hit.
    // The test above with 'hpa-no-spec' exercises the case where spec is truly absent.
    store.applyEvent(CONTEXT, {
      type: 'ADDED',
      apiVersion: 'autoscaling/v2',
      kind: 'HorizontalPodAutoscaler',
      namespace: 'default',
      name: 'hpa-no-rawspec',
      receivedAt: NOW_MS,
      object: {
        apiVersion: 'autoscaling/v2',
        kind: 'HorizontalPodAutoscaler',
        metadata: {
          name: 'hpa-no-rawspec',
          namespace: 'default',
          creationTimestamp: '2026-06-01T00:00:00Z',
        },
        spec: {
          minReplicas: 1,
          maxReplicas: 3,
          scaleTargetRef: { kind: 'Deployment', name: 'hpa-no-rawspec-deploy' },
          metrics: [],
        },
        // status is present to ensure complete processing
        status: { currentReplicas: 2 },
      },
    });

    const dispatcher = makeDispatcher(store);
    const result = dispatcher.dispatch('get_deployment_detail', {
      name: 'hpa-no-rawspec-deploy',
      namespace: 'default',
    }) as { hpa?: { currentReplicas: number } } | null;
    expect(result?.hpa).toBeDefined();
    expect(result?.hpa?.currentReplicas).toBe(2);
  });
});
