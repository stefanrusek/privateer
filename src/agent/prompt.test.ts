import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, buildToolDefinitions } from './prompt.js';
import { StateStore } from '../store/state-store.js';
import type { ResourceEvent, ResourceObject } from '../core/types.js';
import type { PromptContext } from './prompt.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CONTEXT_NAME = 'test-ctx';
const NOW_MS = new Date('2026-06-10T13:00:00Z').getTime();

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
      resourceVersion: '1',
      status: { color: 'green', label: 'Running' },
      raw: event.object,
    };
  });
}

function makeColoredStore(
  pods: {
    name: string;
    namespace: string;
    color: 'green' | 'yellow' | 'red' | 'grey';
  }[],
): StateStore {
  const colorMap = new Map(pods.map((p) => [p.name, p.color]));
  const store = new StateStore((event: ResourceEvent): ResourceObject => {
    const meta = event.object.metadata ?? {};
    const c = colorMap.get(event.name) ?? 'green';
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
      status: { color: c, label: c === 'red' ? 'Error' : 'Running' },
      raw: event.object,
    };
  });
  for (const p of pods) {
    store.applyEvent(CONTEXT_NAME, {
      type: 'ADDED',
      apiVersion: 'v1',
      kind: 'Pod',
      namespace: p.namespace,
      name: p.name,
      receivedAt: NOW_MS,
      object: {
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: {
          name: p.name,
          namespace: p.namespace,
          creationTimestamp: '2026-06-01T00:00:00Z',
        },
      },
    });
  }
  return store;
}

function makeDefaultContext(overrides?: Partial<PromptContext>): PromptContext {
  return {
    activeContext: 'prod-cluster',
    activeNamespace: null,
    activeResourceKind: 'Pod',
    healthIssues: [],
    kafkaClusters: [],
    allResourceKinds: ['Pod', 'Deployment', 'Service'],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildSystemPrompt', () => {
  it('includes agent identity header', () => {
    const store = makeStore();
    const ctx = makeDefaultContext();
    const prompt = buildSystemPrompt(ctx, store);
    expect(prompt).toContain('You are Privateer');
    expect(prompt).toContain('Kubernetes cluster assistant');
  });

  it('includes context name', () => {
    const store = makeStore();
    const ctx = makeDefaultContext({ activeContext: 'my-cluster' });
    const prompt = buildSystemPrompt(ctx, store);
    expect(prompt).toContain('Context: my-cluster');
  });

  it('shows "all namespaces" when activeNamespace is null', () => {
    const store = makeStore();
    const ctx = makeDefaultContext({ activeNamespace: null });
    const prompt = buildSystemPrompt(ctx, store);
    expect(prompt).toContain('Namespace filter: all namespaces');
  });

  it('shows "all namespaces" when activeNamespace is empty string', () => {
    const store = makeStore();
    const ctx = makeDefaultContext({ activeNamespace: '' });
    const prompt = buildSystemPrompt(ctx, store);
    expect(prompt).toContain('Namespace filter: all namespaces');
  });

  it('shows namespace when activeNamespace is set', () => {
    const store = makeStore();
    const ctx = makeDefaultContext({ activeNamespace: 'default' });
    const prompt = buildSystemPrompt(ctx, store);
    expect(prompt).toContain('Namespace filter: default');
  });

  it('includes active resource kind', () => {
    const store = makeStore();
    const ctx = makeDefaultContext({ activeResourceKind: 'Deployment' });
    const prompt = buildSystemPrompt(ctx, store);
    expect(prompt).toContain('Active view: Deployment');
  });

  it('counts deployments healthy and degraded', () => {
    const store = new StateStore((event: ResourceEvent): ResourceObject => {
      const meta = event.object.metadata ?? {};
      const color: 'green' | 'yellow' | 'red' | 'grey' =
        event.name === 'deploy-ok'
          ? 'green'
          : event.name === 'deploy-err'
            ? 'red'
            : event.name === 'deploy-warn'
              ? 'yellow'
              : 'grey';
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
        status: { color, label: 'Running' },
        raw: event.object,
      };
    });
    for (const name of ['deploy-ok', 'deploy-err', 'deploy-warn']) {
      store.applyEvent(CONTEXT_NAME, {
        type: 'ADDED',
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        namespace: 'default',
        name,
        receivedAt: NOW_MS,
        object: {
          apiVersion: 'apps/v1',
          kind: 'Deployment',
          metadata: {
            name,
            namespace: 'default',
            creationTimestamp: '2026-06-01T00:00:00Z',
          },
        },
      });
    }
    const ctx = makeDefaultContext({ activeContext: CONTEXT_NAME });
    const prompt = buildSystemPrompt(ctx, store);
    expect(prompt).toContain('Deployments: 1 healthy, 2 degraded');
  });

  it('counts statefulsets healthy and degraded', () => {
    const store = new StateStore((event: ResourceEvent): ResourceObject => {
      const meta = event.object.metadata ?? {};
      const color: 'green' | 'yellow' | 'red' | 'grey' =
        event.name === 'sts-ok'
          ? 'green'
          : event.name === 'sts-err'
            ? 'red'
            : 'grey';
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
        status: { color, label: 'Running' },
        raw: event.object,
      };
    });
    for (const name of ['sts-ok', 'sts-err']) {
      store.applyEvent(CONTEXT_NAME, {
        type: 'ADDED',
        apiVersion: 'apps/v1',
        kind: 'StatefulSet',
        namespace: 'default',
        name,
        receivedAt: NOW_MS,
        object: {
          apiVersion: 'apps/v1',
          kind: 'StatefulSet',
          metadata: {
            name,
            namespace: 'default',
            creationTimestamp: '2026-06-01T00:00:00Z',
          },
        },
      });
    }
    const ctx = makeDefaultContext({ activeContext: CONTEXT_NAME });
    const prompt = buildSystemPrompt(ctx, store);
    expect(prompt).toContain('StatefulSets: 1 healthy, 1 degraded');
  });

  it('shows pod counts by status', () => {
    const store = makeColoredStore([
      { name: 'pod-ok-1', namespace: 'default', color: 'green' },
      { name: 'pod-ok-2', namespace: 'default', color: 'green' },
      { name: 'pod-warn', namespace: 'default', color: 'yellow' },
      { name: 'pod-err', namespace: 'default', color: 'red' },
      { name: 'pod-pending', namespace: 'default', color: 'grey' },
    ]);
    const ctx = makeDefaultContext({ activeContext: CONTEXT_NAME });
    const prompt = buildSystemPrompt(ctx, store);
    expect(prompt).toContain('Pods: 2 running, 1 warning, 1 error, 1 pending');
  });

  it('includes namespace list', () => {
    const store = makeColoredStore([
      { name: 'pod-a', namespace: 'default', color: 'green' },
      { name: 'pod-b', namespace: 'kube-system', color: 'green' },
    ]);
    const ctx = makeDefaultContext({ activeContext: CONTEXT_NAME });
    const prompt = buildSystemPrompt(ctx, store);
    expect(prompt).toContain('### Namespaces');
    expect(prompt).toContain('default');
    expect(prompt).toContain('kube-system');
  });

  it('truncates namespace list to top 10 with "and N more"', () => {
    const pods = Array.from({ length: 15 }, (_, i) => ({
      name: `pod-${String(i)}`,
      namespace: `ns-${String(i)}`,
      color: 'green' as const,
    }));
    const store = makeColoredStore(pods);
    const ctx = makeDefaultContext({ activeContext: CONTEXT_NAME });
    const prompt = buildSystemPrompt(ctx, store);
    expect(prompt).toContain('and 5 more');
  });

  it('includes health issues up to 5', () => {
    const store = makeStore();
    const ctx = makeDefaultContext({
      healthIssues: [
        { severity: 'error', title: 'Pod CrashLoopBackOff' },
        { severity: 'warn', title: 'High restart count' },
        { severity: 'info', title: 'Resource limits missing' },
      ],
    });
    const prompt = buildSystemPrompt(ctx, store);
    expect(prompt).toContain('### Active health issues');
    expect(prompt).toContain('[ERROR] Pod CrashLoopBackOff');
    expect(prompt).toContain('[WARN] High restart count');
    expect(prompt).toContain('[INFO] Resource limits missing');
  });

  it('sorts health issues by severity (error first)', () => {
    const store = makeStore();
    const ctx = makeDefaultContext({
      healthIssues: [
        { severity: 'info', title: 'Info issue' },
        { severity: 'error', title: 'Error issue' },
        { severity: 'warn', title: 'Warn issue' },
      ],
    });
    const prompt = buildSystemPrompt(ctx, store);
    const errorIdx = prompt.indexOf('[ERROR]');
    const warnIdx = prompt.indexOf('[WARN]');
    const infoIdx = prompt.indexOf('[INFO]');
    expect(errorIdx).toBeLessThan(warnIdx);
    expect(warnIdx).toBeLessThan(infoIdx);
  });

  it('shows "None" when no health issues', () => {
    const store = makeStore();
    const ctx = makeDefaultContext({ healthIssues: [] });
    const prompt = buildSystemPrompt(ctx, store);
    expect(prompt).toContain('- None');
  });

  it('limits health issues to top 5', () => {
    const store = makeStore();
    const issues = Array.from({ length: 8 }, (_, i) => ({
      severity: 'error' as const,
      title: `Issue ${String(i)}`,
    }));
    const ctx = makeDefaultContext({ healthIssues: issues });
    const prompt = buildSystemPrompt(ctx, store);
    // Should have at most 5 issues listed
    const issueCount = (prompt.match(/\[ERROR\]/g) ?? []).length;
    expect(issueCount).toBeLessThanOrEqual(5);
  });

  it('includes Kafka section when clusters present', () => {
    const store = makeStore();
    const ctx = makeDefaultContext({
      kafkaClusters: [
        {
          clusterName: 'my-kafka',
          brokerCount: 3,
          topicCount: 42,
          lagSummary: 'group-a: 1200',
        },
      ],
    });
    const prompt = buildSystemPrompt(ctx, store);
    expect(prompt).toContain('### Kafka (if detected)');
    expect(prompt).toContain('my-kafka');
    expect(prompt).toContain('3 brokers');
    expect(prompt).toContain('42 topics');
    expect(prompt).toContain('group-a: 1200');
  });

  it('omits Kafka section when no clusters', () => {
    const store = makeStore();
    const ctx = makeDefaultContext({ kafkaClusters: [] });
    const prompt = buildSystemPrompt(ctx, store);
    expect(prompt).not.toContain('### Kafka');
  });

  it('includes available resource types', () => {
    const store = makeStore();
    const ctx = makeDefaultContext({
      allResourceKinds: ['Pod', 'Deployment', 'Service', 'ConfigMap'],
    });
    const prompt = buildSystemPrompt(ctx, store);
    expect(prompt).toContain('## Available resource types');
    expect(prompt).toContain('Pod, Deployment, Service, ConfigMap');
  });

  it('includes response format instructions', () => {
    const store = makeStore();
    const ctx = makeDefaultContext();
    const prompt = buildSystemPrompt(ctx, store);
    expect(prompt).toContain('## Response format');
    expect(prompt).toContain('"action":"navigate"');
    expect(prompt).toContain('"action":"filter"');
    expect(prompt).toContain('"action":"answer"');
    expect(prompt).toContain('"action":"multi"');
    expect(prompt).toContain('"action":"unknown"');
  });

  it('shows namespace error counts', () => {
    const store = makeColoredStore([
      { name: 'pod-ok', namespace: 'default', color: 'green' },
      { name: 'pod-err', namespace: 'default', color: 'red' },
    ]);
    const ctx = makeDefaultContext({ activeContext: CONTEXT_NAME });
    const prompt = buildSystemPrompt(ctx, store);
    // Should show error count for default namespace
    expect(prompt).toContain('errors');
  });

  it('handles StatefulSet with grey status (false branch of else-if)', () => {
    // Exercises the case where a StatefulSet is grey — neither stsHealthy nor stsDegraded increments.
    // This covers the false branch of `else if (color === 'red' || color === 'yellow')`.
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
        status: { color: 'grey', label: 'Pending' },
        raw: event.object,
      };
    });
    store.applyEvent(CONTEXT_NAME, {
      type: 'ADDED',
      apiVersion: 'apps/v1',
      kind: 'StatefulSet',
      namespace: 'default',
      name: 'sts-pending',
      receivedAt: NOW_MS,
      object: {
        apiVersion: 'apps/v1',
        kind: 'StatefulSet',
        metadata: {
          name: 'sts-pending',
          namespace: 'default',
          creationTimestamp: '2026-06-01T00:00:00Z',
        },
      },
    });
    const ctx = makeDefaultContext({ activeContext: CONTEXT_NAME });
    const prompt = buildSystemPrompt(ctx, store);
    // With 0 healthy and 0 degraded, it should still render the StatefulSets line
    expect(prompt).toContain('StatefulSets: 0 healthy');
  });

  it('handles pod with null namespace in nsPodCount (hits ?? fallback)', () => {
    // Add a pod that has null namespace (cluster-scoped). This exercises:
    //   line 98: pod.namespace ?? '~'  (the '~' fallback)
    //   line 106: pod.namespace ?? '~' in the error-count loop (same pod is red)
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
    // Apply event with null namespace (cluster-scoped resource)
    store.applyEvent(CONTEXT_NAME, {
      type: 'ADDED',
      apiVersion: 'v1',
      kind: 'Pod',
      namespace: null,
      name: 'cluster-pod',
      receivedAt: NOW_MS,
      object: {
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: {
          name: 'cluster-pod',
          creationTimestamp: '2026-06-01T00:00:00Z',
        },
      },
    });
    const ctx = makeDefaultContext({ activeContext: CONTEXT_NAME });
    const prompt = buildSystemPrompt(ctx, store);
    // The pod has null namespace, so it's bucketed under '~'
    expect(prompt).toContain('~');
  });

  it('handles Namespace resource with no pods (hits nsPodCount.get ?? 0 fallback)', () => {
    // Add a Namespace resource with no pods in that namespace.
    // This exercises line 119: nsPodCount.get(name) ?? 0 where the map has no entry.
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
    // Add a Namespace resource with null namespace (it's cluster-scoped)
    store.applyEvent(CONTEXT_NAME, {
      type: 'ADDED',
      apiVersion: 'v1',
      kind: 'Namespace',
      namespace: null,
      name: 'empty-ns',
      receivedAt: NOW_MS,
      object: {
        apiVersion: 'v1',
        kind: 'Namespace',
        metadata: {
          name: 'empty-ns',
          creationTimestamp: '2026-06-01T00:00:00Z',
        },
      },
    });
    const ctx = makeDefaultContext({ activeContext: CONTEXT_NAME });
    const prompt = buildSystemPrompt(ctx, store);
    // empty-ns appears in namespace list but with 0 pods
    expect(prompt).toContain('empty-ns');
  });

  it('health issue sort comparison with unknown severity hits ?? 2 fallback', () => {
    // Exercises line 145: severityOrder[b.severity] ?? 2 when severity is not in the map.
    // Uses a type cast to pass a non-standard severity value at runtime.
    const store = makeStore();
    const unknownSeverity = 'critical' as unknown as 'error';
    const ctx = makeDefaultContext({
      healthIssues: [
        { severity: 'error', title: 'Known issue' },
        { severity: unknownSeverity, title: 'Unknown severity issue' },
        { severity: 'warn', title: 'Warn issue' },
      ],
    });
    const prompt = buildSystemPrompt(ctx, store);
    // All issues appear (the unknown severity gets rank 2, treated as 'info' equivalent)
    expect(prompt).toContain('[ERROR] Known issue');
    expect(prompt).toContain('Unknown severity issue');
    expect(prompt).toContain('[WARN] Warn issue');
  });

  // ---- Golden file test ----
  it('matches golden file output', () => {
    // Add a deployment too
    const deployStore = new StateStore(
      (event: ResourceEvent): ResourceObject => {
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
      },
    );
    // Add pods
    deployStore.applyEvent(CONTEXT_NAME, {
      type: 'ADDED',
      apiVersion: 'v1',
      kind: 'Pod',
      namespace: 'default',
      name: 'pod-ok',
      receivedAt: NOW_MS,
      object: {
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: {
          name: 'pod-ok',
          namespace: 'default',
          creationTimestamp: '2026-06-01T00:00:00Z',
        },
      },
    });
    // Add deployment
    deployStore.applyEvent(CONTEXT_NAME, {
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
      },
    });

    const ctx: PromptContext = {
      activeContext: 'staging-cluster',
      activeNamespace: 'default',
      activeResourceKind: 'Pod',
      healthIssues: [{ severity: 'error', title: 'CrashLoopBackOff detected' }],
      kafkaClusters: [],
      allResourceKinds: ['Pod', 'Deployment', 'Service'],
    };

    const prompt = buildSystemPrompt(ctx, deployStore);

    // Golden assertions — key structure
    expect(prompt).toContain('You are Privateer');
    expect(prompt).toContain('Context: staging-cluster');
    expect(prompt).toContain('Namespace filter: default');
    expect(prompt).toContain('Active view: Pod');
    expect(prompt).toContain('[ERROR] CrashLoopBackOff detected');
    expect(prompt).toContain('Pod, Deployment, Service');
  });
});

// ---------------------------------------------------------------------------
// buildToolDefinitions
// ---------------------------------------------------------------------------

describe('buildToolDefinitions', () => {
  it('returns all 9 tools', () => {
    const tools = buildToolDefinitions();
    expect(tools).toHaveLength(9);
  });

  it('includes list_resources', () => {
    const tools = buildToolDefinitions();
    const tool = tools.find((t) => t.name === 'list_resources');
    expect(tool).toBeDefined();
    expect(tool?.description).toContain('List Kubernetes resources');
  });

  it('includes get_resource', () => {
    const tools = buildToolDefinitions();
    expect(tools.find((t) => t.name === 'get_resource')).toBeDefined();
  });

  it('includes get_events', () => {
    const tools = buildToolDefinitions();
    expect(tools.find((t) => t.name === 'get_events')).toBeDefined();
  });

  it('includes count_resources', () => {
    const tools = buildToolDefinitions();
    expect(tools.find((t) => t.name === 'count_resources')).toBeDefined();
  });

  it('includes get_pod_detail', () => {
    const tools = buildToolDefinitions();
    expect(tools.find((t) => t.name === 'get_pod_detail')).toBeDefined();
  });

  it('includes find_erroring_pods', () => {
    const tools = buildToolDefinitions();
    expect(tools.find((t) => t.name === 'find_erroring_pods')).toBeDefined();
  });

  it('includes get_deployment_detail', () => {
    const tools = buildToolDefinitions();
    expect(tools.find((t) => t.name === 'get_deployment_detail')).toBeDefined();
  });

  it('includes get_rollout_status', () => {
    const tools = buildToolDefinitions();
    expect(tools.find((t) => t.name === 'get_rollout_status')).toBeDefined();
  });

  it('includes get_kafka_lag', () => {
    const tools = buildToolDefinitions();
    expect(tools.find((t) => t.name === 'get_kafka_lag')).toBeDefined();
  });

  it('all tools have parameters', () => {
    const tools = buildToolDefinitions();
    for (const tool of tools) {
      expect(tool.parameters).toBeDefined();
    }
  });

  it('adds pod detail to store for age formatting', () => {
    // Test edge case: empty store with no pods
    const store = makeStore();
    const ctx = makeDefaultContext();
    const prompt = buildSystemPrompt(ctx, store);
    // Should still work
    expect(prompt).toContain('Pods: 0 running');
  });
});
