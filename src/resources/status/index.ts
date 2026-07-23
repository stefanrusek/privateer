/**
 * Status resolver registry and all built-in resolvers (Spec 03 §3–5).
 *
 * Every resolver is a pure function: (raw: KubernetesObject) => ResourceStatus.
 * No I/O, no Date.now, no Math.random.
 */

import type { KubernetesObject, ResourceStatus } from '../../core/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface StatusCondition {
  type?: string;
  status?: string;
  reason?: string;
}

function getConditions(raw: KubernetesObject): StatusCondition[] {
  const conds = raw.status?.conditions;
  if (!Array.isArray(conds)) {
    return [];
  }
  return conds as StatusCondition[];
}

function findCondition(
  conditions: StatusCondition[],
  type: string,
): StatusCondition | undefined {
  return conditions.find((c) => c.type === type);
}

function conditionTrue(conditions: StatusCondition[], type: string): boolean {
  const c = findCondition(conditions, type);
  return c?.status === 'True';
}

function conditionUnknown(
  conditions: StatusCondition[],
  type: string,
): boolean {
  const c = findCondition(conditions, type);
  return c?.status === 'Unknown';
}

function numStatus(raw: KubernetesObject, key: string): number {
  const v = raw.status?.[key];
  return typeof v === 'number' ? v : 0;
}

function numSpec(raw: KubernetesObject, key: string): number {
  const v = raw.spec?.[key];
  return typeof v === 'number' ? v : 0;
}

function readyStr(a: number, b: number): string {
  return `${String(a)}/${String(b)}`;
}

// ---------------------------------------------------------------------------
// Workloads
// ---------------------------------------------------------------------------

export function resolveDeploymentStatus(raw: KubernetesObject): ResourceStatus {
  const replicas = numStatus(raw, 'replicas');
  const available = numStatus(raw, 'availableReplicas');
  const conditions = getConditions(raw);

  if (replicas === 0) {
    return { color: 'grey', label: 'Scaled Down' };
  }

  if (conditionTrue(conditions, 'ReplicaFailure')) {
    return { color: 'red', label: 'ReplicaFailure' };
  }

  if (available === 0) {
    return { color: 'red', label: 'Unavailable' };
  }

  if (conditionTrue(conditions, 'Progressing') && available < replicas) {
    return {
      color: 'yellow',
      label: 'Progressing',
      ready: readyStr(available, replicas),
    };
  }

  if (available < replicas) {
    return {
      color: 'yellow',
      label: 'Degraded',
      ready: readyStr(available, replicas),
    };
  }

  return {
    color: 'green',
    label: 'Available',
    ready: readyStr(available, replicas),
  };
}

export function resolveStatefulSetStatus(
  raw: KubernetesObject,
): ResourceStatus {
  const replicas = numStatus(raw, 'replicas');
  const ready = numStatus(raw, 'readyReplicas');

  if (replicas === 0) {
    return { color: 'grey', label: 'Scaled Down' };
  }

  if (ready === 0) {
    return { color: 'red', label: 'Unavailable', ready: readyStr(0, replicas) };
  }

  if (ready < replicas) {
    return {
      color: 'yellow',
      label: 'Degraded',
      ready: readyStr(ready, replicas),
    };
  }

  return { color: 'green', label: 'Ready', ready: readyStr(ready, replicas) };
}

export function resolveDaemonSetStatus(raw: KubernetesObject): ResourceStatus {
  const desired = numStatus(raw, 'desiredNumberScheduled');
  const ready = numStatus(raw, 'numberReady');

  if (desired === 0) {
    return { color: 'grey', label: 'No Nodes' };
  }

  if (ready === 0) {
    return { color: 'red', label: 'Unavailable', ready: readyStr(0, desired) };
  }

  if (ready < desired) {
    return {
      color: 'yellow',
      label: 'Degraded',
      ready: readyStr(ready, desired),
    };
  }

  return { color: 'green', label: 'Ready', ready: readyStr(ready, desired) };
}

// ReplicaSet uses the same logic as Deployment (Spec 03 §3.1)
export const resolveReplicaSetStatus = resolveDeploymentStatus;

interface ContainerState {
  waiting?: { reason?: string };
  terminated?: { reason?: string };
}

interface ContainerStatus {
  ready?: boolean;
  restartCount?: number;
  state?: ContainerState;
}

export function resolvePodStatus(raw: KubernetesObject): ResourceStatus {
  const phase = raw.status?.phase;
  const phaseStr = typeof phase === 'string' ? phase : 'Unknown';

  // Terminating check: deletionTimestamp set
  const deletionTimestamp = raw.metadata?.deletionTimestamp;
  if (typeof deletionTimestamp === 'string' && deletionTimestamp.length > 0) {
    return { color: 'grey', label: 'Terminating' };
  }

  if (phaseStr === 'Succeeded') {
    return { color: 'grey', label: 'Succeeded' };
  }

  if (phaseStr === 'Unknown') {
    return { color: 'grey', label: 'Unknown' };
  }

  if (phaseStr === 'Failed') {
    return { color: 'red', label: 'Failed' };
  }

  if (phaseStr === 'Pending') {
    return { color: 'yellow', label: 'Pending' };
  }

  // Running phase
  const rawStatuses = raw.status?.containerStatuses;
  const containerStatuses: ContainerStatus[] = Array.isArray(rawStatuses)
    ? (rawStatuses as ContainerStatus[])
    : [];

  // Check for CrashLoopBackOff, OOMKilled, Error
  for (const cs of containerStatuses) {
    const waitingReason = cs.state?.waiting?.reason;
    const terminatedReason = cs.state?.terminated?.reason;

    if (waitingReason === 'CrashLoopBackOff') {
      return { color: 'red', label: 'CrashLoopBackOff' };
    }

    if (terminatedReason === 'OOMKilled') {
      return { color: 'red', label: 'OOMKilled' };
    }

    if (terminatedReason === 'Error') {
      return { color: 'red', label: 'Error' };
    }
  }

  // Count restarts
  const totalRestarts = containerStatuses.reduce(
    (sum, cs) => sum + (cs.restartCount ?? 0),
    0,
  );

  if (totalRestarts >= 5) {
    return { color: 'yellow', label: 'High Restarts' };
  }

  const total = containerStatuses.length;
  const readyCount = containerStatuses.filter((cs) => cs.ready === true).length;

  return {
    color: 'green',
    label: 'Running',
    ready: readyStr(readyCount, total),
  };
}

export function resolveJobStatus(raw: KubernetesObject): ResourceStatus {
  const conditions = getConditions(raw);

  if (conditionTrue(conditions, 'Complete')) {
    return { color: 'green', label: 'Complete' };
  }

  if (conditionTrue(conditions, 'Failed')) {
    return { color: 'red', label: 'Failed' };
  }

  const active = raw.status?.active;
  if (typeof active === 'number' && active > 0) {
    return { color: 'yellow', label: 'Running' };
  }

  return { color: 'grey', label: 'Pending' };
}

export function resolveCronJobStatus(raw: KubernetesObject): ResourceStatus {
  const suspend = raw.spec?.suspend;
  const lastScheduleTime = raw.status?.lastScheduleTime;
  const hasScheduled =
    typeof lastScheduleTime === 'string' && lastScheduleTime.length > 0;

  if (!hasScheduled) {
    return { color: 'grey', label: 'Never Run' };
  }

  if (suspend === true) {
    return { color: 'yellow', label: 'Suspended' };
  }

  return { color: 'green', label: 'Active' };
}

// ---------------------------------------------------------------------------
// Networking
// ---------------------------------------------------------------------------

export function resolveServiceStatus(raw: KubernetesObject): ResourceStatus {
  const type = raw.spec?.type;
  const clusterIP = raw.spec?.clusterIP;

  if (type === 'ExternalName') {
    return { color: 'grey', label: 'External' };
  }

  if (type === 'ClusterIP' && clusterIP === 'None') {
    return { color: 'grey', label: 'Headless' };
  }

  if (type === 'ClusterIP' || type === 'NodePort') {
    const label = type === 'ClusterIP' ? 'ClusterIP' : 'NodePort';
    return { color: 'green', label };
  }

  if (type === 'LoadBalancer') {
    const ingress = raw.status?.loadBalancer;
    const ingressArr =
      ingress !== null &&
      typeof ingress === 'object' &&
      'ingress' in (ingress as Record<string, unknown>)
        ? ((ingress as Record<string, unknown>).ingress as unknown[])
        : [];

    if (Array.isArray(ingressArr) && ingressArr.length > 0) {
      return { color: 'green', label: 'Assigned' };
    }

    return { color: 'yellow', label: 'Pending' };
  }

  // Fallback (unknown type)
  return { color: 'grey', label: typeof type === 'string' ? type : 'Unknown' };
}

export function resolveIngressStatus(raw: KubernetesObject): ResourceStatus {
  const rules = raw.spec?.rules;
  const hasRules = Array.isArray(rules) && rules.length > 0;

  if (!hasRules) {
    return { color: 'grey', label: 'No Rules' };
  }

  const ingress = raw.status?.loadBalancer;
  const ingressArr =
    ingress !== null &&
    typeof ingress === 'object' &&
    'ingress' in (ingress as Record<string, unknown>)
      ? ((ingress as Record<string, unknown>).ingress as unknown[])
      : [];

  if (Array.isArray(ingressArr) && ingressArr.length > 0) {
    return { color: 'green', label: 'Assigned' };
  }

  return { color: 'yellow', label: 'Pending' };
}

export function resolveNetworkPolicyStatus(
  _raw: KubernetesObject,
): ResourceStatus {
  return { color: 'grey', label: 'NetworkPolicy' };
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export function resolveHPAStatus(raw: KubernetesObject): ResourceStatus {
  const conditions = getConditions(raw);
  const maxReplicas = numSpec(raw, 'maxReplicas');
  const current = numStatus(raw, 'currentReplicas');

  if (conditionTrue(conditions, 'ScalingLimited')) {
    return { color: 'red', label: 'ScalingLimited' };
  }

  const ableToScale = findCondition(conditions, 'AbleToScale');
  if (ableToScale?.status === 'False') {
    return { color: 'red', label: 'AbleToScale' };
  }

  if (maxReplicas > 0 && current >= maxReplicas) {
    return { color: 'yellow', label: 'At Maximum' };
  }

  return { color: 'green', label: 'OK' };
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

export function resolvePVCStatus(raw: KubernetesObject): ResourceStatus {
  const phase = raw.status?.phase;

  switch (phase) {
    case 'Bound':
      return { color: 'green', label: 'Bound' };
    case 'Pending':
      return { color: 'yellow', label: 'Pending' };
    case 'Lost':
      return { color: 'red', label: 'Lost' };
    case 'Released':
      return { color: 'grey', label: 'Released' };
    default:
      return { color: 'grey', label: 'Unknown' };
  }
}

export function resolvePVStatus(raw: KubernetesObject): ResourceStatus {
  const phase = raw.status?.phase;

  switch (phase) {
    case 'Bound':
      return { color: 'green', label: 'Bound' };
    case 'Available':
      return { color: 'green', label: 'Available' };
    case 'Pending':
      return { color: 'yellow', label: 'Pending' };
    case 'Released':
      return { color: 'yellow', label: 'Released' };
    case 'Failed':
      return { color: 'red', label: 'Failed' };
    default:
      return { color: 'grey', label: 'Unknown' };
  }
}

// StorageClass has no status color — not included in resolver registry

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

/**
 * Whether a node is ready, per the Ready condition alone (Spec: dashboard
 * node counts must not be reduced by pressure conditions — P9R-0001).
 */
export function isNodeReady(raw: KubernetesObject): boolean {
  const conditions = getConditions(raw);
  return findCondition(conditions, 'Ready')?.status === 'True';
}

/** Whether a node has any pressure condition (Memory/Disk/PID) set True. */
export function isNodeUnderPressure(raw: KubernetesObject): boolean {
  const conditions = getConditions(raw);
  return (
    conditionTrue(conditions, 'MemoryPressure') ||
    conditionTrue(conditions, 'DiskPressure') ||
    conditionTrue(conditions, 'PIDPressure')
  );
}

export function resolveNodeStatus(raw: KubernetesObject): ResourceStatus {
  const unschedulable = raw.spec?.unschedulable;
  const conditions = getConditions(raw);

  // Pressure conditions checked before cordoned to give accurate status
  const isReady = isNodeReady(raw);

  if (isReady) {
    if (conditionTrue(conditions, 'MemoryPressure')) {
      return { color: 'yellow', label: 'MemoryPressure' };
    }

    if (conditionTrue(conditions, 'DiskPressure')) {
      return { color: 'yellow', label: 'DiskPressure' };
    }

    if (conditionTrue(conditions, 'PIDPressure')) {
      return { color: 'yellow', label: 'PIDPressure' };
    }

    if (unschedulable === true) {
      return { color: 'grey', label: 'Cordoned' };
    }

    return { color: 'green', label: 'Ready' };
  }

  return { color: 'red', label: 'NotReady' };
}

// ---------------------------------------------------------------------------
// Namespaces
// ---------------------------------------------------------------------------

export function resolveNamespaceStatus(raw: KubernetesObject): ResourceStatus {
  const phase = raw.status?.phase;

  switch (phase) {
    case 'Active':
      return { color: 'green', label: 'Active' };
    case 'Terminating':
      return { color: 'red', label: 'Terminating' };
    default:
      return { color: 'grey', label: 'Unknown' };
  }
}

// ---------------------------------------------------------------------------
// Strimzi (Spec 03 §5.2) — conditions pattern
// ---------------------------------------------------------------------------

export function resolveStrimziStatus(raw: KubernetesObject): ResourceStatus {
  const conditions = getConditions(raw);

  if (conditions.length === 0) {
    return { color: 'grey', label: 'No Conditions' };
  }

  if (conditionTrue(conditions, 'NotReady')) {
    return { color: 'red', label: 'NotReady' };
  }

  const readyCondition = findCondition(conditions, 'Ready');

  if (readyCondition?.status === 'True') {
    return { color: 'green', label: 'Ready' };
  }

  if (readyCondition?.status === 'Unknown') {
    return { color: 'yellow', label: 'Unknown' };
  }

  // Ready=False (or absent with other conditions)
  return { color: 'red', label: 'NotReady' };
}

// ---------------------------------------------------------------------------
// Doppler (Spec 03 §5.3)
// ---------------------------------------------------------------------------

export function resolveDopplerSecretStatus(
  raw: KubernetesObject,
): ResourceStatus {
  const conditions = getConditions(raw);

  if (conditions.length === 0) {
    return { color: 'grey', label: 'No Conditions' };
  }

  // secretsGenerated=True → synced
  if (conditionTrue(conditions, 'secrets.doppler.com/secretsGenerated')) {
    return { color: 'green', label: 'Synced' };
  }

  const ready = findCondition(conditions, 'ConditionReady');

  if (ready?.status === 'True') {
    return { color: 'green', label: 'Synced' };
  }

  if (
    ready?.status === 'Unknown' ||
    conditionUnknown(conditions, 'secrets.doppler.com/secretsGenerated')
  ) {
    return { color: 'yellow', label: 'Unknown' };
  }

  // False
  return { color: 'red', label: 'Failed' };
}

// ---------------------------------------------------------------------------
// Prometheus Operator (Spec 03 §5.4)
// ---------------------------------------------------------------------------

// Alertmanager uses same Ready-condition pattern as Strimzi
export const resolveAlertmanagerStatus = resolveStrimziStatus;

// PrometheusRule, ServiceMonitor, PodMonitor have no status color —
// they fall through to generic (grey)

// ---------------------------------------------------------------------------
// Generic fallback (Spec 03 §4)
// ---------------------------------------------------------------------------

export function resolveGenericStatus(raw: KubernetesObject): ResourceStatus {
  const conditions = getConditions(raw);
  const readyCondition = findCondition(conditions, 'Ready');
  const availableCondition = findCondition(conditions, 'Available');

  if (readyCondition !== undefined) {
    if (readyCondition.status === 'True') {
      return { color: 'green', label: 'Ready' };
    }
    if (readyCondition.status === 'Unknown') {
      return { color: 'grey', label: 'Unknown' };
    }
    return { color: 'red', label: 'Ready' };
  }

  if (availableCondition !== undefined) {
    if (availableCondition.status === 'True') {
      return { color: 'green', label: 'Available' };
    }
    if (availableCondition.status === 'Unknown') {
      return { color: 'grey', label: 'Unknown' };
    }
    return { color: 'red', label: 'Available' };
  }

  return { color: 'grey', label: 'Unknown' };
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

type StatusResolver = (raw: KubernetesObject) => ResourceStatus;

const resolvers: ReadonlyMap<string, StatusResolver> = new Map<
  string,
  StatusResolver
>([
  // Workloads
  ['Deployment', resolveDeploymentStatus],
  ['StatefulSet', resolveStatefulSetStatus],
  ['DaemonSet', resolveDaemonSetStatus],
  ['ReplicaSet', resolveReplicaSetStatus],
  ['Pod', resolvePodStatus],
  ['Job', resolveJobStatus],
  ['CronJob', resolveCronJobStatus],
  // Networking
  ['Service', resolveServiceStatus],
  ['Ingress', resolveIngressStatus],
  ['NetworkPolicy', resolveNetworkPolicyStatus],
  // Configuration
  ['HorizontalPodAutoscaler', resolveHPAStatus],
  // Storage
  ['PersistentVolumeClaim', resolvePVCStatus],
  ['PersistentVolume', resolvePVStatus],
  // Nodes
  ['Node', resolveNodeStatus],
  // Namespaces
  ['Namespace', resolveNamespaceStatus],
  // Strimzi
  ['Kafka', resolveStrimziStatus],
  ['KafkaTopic', resolveStrimziStatus],
  ['KafkaUser', resolveStrimziStatus],
  ['KafkaConnect', resolveStrimziStatus],
  ['KafkaBridge', resolveStrimziStatus],
  // Doppler
  ['DopplerSecret', resolveDopplerSecretStatus],
  // Prometheus Operator
  ['Alertmanager', resolveAlertmanagerStatus],
]);

export function resolveStatus(
  kind: string,
  raw: KubernetesObject,
): ResourceStatus {
  const resolver = resolvers.get(kind) ?? resolveGenericStatus;
  return resolver(raw);
}
