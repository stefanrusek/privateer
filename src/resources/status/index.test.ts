import { describe, it, expect } from 'vitest';
import type { KubernetesObject } from '../../core/types.js';
import {
  resolveDeploymentStatus,
  resolveStatefulSetStatus,
  resolveDaemonSetStatus,
  resolveReplicaSetStatus,
  resolvePodStatus,
  resolveJobStatus,
  resolveCronJobStatus,
  resolveServiceStatus,
  resolveIngressStatus,
  resolveNetworkPolicyStatus,
  resolveHPAStatus,
  resolvePVCStatus,
  resolvePVStatus,
  resolveNodeStatus,
  resolveNamespaceStatus,
  resolveStrimziStatus,
  resolveDopplerSecretStatus,
  resolveAlertmanagerStatus,
  resolveGenericStatus,
  resolveStatus,
} from './index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRaw(overrides: Partial<KubernetesObject> = {}): KubernetesObject {
  return { ...overrides };
}

function withStatus(
  status: Record<string, unknown>,
  overrides: Partial<KubernetesObject> = {},
): KubernetesObject {
  return makeRaw({ status, ...overrides });
}

function withSpec(
  spec: Record<string, unknown>,
  status: Record<string, unknown> = {},
  overrides: Partial<KubernetesObject> = {},
): KubernetesObject {
  return makeRaw({ spec, status, ...overrides });
}

function cond(type: string, condStatus: string, reason?: string) {
  if (reason !== undefined) {
    return { type, status: condStatus, reason };
  }
  return { type, status: condStatus };
}

// ---------------------------------------------------------------------------
// Deployments (Spec 03 §3.1)
// ---------------------------------------------------------------------------

describe('resolveDeploymentStatus', () => {
  it.each([
    [
      'green: availableReplicas == replicas > 0',
      withStatus({ replicas: 3, availableReplicas: 3 }),
      'green',
      'Available',
    ],
    [
      'green: single replica available',
      withStatus({ replicas: 1, availableReplicas: 1 }),
      'green',
      'Available',
    ],
    [
      'yellow: availableReplicas < replicas && > 0',
      withStatus({ replicas: 3, availableReplicas: 2 }),
      'yellow',
      'Degraded',
    ],
    [
      'yellow: boundary edge availableReplicas == 1 (> 0)',
      withStatus({ replicas: 3, availableReplicas: 1 }),
      'yellow',
      'Degraded',
    ],
    [
      'yellow: Progressing condition true with available < replicas',
      withStatus({
        replicas: 3,
        availableReplicas: 2,
        conditions: [cond('Progressing', 'True')],
      }),
      'yellow',
      'Progressing',
    ],
    [
      'red: availableReplicas == 0 and replicas > 0',
      withStatus({ replicas: 3, availableReplicas: 0 }),
      'red',
      'Unavailable',
    ],
    [
      'red: ReplicaFailure condition true',
      withStatus({
        replicas: 3,
        availableReplicas: 0,
        conditions: [cond('ReplicaFailure', 'True')],
      }),
      'red',
      'ReplicaFailure',
    ],
    [
      'grey: replicas == 0 (scaled to zero)',
      withStatus({ replicas: 0 }),
      'grey',
      'Scaled Down',
    ],
    ['grey: no status data at all', withStatus({}), 'grey', 'Scaled Down'],
    [
      'green: Progressing=True but available == replicas (fully available)',
      withStatus({
        replicas: 3,
        availableReplicas: 3,
        conditions: [cond('Progressing', 'True')],
      }),
      'green',
      'Available',
    ],
  ])('%s', (_name, raw, color, label) => {
    const result = resolveDeploymentStatus(raw);
    expect(result.color).toBe(color);
    expect(result.label).toBe(label);
  });
});

// ---------------------------------------------------------------------------
// StatefulSets (Spec 03 §3.1)
// ---------------------------------------------------------------------------

describe('resolveStatefulSetStatus', () => {
  it.each([
    [
      'green: readyReplicas == replicas > 0',
      withStatus({ replicas: 3, readyReplicas: 3 }),
      'green',
      'Ready',
    ],
    [
      'yellow: readyReplicas < replicas && readyReplicas > 0',
      withStatus({ replicas: 3, readyReplicas: 2 }),
      'yellow',
      'Degraded',
    ],
    [
      'yellow: boundary readyReplicas == 1',
      withStatus({ replicas: 3, readyReplicas: 1 }),
      'yellow',
      'Degraded',
    ],
    [
      'red: readyReplicas == 0 && replicas > 0',
      withStatus({ replicas: 3, readyReplicas: 0 }),
      'red',
      'Unavailable',
    ],
    [
      'red: no readyReplicas field with replicas > 0',
      withStatus({ replicas: 3 }),
      'red',
      'Unavailable',
    ],
    ['grey: replicas == 0', withStatus({ replicas: 0 }), 'grey', 'Scaled Down'],
    ['grey: no status data', withStatus({}), 'grey', 'Scaled Down'],
  ])('%s', (_name, raw, color, label) => {
    const result = resolveStatefulSetStatus(raw);
    expect(result.color).toBe(color);
    expect(result.label).toBe(label);
  });
});

// ---------------------------------------------------------------------------
// DaemonSets (Spec 03 §3.1)
// ---------------------------------------------------------------------------

describe('resolveDaemonSetStatus', () => {
  it.each([
    [
      'green: numberReady == desiredNumberScheduled',
      withStatus({ desiredNumberScheduled: 3, numberReady: 3 }),
      'green',
      'Ready',
    ],
    [
      'yellow: numberReady < desired && > 0',
      withStatus({ desiredNumberScheduled: 3, numberReady: 2 }),
      'yellow',
      'Degraded',
    ],
    [
      'yellow: boundary numberReady == 1',
      withStatus({ desiredNumberScheduled: 3, numberReady: 1 }),
      'yellow',
      'Degraded',
    ],
    [
      'red: numberReady == 0 && desired > 0',
      withStatus({ desiredNumberScheduled: 3, numberReady: 0 }),
      'red',
      'Unavailable',
    ],
    [
      'grey: desiredNumberScheduled == 0',
      withStatus({ desiredNumberScheduled: 0, numberReady: 0 }),
      'grey',
      'No Nodes',
    ],
    ['grey: no status data', withStatus({}), 'grey', 'No Nodes'],
  ])('%s', (_name, raw, color, label) => {
    const result = resolveDaemonSetStatus(raw);
    expect(result.color).toBe(color);
    expect(result.label).toBe(label);
  });
});

// ---------------------------------------------------------------------------
// ReplicaSets — same logic as Deployment
// ---------------------------------------------------------------------------

describe('resolveReplicaSetStatus', () => {
  it('delegates to deployment resolver (green case)', () => {
    const raw = withStatus({ replicas: 2, availableReplicas: 2 });
    expect(resolveReplicaSetStatus(raw)).toEqual(resolveDeploymentStatus(raw));
  });

  it('delegates to deployment resolver (red case)', () => {
    const raw = withStatus({ replicas: 2, availableReplicas: 0 });
    expect(resolveReplicaSetStatus(raw)).toEqual(resolveDeploymentStatus(raw));
  });
});

// ---------------------------------------------------------------------------
// Pods (Spec 03 §3.1)
// ---------------------------------------------------------------------------

describe('resolvePodStatus', () => {
  const running = (
    ready: boolean,
    restarts: number,
    state?: Record<string, unknown>,
  ) => {
    const cs: Record<string, unknown> = { ready, restartCount: restarts };
    if (state !== undefined) {
      cs.state = state;
    }
    return withStatus({ phase: 'Running', containerStatuses: [cs] });
  };

  it.each([
    [
      'green: Running all ready restarts < 5',
      running(true, 0),
      'green',
      'Running',
    ],
    [
      'green: Running restarts == 4 (boundary edge)',
      running(true, 4),
      'green',
      'Running',
    ],
    [
      'yellow: Running restarts >= 5',
      running(true, 5),
      'yellow',
      'High Restarts',
    ],
    [
      'yellow: Running restarts >> 5',
      running(true, 100),
      'yellow',
      'High Restarts',
    ],
    [
      'yellow: Pending phase',
      withStatus({ phase: 'Pending' }),
      'yellow',
      'Pending',
    ],
    ['red: Failed phase', withStatus({ phase: 'Failed' }), 'red', 'Failed'],
    [
      'grey: Succeeded phase',
      withStatus({ phase: 'Succeeded' }),
      'grey',
      'Succeeded',
    ],
    [
      'grey: Unknown phase',
      withStatus({ phase: 'Unknown' }),
      'grey',
      'Unknown',
    ],
    ['grey: no phase (defaults to Unknown)', withStatus({}), 'grey', 'Unknown'],
    [
      'red: CrashLoopBackOff',
      running(false, 3, { waiting: { reason: 'CrashLoopBackOff' } }),
      'red',
      'CrashLoopBackOff',
    ],
    [
      'red: OOMKilled',
      running(false, 0, { terminated: { reason: 'OOMKilled' } }),
      'red',
      'OOMKilled',
    ],
    [
      'red: Error',
      running(false, 0, { terminated: { reason: 'Error' } }),
      'red',
      'Error',
    ],
    [
      'grey: Terminating (deletionTimestamp set)',
      {
        ...withStatus({ phase: 'Running' }),
        metadata: { deletionTimestamp: '2024-01-01T00:00:00Z' },
      },
      'grey',
      'Terminating',
    ],
    [
      'green: Running no containerStatuses',
      withStatus({ phase: 'Running' }),
      'green',
      'Running',
    ],
    [
      'green: Running container with undefined restartCount (defaults to 0)',
      withStatus({
        phase: 'Running',
        containerStatuses: [{ ready: true }],
      }),
      'green',
      'Running',
    ],
  ])('%s', (_name, raw, color, label) => {
    const result = resolvePodStatus(raw);
    expect(result.color).toBe(color);
    expect(result.label).toBe(label);
  });
});

// ---------------------------------------------------------------------------
// Jobs (Spec 03 §3.1)
// ---------------------------------------------------------------------------

describe('resolveJobStatus', () => {
  it.each([
    [
      'green: Complete condition true',
      withStatus({ conditions: [cond('Complete', 'True')] }),
      'green',
      'Complete',
    ],
    ['yellow: active > 0', withStatus({ active: 1 }), 'yellow', 'Running'],
    ['yellow: active == 2', withStatus({ active: 2 }), 'yellow', 'Running'],
    [
      'red: Failed condition true',
      withStatus({ conditions: [cond('Failed', 'True')] }),
      'red',
      'Failed',
    ],
    ['grey: no conditions, no active', withStatus({}), 'grey', 'Pending'],
    ['grey: active == 0', withStatus({ active: 0 }), 'grey', 'Pending'],
  ])('%s', (_name, raw, color, label) => {
    const result = resolveJobStatus(raw);
    expect(result.color).toBe(color);
    expect(result.label).toBe(label);
  });
});

// ---------------------------------------------------------------------------
// CronJobs (Spec 03 §3.1)
// ---------------------------------------------------------------------------

describe('resolveCronJobStatus', () => {
  it.each([
    [
      'green: not suspended, has lastScheduleTime',
      withSpec(
        { suspend: false },
        { lastScheduleTime: '2024-01-01T00:00:00Z' },
      ),
      'green',
      'Active',
    ],
    [
      'yellow: suspended with lastScheduleTime',
      withSpec({ suspend: true }, { lastScheduleTime: '2024-01-01T00:00:00Z' }),
      'yellow',
      'Suspended',
    ],
    [
      'grey: not suspended, no lastScheduleTime',
      withSpec({ suspend: false }, {}),
      'grey',
      'Never Run',
    ],
    ['grey: no spec or status', withStatus({}), 'grey', 'Never Run'],
    [
      'grey: suspend undefined, no lastScheduleTime',
      withSpec({}, {}),
      'grey',
      'Never Run',
    ],
  ])('%s', (_name, raw, color, label) => {
    const result = resolveCronJobStatus(raw);
    expect(result.color).toBe(color);
    expect(result.label).toBe(label);
  });
});

// ---------------------------------------------------------------------------
// Services (Spec 03 §3.2)
// ---------------------------------------------------------------------------

describe('resolveServiceStatus', () => {
  it.each([
    ['green: ClusterIP', withSpec({ type: 'ClusterIP' }), 'green', 'ClusterIP'],
    ['green: NodePort', withSpec({ type: 'NodePort' }), 'green', 'NodePort'],
    [
      'green: LoadBalancer with external IP',
      withSpec(
        { type: 'LoadBalancer' },
        { loadBalancer: { ingress: [{ ip: '1.2.3.4' }] } },
      ),
      'green',
      'Assigned',
    ],
    [
      'yellow: LoadBalancer no IP — empty ingress array',
      withSpec({ type: 'LoadBalancer' }, { loadBalancer: { ingress: [] } }),
      'yellow',
      'Pending',
    ],
    [
      'yellow: LoadBalancer no IP — no loadBalancer key',
      withSpec({ type: 'LoadBalancer' }, {}),
      'yellow',
      'Pending',
    ],
    [
      'grey: ExternalName',
      withSpec({ type: 'ExternalName' }),
      'grey',
      'External',
    ],
    [
      'grey: Headless (ClusterIP=None)',
      withSpec({ type: 'ClusterIP', clusterIP: 'None' }),
      'grey',
      'Headless',
    ],
    [
      'grey: unknown type falls through to grey',
      withSpec({ type: 'UnknownType' }),
      'grey',
      'UnknownType',
    ],
    [
      'grey: no type at all (falls through to Unknown)',
      withSpec({}),
      'grey',
      'Unknown',
    ],
  ])('%s', (_name, raw, color, label) => {
    const result = resolveServiceStatus(raw);
    expect(result.color).toBe(color);
    expect(result.label).toBe(label);
  });
});

// ---------------------------------------------------------------------------
// Ingresses (Spec 03 §3.2)
// ---------------------------------------------------------------------------

describe('resolveIngressStatus', () => {
  it.each([
    [
      'green: address assigned',
      withSpec(
        { rules: [{ host: 'x.com' }] },
        { loadBalancer: { ingress: [{ ip: '1.2.3.4' }] } },
      ),
      'green',
      'Assigned',
    ],
    [
      'yellow: rules defined, no address',
      withSpec({ rules: [{ host: 'x.com' }] }, {}),
      'yellow',
      'Pending',
    ],
    ['grey: no rules', withSpec({}, {}), 'grey', 'No Rules'],
    [
      'grey: empty rules array',
      withSpec({ rules: [] }, {}),
      'grey',
      'No Rules',
    ],
  ])('%s', (_name, raw, color, label) => {
    const result = resolveIngressStatus(raw);
    expect(result.color).toBe(color);
    expect(result.label).toBe(label);
  });
});

// ---------------------------------------------------------------------------
// NetworkPolicies (Spec 03 §3.2)
// ---------------------------------------------------------------------------

describe('resolveNetworkPolicyStatus', () => {
  it('always returns grey', () => {
    const result = resolveNetworkPolicyStatus(withStatus({}));
    expect(result.color).toBe('grey');
    expect(result.label).toBe('NetworkPolicy');
  });
});

// ---------------------------------------------------------------------------
// HPA (Spec 03 §3.3)
// ---------------------------------------------------------------------------

describe('resolveHPAStatus', () => {
  it.each([
    [
      'green: within bounds',
      withSpec({ minReplicas: 1, maxReplicas: 5 }, { currentReplicas: 3 }),
      'green',
      'OK',
    ],
    [
      'yellow: at maximum',
      withSpec({ minReplicas: 1, maxReplicas: 5 }, { currentReplicas: 5 }),
      'yellow',
      'At Maximum',
    ],
    [
      'red: ScalingLimited condition',
      withSpec(
        { minReplicas: 1, maxReplicas: 5 },
        {
          currentReplicas: 5,
          conditions: [cond('ScalingLimited', 'True')],
        },
      ),
      'red',
      'ScalingLimited',
    ],
    [
      'red: AbleToScale=False condition',
      withSpec(
        { minReplicas: 1, maxReplicas: 5 },
        {
          currentReplicas: 3,
          conditions: [cond('AbleToScale', 'False')],
        },
      ),
      'red',
      'AbleToScale',
    ],
    [
      'green: no maxReplicas (0 default — skip at-max check)',
      withSpec({}, { currentReplicas: 0 }),
      'green',
      'OK',
    ],
  ])('%s', (_name, raw, color, label) => {
    const result = resolveHPAStatus(raw);
    expect(result.color).toBe(color);
    expect(result.label).toBe(label);
  });
});

// ---------------------------------------------------------------------------
// PVCs (Spec 03 §3.4)
// ---------------------------------------------------------------------------

describe('resolvePVCStatus', () => {
  it.each([
    ['green: Bound', withStatus({ phase: 'Bound' }), 'green', 'Bound'],
    ['yellow: Pending', withStatus({ phase: 'Pending' }), 'yellow', 'Pending'],
    ['red: Lost', withStatus({ phase: 'Lost' }), 'red', 'Lost'],
    ['grey: Released', withStatus({ phase: 'Released' }), 'grey', 'Released'],
    ['grey: no phase', withStatus({}), 'grey', 'Unknown'],
    [
      'grey: unknown phase',
      withStatus({ phase: 'SomeOther' }),
      'grey',
      'Unknown',
    ],
  ])('%s', (_name, raw, color, label) => {
    const result = resolvePVCStatus(raw);
    expect(result.color).toBe(color);
    expect(result.label).toBe(label);
  });
});

// ---------------------------------------------------------------------------
// PVs (Spec 03 §3.4)
// ---------------------------------------------------------------------------

describe('resolvePVStatus', () => {
  it.each([
    ['green: Bound', withStatus({ phase: 'Bound' }), 'green', 'Bound'],
    [
      'green: Available',
      withStatus({ phase: 'Available' }),
      'green',
      'Available',
    ],
    ['yellow: Pending', withStatus({ phase: 'Pending' }), 'yellow', 'Pending'],
    [
      'yellow: Released',
      withStatus({ phase: 'Released' }),
      'yellow',
      'Released',
    ],
    ['red: Failed', withStatus({ phase: 'Failed' }), 'red', 'Failed'],
    ['grey: no phase', withStatus({}), 'grey', 'Unknown'],
    ['grey: unknown phase', withStatus({ phase: 'Other' }), 'grey', 'Unknown'],
  ])('%s', (_name, raw, color, label) => {
    const result = resolvePVStatus(raw);
    expect(result.color).toBe(color);
    expect(result.label).toBe(label);
  });
});

// ---------------------------------------------------------------------------
// Nodes (Spec 03 §3.6)
// ---------------------------------------------------------------------------

describe('resolveNodeStatus', () => {
  it.each([
    [
      'green: Ready, no pressure',
      withSpec({}, { conditions: [cond('Ready', 'True')] }),
      'green',
      'Ready',
    ],
    [
      'yellow: MemoryPressure',
      withSpec(
        {},
        {
          conditions: [cond('Ready', 'True'), cond('MemoryPressure', 'True')],
        },
      ),
      'yellow',
      'MemoryPressure',
    ],
    [
      'yellow: DiskPressure',
      withSpec(
        {},
        {
          conditions: [cond('Ready', 'True'), cond('DiskPressure', 'True')],
        },
      ),
      'yellow',
      'DiskPressure',
    ],
    [
      'yellow: PIDPressure',
      withSpec(
        {},
        {
          conditions: [cond('Ready', 'True'), cond('PIDPressure', 'True')],
        },
      ),
      'yellow',
      'PIDPressure',
    ],
    [
      'red: Ready=False',
      withSpec({}, { conditions: [cond('Ready', 'False')] }),
      'red',
      'NotReady',
    ],
    [
      'red: Ready=Unknown',
      withSpec({}, { conditions: [cond('Ready', 'Unknown')] }),
      'red',
      'NotReady',
    ],
    ['red: no conditions', withSpec({}, { conditions: [] }), 'red', 'NotReady'],
    ['red: no status', withSpec({}), 'red', 'NotReady'],
    [
      'grey: cordoned (unschedulable=true)',
      withSpec(
        { unschedulable: true },
        { conditions: [cond('Ready', 'True')] },
      ),
      'grey',
      'Cordoned',
    ],
  ])('%s', (_name, raw, color, label) => {
    const result = resolveNodeStatus(raw);
    expect(result.color).toBe(color);
    expect(result.label).toBe(label);
  });
});

// ---------------------------------------------------------------------------
// Namespaces (Spec 03 §3.7)
// ---------------------------------------------------------------------------

describe('resolveNamespaceStatus', () => {
  it.each([
    ['green: Active', withStatus({ phase: 'Active' }), 'green', 'Active'],
    [
      'red: Terminating',
      withStatus({ phase: 'Terminating' }),
      'red',
      'Terminating',
    ],
    ['grey: no phase', withStatus({}), 'grey', 'Unknown'],
    ['grey: unknown phase', withStatus({ phase: 'Other' }), 'grey', 'Unknown'],
  ])('%s', (_name, raw, color, label) => {
    const result = resolveNamespaceStatus(raw);
    expect(result.color).toBe(color);
    expect(result.label).toBe(label);
  });
});

// ---------------------------------------------------------------------------
// Strimzi (Spec 03 §5.2)
// ---------------------------------------------------------------------------

describe('resolveStrimziStatus', () => {
  it.each([
    [
      'green: Ready=True',
      withStatus({ conditions: [cond('Ready', 'True')] }),
      'green',
      'Ready',
    ],
    [
      'yellow: Ready=Unknown',
      withStatus({ conditions: [cond('Ready', 'Unknown')] }),
      'yellow',
      'Unknown',
    ],
    [
      'red: Ready=False with reason',
      withStatus({
        conditions: [cond('Ready', 'False', 'Error')],
      }),
      'red',
      'NotReady',
    ],
    [
      'red: Ready=False no reason',
      withStatus({ conditions: [cond('Ready', 'False')] }),
      'red',
      'NotReady',
    ],
    [
      'red: NotReady condition present',
      withStatus({ conditions: [cond('NotReady', 'True')] }),
      'red',
      'NotReady',
    ],
    ['grey: no conditions', withStatus({}), 'grey', 'No Conditions'],
    [
      'grey: empty conditions array',
      withStatus({ conditions: [] }),
      'grey',
      'No Conditions',
    ],
  ])('%s', (_name, raw, color, label) => {
    const result = resolveStrimziStatus(raw);
    expect(result.color).toBe(color);
    expect(result.label).toBe(label);
  });
});

// ---------------------------------------------------------------------------
// Doppler (Spec 03 §5.3)
// ---------------------------------------------------------------------------

describe('resolveDopplerSecretStatus', () => {
  it.each([
    [
      'green: secretsGenerated=True',
      withStatus({
        conditions: [cond('secrets.doppler.com/secretsGenerated', 'True')],
      }),
      'green',
      'Synced',
    ],
    [
      'green: ConditionReady=True',
      withStatus({
        conditions: [cond('ConditionReady', 'True')],
      }),
      'green',
      'Synced',
    ],
    [
      'yellow: ConditionReady=Unknown',
      withStatus({
        conditions: [cond('ConditionReady', 'Unknown')],
      }),
      'yellow',
      'Unknown',
    ],
    [
      'red: ConditionReady=False',
      withStatus({
        conditions: [cond('ConditionReady', 'False')],
      }),
      'red',
      'Failed',
    ],
    ['grey: no conditions', withStatus({}), 'grey', 'No Conditions'],
    [
      'grey: empty conditions array',
      withStatus({ conditions: [] }),
      'grey',
      'No Conditions',
    ],
    [
      'yellow: secretsGenerated=Unknown (no ConditionReady)',
      withStatus({
        conditions: [cond('secrets.doppler.com/secretsGenerated', 'Unknown')],
      }),
      'yellow',
      'Unknown',
    ],
    [
      'red: secretsGenerated=False (no ConditionReady, conditionUnknown=false)',
      withStatus({
        conditions: [cond('secrets.doppler.com/secretsGenerated', 'False')],
      }),
      'red',
      'Failed',
    ],
  ])('%s', (_name, raw, color, label) => {
    const result = resolveDopplerSecretStatus(raw);
    expect(result.color).toBe(color);
    expect(result.label).toBe(label);
  });
});

// ---------------------------------------------------------------------------
// Alertmanager (Spec 03 §5.4) — same Ready-condition pattern as Strimzi
// ---------------------------------------------------------------------------

describe('resolveAlertmanagerStatus', () => {
  it('is the same function as resolveStrimziStatus', () => {
    // Verify by running shared cases
    expect(
      resolveAlertmanagerStatus(
        withStatus({ conditions: [cond('Ready', 'True')] }),
      ).color,
    ).toBe('green');
    expect(resolveAlertmanagerStatus(withStatus({})).color).toBe('grey');
  });
});

// ---------------------------------------------------------------------------
// Generic fallback (Spec 03 §4)
// ---------------------------------------------------------------------------

describe('resolveGenericStatus', () => {
  it.each([
    // Ready condition cases
    [
      'green: Ready=True',
      withStatus({ conditions: [cond('Ready', 'True')] }),
      'green',
      'Ready',
    ],
    [
      'grey: Ready=Unknown',
      withStatus({ conditions: [cond('Ready', 'Unknown')] }),
      'grey',
      'Unknown',
    ],
    [
      'red: Ready=False',
      withStatus({ conditions: [cond('Ready', 'False')] }),
      'red',
      'Ready',
    ],
    // Available condition cases (fallback when no Ready)
    [
      'green: Available=True',
      withStatus({ conditions: [cond('Available', 'True')] }),
      'green',
      'Available',
    ],
    [
      'grey: Available=Unknown',
      withStatus({ conditions: [cond('Available', 'Unknown')] }),
      'grey',
      'Unknown',
    ],
    [
      'red: Available=False',
      withStatus({ conditions: [cond('Available', 'False')] }),
      'red',
      'Available',
    ],
    // No matching conditions
    ['grey: no conditions', withStatus({}), 'grey', 'Unknown'],
    [
      'grey: empty conditions array',
      withStatus({ conditions: [] }),
      'grey',
      'Unknown',
    ],
    [
      'grey: unrecognized condition types only',
      withStatus({ conditions: [cond('SomeOther', 'True')] }),
      'grey',
      'Unknown',
    ],
  ])('%s', (_name, raw, color, label) => {
    const result = resolveGenericStatus(raw);
    expect(result.color).toBe(color);
    expect(result.label).toBe(label);
  });
});

// ---------------------------------------------------------------------------
// Registry — resolveStatus
// ---------------------------------------------------------------------------

describe('resolveStatus', () => {
  it('dispatches to the correct resolver for known kinds', () => {
    const deployRaw = withStatus({ replicas: 2, availableReplicas: 2 });
    expect(resolveStatus('Deployment', deployRaw).color).toBe('green');

    const podRaw = withStatus({ phase: 'Pending' });
    expect(resolveStatus('Pod', podRaw).color).toBe('yellow');
  });

  it('falls back to generic resolver for unknown kinds', () => {
    const raw = withStatus({ conditions: [cond('Ready', 'True')] });
    expect(resolveStatus('SomeUnknownKind', raw).color).toBe('green');
  });

  it('falls back to grey/Unknown for unknown kind with no conditions', () => {
    expect(resolveStatus('MyCustomCRD', withStatus({})).color).toBe('grey');
  });
});
