/**
 * AgentToolDispatcher (Spec 07 §5) — in-process dispatcher that resolves tool
 * calls against the State Store. All dispatches are pure reads; no async I/O.
 *
 * Secret redaction invariant (Spec 07 §5): any result containing kind Secret
 * has data/stringData replaced with [redacted] AT THIS BOUNDARY — no reveal
 * path through the agent exists.
 */

import type { StateStore } from '../store/state-store.js';
import type { ResourceObject, KubernetesObject } from '../core/types.js';
import { formatAge } from '../resources/age.js';

// ---------------------------------------------------------------------------
// Parameter types for each tool
// ---------------------------------------------------------------------------

export interface ListResourcesParams {
  kind: string;
  namespace?: string;
  status?: 'error' | 'warning' | 'healthy' | 'unknown';
  search?: string;
  limit?: number;
}

export interface GetResourceParams {
  kind: string;
  name: string;
  namespace?: string;
}

export interface GetEventsParams {
  namespace?: string;
  resourceKind?: string;
  resourceName?: string;
  type?: 'Warning' | 'Normal';
  limit?: number;
}

export interface CountResourcesParams {
  kind: string;
  namespace?: string;
  status?: 'error' | 'warning' | 'healthy' | 'unknown';
}

export interface GetPodDetailParams {
  name: string;
  namespace: string;
}

export interface FindErroringPodsParams {
  namespace?: string;
}

export interface GetDeploymentDetailParams {
  name: string;
  namespace: string;
}

export interface GetRolloutStatusParams {
  name: string;
  namespace: string;
}

export interface GetKafkaLagParams {
  topic?: string;
  consumerGroup?: string;
}

// ---------------------------------------------------------------------------
// Return types
// ---------------------------------------------------------------------------

export interface ListResourceRow {
  name: string;
  namespace: string;
  status: string;
  statusLabel: string;
  age: string;
}

export interface GetResourceResult {
  name: string;
  namespace: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  spec: Record<string, unknown>;
  status: Record<string, unknown>;
  age: string;
  events: EventSummary[];
}

export interface EventSummary {
  type: string;
  reason: string;
  message: string;
  age: string;
}

export interface GetEventsResult {
  type: string;
  reason: string;
  message: string;
  count: number;
  age: string;
  involvedObject: {
    kind: string;
    name: string;
    namespace: string;
  };
}

export interface CountResourcesResult {
  total: number;
  byStatus: Record<string, number>;
  byNamespace: Record<string, number>;
}

export interface ContainerInfo {
  name: string;
  image: string;
  state: string;
  reason?: string;
  restartCount: number;
  ready: boolean;
  cpuRequest?: string;
  cpuLimit?: string;
  memRequest?: string;
  memLimit?: string;
  lastTerminatedReason?: string;
  lastTerminatedExitCode?: number;
}

export interface InitContainerInfo {
  name: string;
  state: string;
  reason: string;
  restartCount: number;
}

export interface ConditionInfo {
  type: string;
  status: string;
  reason: string;
  message: string;
}

export interface PodDetailResult {
  name: string;
  namespace: string;
  phase: string;
  nodeName: string;
  podIP: string;
  qosClass: string;
  containers: ContainerInfo[];
  initContainers: InitContainerInfo[];
  conditions: ConditionInfo[];
  ownerKind: string;
  ownerName: string;
  topOwnerKind: string;
  topOwnerName: string;
  recentEvents: EventSummary[];
}

export interface ErroringPodResult {
  name: string;
  namespace: string;
  errorReason: string;
  restartCount: number;
  affectedContainer: string;
  lastExitCode?: number;
  lastEvent?: string;
  ownerDeployment?: string;
}

export interface ReplicaInfo {
  desired: number;
  ready: number;
  available: number;
  updatedReplicas: number;
}

export interface PodSummary {
  total: number;
  byStatus: Record<string, number>;
  erroring: { name: string; reason: string; restarts: number }[];
}

export interface HpaInfo {
  name: string;
  minReplicas: number;
  maxReplicas: number;
  currentReplicas: number;
  cpuTarget?: number;
  cpuCurrent?: number;
}

export interface DeploymentDetailResult {
  name: string;
  namespace: string;
  replicas: ReplicaInfo;
  strategy: string;
  image: string;
  conditions: ConditionInfo[];
  pods: PodSummary;
  hpa?: HpaInfo;
  recentEvents: EventSummary[];
}

export interface RolloutStatusResult {
  status: 'complete' | 'progressing' | 'stuck' | 'failed';
  message: string;
  updatedReplicas: number;
  totalReplicas: number;
  availableReplicas: number;
  progressDeadlineExceeded: boolean;
  estimatedTimeRemaining?: string;
}

export interface KafkaLagResult {
  topic: string;
  consumerGroup: string;
  totalLag: number;
  trend: 'climbing' | 'dropping' | 'stable';
  status: 'healthy' | 'warning' | 'critical';
  partitionCount: number;
}

// ---------------------------------------------------------------------------
// Redaction helpers
// ---------------------------------------------------------------------------

/** Redact Secret data/stringData from a raw KubernetesObject. */
function redactSecretRaw(raw: KubernetesObject): KubernetesObject {
  if (raw.kind !== 'Secret') {
    return raw;
  }
  const redacted: KubernetesObject = { ...raw };
  if (raw.data !== undefined) {
    const redactedData: Record<string, unknown> = {};
    for (const key of Object.keys(raw.data as Record<string, unknown>)) {
      redactedData[key] = '[redacted]';
    }
    redacted.data = redactedData;
  }
  if (raw.stringData !== undefined) {
    const redactedStringData: Record<string, unknown> = {};
    for (const key of Object.keys(raw.stringData as Record<string, unknown>)) {
      redactedStringData[key] = '[redacted]';
    }
    redacted.stringData = redactedStringData;
  }
  return redacted;
}

/** Redact a ResourceObject if it is a Secret. */
function redactResourceObject(obj: ResourceObject): ResourceObject {
  if (obj.kind !== 'Secret') {
    return obj;
  }
  return { ...obj, raw: redactSecretRaw(obj.raw) };
}

// ---------------------------------------------------------------------------
// Status color → status string mapping
// ---------------------------------------------------------------------------

function colorToStatus(color: string): string {
  switch (color) {
    case 'red':
      return 'error';
    case 'yellow':
      return 'warning';
    case 'green':
      return 'healthy';
    default:
      return 'unknown';
  }
}

function matchesStatus(
  obj: ResourceObject,
  status: string | undefined,
): boolean {
  if (status === undefined) {
    return true;
  }
  return colorToStatus(obj.status.color) === status;
}

function matchesSearch(
  obj: ResourceObject,
  search: string | undefined,
): boolean {
  if (search === undefined || search.length === 0) {
    return true;
  }
  return obj.name.includes(search);
}

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

function str(v: unknown): string {
  if (v === null || v === undefined) {
    return '';
  }
  if (typeof v === 'string') {
    return v;
  }
  if (typeof v === 'number' || typeof v === 'boolean') {
    return String(v);
  }
  return JSON.stringify(v);
}

function num(v: unknown): number {
  if (typeof v === 'number') {
    return v;
  }
  if (typeof v === 'string') {
    const n = parseInt(v, 10);
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

/** Shallow-copy top 2 levels of an object to limit size. */
function topTwoLevels(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      const inner: Record<string, unknown> = {};
      for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) {
        if (typeof v2 !== 'object' || v2 === null) {
          inner[k2] = v2;
        }
      }
      result[k] = inner;
    } else {
      result[k] = v;
    }
  }
  return result;
}

function ageFromTimestamp(ts: string, nowMs: number): string {
  if (ts.length === 0) {
    return '';
  }
  try {
    return formatAge(ts, nowMs);
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// AgentToolDispatcher
// ---------------------------------------------------------------------------

export class AgentToolDispatcher {
  private readonly nowMs: number;

  constructor(
    private readonly store: StateStore,
    private readonly contextName: string,
    nowMs: number,
  ) {
    this.nowMs = nowMs;
  }

  dispatch(toolName: string, params: Record<string, unknown>): unknown {
    switch (toolName) {
      case 'list_resources':
        return this.listResources(params as unknown as ListResourcesParams);
      case 'get_resource':
        return this.getResource(params as unknown as GetResourceParams);
      case 'get_events':
        return this.getEvents(params);
      case 'count_resources':
        return this.countResources(params as unknown as CountResourcesParams);
      case 'get_pod_detail':
        return this.getPodDetail(params as unknown as GetPodDetailParams);
      case 'find_erroring_pods':
        return this.findErroringPods(params);
      case 'get_deployment_detail':
        return this.getDeploymentDetail(
          params as unknown as GetDeploymentDetailParams,
        );
      case 'get_rollout_status':
        return this.getRolloutStatus(
          params as unknown as GetRolloutStatusParams,
        );
      case 'get_kafka_lag':
        return this.getKafkaLag(params);
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  // -------------------------------------------------------------------------
  // list_resources
  // -------------------------------------------------------------------------

  private listResources(params: ListResourcesParams): ListResourceRow[] {
    const DEFAULT_LIMIT = 20;
    const MAX_LIMIT = 50;
    const limit = Math.min(params.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

    let resources = this.store.list(
      this.contextName,
      params.kind,
      params.namespace,
    );

    resources = resources.filter(
      (obj) =>
        matchesStatus(obj, params.status) && matchesSearch(obj, params.search),
    );

    const slice = resources.slice(0, limit);

    return slice.map((obj) => {
      const safe = redactResourceObject(obj);
      return {
        name: safe.name,
        namespace: safe.namespace ?? '',
        status: colorToStatus(safe.status.color),
        statusLabel: safe.status.label,
        age: ageFromTimestamp(safe.creationTimestamp, this.nowMs),
      };
    });
  }

  // -------------------------------------------------------------------------
  // get_resource
  // -------------------------------------------------------------------------

  private getResource(params: GetResourceParams): GetResourceResult | null {
    const ns = params.namespace ?? null;
    const obj = this.store.get(this.contextName, params.kind, ns, params.name);
    if (obj === undefined) {
      return null;
    }
    const safe = redactResourceObject(obj);
    const raw = safe.raw;
    const spec = raw.spec !== undefined ? topTwoLevels(raw.spec) : {};
    const status = raw.status !== undefined ? topTwoLevels(raw.status) : {};

    // Collect last 5 events from Secret-safe raw events embedded in status
    const events: EventSummary[] = [];

    return {
      name: safe.name,
      namespace: safe.namespace ?? '',
      labels: safe.labels,
      annotations: safe.annotations,
      spec,
      status,
      age: ageFromTimestamp(safe.creationTimestamp, this.nowMs),
      events,
    };
  }

  // -------------------------------------------------------------------------
  // get_events
  // -------------------------------------------------------------------------

  private getEvents(params: GetEventsParams): GetEventsResult[] {
    const DEFAULT_LIMIT = 10;
    const eventType = params.type ?? 'Warning';
    const limit = params.limit ?? DEFAULT_LIMIT;

    // Events are stored as Event resources in the store
    let events = this.store.list(this.contextName, 'Event', params.namespace);

    // Filter by type
    events = events.filter((obj) => {
      const rawType = obj.raw.type;
      return typeof rawType === 'string' && rawType === eventType;
    });

    // Filter by involved object if specified
    if (
      params.resourceKind !== undefined ||
      params.resourceName !== undefined
    ) {
      events = events.filter((obj) => {
        const involvedObject = obj.raw.involvedObject as
          | Record<string, unknown>
          | undefined;
        if (involvedObject === undefined) {
          return false;
        }
        if (
          params.resourceKind !== undefined &&
          involvedObject.kind !== params.resourceKind
        ) {
          return false;
        }
        if (
          params.resourceName !== undefined &&
          involvedObject.name !== params.resourceName
        ) {
          return false;
        }
        return true;
      });
    }

    return events.slice(0, limit).map((obj) => {
      const involvedObject =
        (obj.raw.involvedObject as Record<string, unknown> | undefined) ?? {};
      return {
        type: str(obj.raw.type),
        reason: str(obj.raw.reason),
        message: str(obj.raw.message),
        count: num(obj.raw.count),
        age: ageFromTimestamp(
          str(obj.raw.lastTimestamp ?? obj.creationTimestamp),
          this.nowMs,
        ),
        involvedObject: {
          kind: str(involvedObject.kind),
          name: str(involvedObject.name),
          namespace: str(involvedObject.namespace ?? obj.namespace),
        },
      };
    });
  }

  // -------------------------------------------------------------------------
  // count_resources
  // -------------------------------------------------------------------------

  private countResources(params: CountResourcesParams): CountResourcesResult {
    const resources = this.store.list(
      this.contextName,
      params.kind,
      params.namespace,
    );

    const filtered = resources.filter((obj) =>
      matchesStatus(obj, params.status),
    );

    const byStatus: Record<string, number> = {};
    const byNamespace: Record<string, number> = {};

    for (const obj of filtered) {
      const s = colorToStatus(obj.status.color);
      byStatus[s] = (byStatus[s] ?? 0) + 1;
      const ns = obj.namespace ?? '~';
      byNamespace[ns] = (byNamespace[ns] ?? 0) + 1;
    }

    return {
      total: filtered.length,
      byStatus,
      byNamespace,
    };
  }

  // -------------------------------------------------------------------------
  // get_pod_detail
  // -------------------------------------------------------------------------

  private getPodDetail(params: GetPodDetailParams): PodDetailResult | null {
    const obj = this.store.get(
      this.contextName,
      'Pod',
      params.namespace,
      params.name,
    );
    if (obj === undefined) {
      return null;
    }

    const raw = obj.raw;
    const spec: Record<string, unknown> = raw.spec ?? {};
    const status: Record<string, unknown> = raw.status ?? {};

    // Containers
    const containerStatuses = Array.isArray(status.containerStatuses)
      ? (status.containerStatuses as Record<string, unknown>[])
      : [];
    const specContainers = Array.isArray(spec.containers)
      ? (spec.containers as Record<string, unknown>[])
      : [];

    const containers: ContainerInfo[] = specContainers.map((c) => {
      const cStatus = containerStatuses.find((cs) => cs.name === c.name) ?? {};
      const stateObj =
        (cStatus.state as Record<string, unknown> | undefined) ?? {};
      let state = 'unknown';
      let reason: string | undefined;
      if (stateObj.running !== undefined) {
        state = 'running';
      } else if (stateObj.waiting !== undefined) {
        state = 'waiting';
        const waitingObj = stateObj.waiting as Record<string, unknown>;
        if (typeof waitingObj.reason === 'string') {
          reason = waitingObj.reason;
        }
      } else if (stateObj.terminated !== undefined) {
        state = 'terminated';
        const termObj = stateObj.terminated as Record<string, unknown>;
        if (typeof termObj.reason === 'string') {
          reason = termObj.reason;
        }
      }

      const lastStateObj =
        (cStatus.lastState as Record<string, unknown> | undefined) ?? {};
      const lastTerminated = lastStateObj.terminated as
        | Record<string, unknown>
        | undefined;

      const resources =
        (c.resources as Record<string, unknown> | undefined) ?? {};
      const requests =
        (resources.requests as Record<string, unknown> | undefined) ?? {};
      const limits =
        (resources.limits as Record<string, unknown> | undefined) ?? {};

      const info: ContainerInfo = {
        name: str(c.name),
        image: str(c.image),
        state,
        restartCount: num(cStatus.restartCount),
        ready: cStatus.ready === true,
      };
      if (reason !== undefined) {
        info.reason = reason;
      }
      const cpuReq = str(requests.cpu);
      if (cpuReq.length > 0) {
        info.cpuRequest = cpuReq;
      }
      const cpuLim = str(limits.cpu);
      if (cpuLim.length > 0) {
        info.cpuLimit = cpuLim;
      }
      const memReq = str(requests.memory);
      if (memReq.length > 0) {
        info.memRequest = memReq;
      }
      const memLim = str(limits.memory);
      if (memLim.length > 0) {
        info.memLimit = memLim;
      }
      if (lastTerminated !== undefined) {
        const ltReason = str(lastTerminated.reason);
        if (ltReason.length > 0) {
          info.lastTerminatedReason = ltReason;
        }
        const ltExitCode = lastTerminated.exitCode;
        if (typeof ltExitCode === 'number') {
          info.lastTerminatedExitCode = ltExitCode;
        }
      }
      return info;
    });

    // Init containers
    const initContainerStatuses = Array.isArray(status.initContainerStatuses)
      ? (status.initContainerStatuses as Record<string, unknown>[])
      : [];
    const specInitContainers = Array.isArray(spec.initContainers)
      ? (spec.initContainers as Record<string, unknown>[])
      : [];

    const initContainers: InitContainerInfo[] = specInitContainers.map((c) => {
      const cStatus =
        initContainerStatuses.find((cs) => cs.name === c.name) ?? {};
      const stateObj =
        (cStatus.state as Record<string, unknown> | undefined) ?? {};
      let state = 'unknown';
      let reason = '';
      if (stateObj.running !== undefined) {
        state = 'running';
      } else if (stateObj.waiting !== undefined) {
        state = 'waiting';
        const waitingObj = stateObj.waiting as Record<string, unknown>;
        reason = str(waitingObj.reason);
      } else if (stateObj.terminated !== undefined) {
        state = 'terminated';
        const termObj = stateObj.terminated as Record<string, unknown>;
        reason = str(termObj.reason);
      }
      return {
        name: str(c.name),
        state,
        reason,
        restartCount: num(cStatus.restartCount),
      };
    });

    // Conditions
    const rawConditions = Array.isArray(status.conditions)
      ? (status.conditions as Record<string, unknown>[])
      : [];
    const conditions: ConditionInfo[] = rawConditions.map((c) => ({
      type: str(c.type),
      status: str(c.status),
      reason: str(c.reason),
      message: str(c.message),
    }));

    // Owner references
    const ownerRefs = raw.metadata?.ownerReferences ?? [];
    const controller = ownerRefs.find((r) => r.controller === true);
    const ownerKind = controller?.kind ?? '';
    const ownerName = controller?.name ?? '';

    // Top owner: find ReplicaSet's owner (Deployment) if applicable
    let topOwnerKind = ownerKind;
    let topOwnerName = ownerName;
    if (ownerKind === 'ReplicaSet' && ownerName.length > 0) {
      const rs = this.store.get(
        this.contextName,
        'ReplicaSet',
        params.namespace,
        ownerName,
      );
      if (rs !== undefined) {
        const rsOwnerRefs = rs.raw.metadata?.ownerReferences ?? [];
        const rsController = rsOwnerRefs.find((r) => r.controller === true);
        if (rsController !== undefined) {
          topOwnerKind = rsController.kind;
          topOwnerName = rsController.name;
        }
      }
    }

    return {
      name: obj.name,
      namespace: obj.namespace ?? '',
      phase: str(status.phase),
      nodeName: str(spec.nodeName),
      podIP: str(status.podIP),
      qosClass: str(status.qosClass),
      containers,
      initContainers,
      conditions,
      ownerKind,
      ownerName,
      topOwnerKind,
      topOwnerName,
      recentEvents: [],
    };
  }

  // -------------------------------------------------------------------------
  // find_erroring_pods
  // -------------------------------------------------------------------------

  private findErroringPods(
    params: FindErroringPodsParams,
  ): ErroringPodResult[] {
    const pods = this.store.list(this.contextName, 'Pod', params.namespace);

    const erroring = pods.filter((obj) => obj.status.color === 'red');

    return erroring.map((obj) => {
      const raw = obj.raw;
      const status: Record<string, unknown> = raw.status ?? {};
      const spec: Record<string, unknown> = raw.spec ?? {};

      const containerStatuses = Array.isArray(status.containerStatuses)
        ? (status.containerStatuses as Record<string, unknown>[])
        : [];

      // Find the first erroring container
      let errorReason = obj.status.label;
      let restartCount = 0;
      let affectedContainer = '';
      let lastExitCode: number | undefined;

      for (const cs of containerStatuses) {
        const stateObj =
          (cs.state as Record<string, unknown> | undefined) ?? {};
        const waitingObj = stateObj.waiting as
          | Record<string, unknown>
          | undefined;
        const terminatedObj = stateObj.terminated as
          | Record<string, unknown>
          | undefined;

        if (waitingObj !== undefined) {
          const reason = str(waitingObj.reason);
          if (
            reason === 'CrashLoopBackOff' ||
            reason === 'ImagePullBackOff' ||
            reason === 'OOMKilled' ||
            reason.length > 0
          ) {
            errorReason = reason;
            affectedContainer = str(cs.name);
            restartCount = num(cs.restartCount);
            break;
          }
        }
        if (terminatedObj !== undefined && terminatedObj.exitCode !== 0) {
          errorReason = str(terminatedObj.reason);
          if (errorReason.length === 0) {
            errorReason = 'Error';
          }
          affectedContainer = str(cs.name);
          restartCount = num(cs.restartCount);
          if (typeof terminatedObj.exitCode === 'number') {
            lastExitCode = terminatedObj.exitCode;
          }
          break;
        }
      }

      if (affectedContainer.length === 0 && containerStatuses.length > 0) {
        const first = containerStatuses[0];
        if (first !== undefined) {
          affectedContainer = str(first.name);
          restartCount = num(first.restartCount);
        }
      }

      // Owner references
      const ownerRefs = raw.metadata?.ownerReferences ?? [];
      const controller = ownerRefs.find((r) => r.controller === true);

      const result: ErroringPodResult = {
        name: obj.name,
        namespace: obj.namespace ?? '',
        errorReason,
        restartCount,
        affectedContainer,
      };

      if (lastExitCode !== undefined) {
        result.lastExitCode = lastExitCode;
      }

      // Check if owned by a deployment (via replicaset)
      if (controller?.kind === 'ReplicaSet') {
        const rsName = controller.name;
        const rs = this.store.get(
          this.contextName,
          'ReplicaSet',
          obj.namespace,
          rsName,
        );
        if (rs !== undefined) {
          const rsOwners = rs.raw.metadata?.ownerReferences ?? [];
          const rsController = rsOwners.find((r) => r.controller === true);
          if (rsController?.kind === 'Deployment') {
            result.ownerDeployment = rsController.name;
          }
        }
      } else if (controller?.kind === 'Deployment') {
        result.ownerDeployment = controller.name;
      }

      // Check for recent warning events
      const events = this.store.list(
        this.contextName,
        'Event',
        obj.namespace ?? undefined,
      );
      const podEvents = events.filter((e) => {
        const io = e.raw.involvedObject as Record<string, unknown> | undefined;
        return (
          io?.name === obj.name && io.kind === 'Pod' && e.raw.type === 'Warning'
        );
      });

      if (podEvents.length > 0) {
        const lastEvent = podEvents[podEvents.length - 1];
        if (lastEvent !== undefined) {
          result.lastEvent = str(lastEvent.raw.message);
        }
      }

      // Also check spec.containers for image names to detect ImagePullBackOff
      const specContainers = Array.isArray(spec.containers)
        ? (spec.containers as Record<string, unknown>[])
        : [];
      if (affectedContainer.length === 0 && specContainers.length > 0) {
        const first = specContainers[0];
        if (first !== undefined) {
          affectedContainer = str(first.name);
          result.affectedContainer = affectedContainer;
        }
      }

      return result;
    });
  }

  // -------------------------------------------------------------------------
  // get_deployment_detail
  // -------------------------------------------------------------------------

  private getDeploymentDetail(
    params: GetDeploymentDetailParams,
  ): DeploymentDetailResult | null {
    const obj = this.store.get(
      this.contextName,
      'Deployment',
      params.namespace,
      params.name,
    );
    if (obj === undefined) {
      return null;
    }

    const raw = obj.raw;
    const spec: Record<string, unknown> = raw.spec ?? {};
    const status: Record<string, unknown> = raw.status ?? {};

    const replicas: ReplicaInfo = {
      desired: num(spec.replicas ?? status.replicas),
      ready: num(status.readyReplicas),
      available: num(status.availableReplicas),
      updatedReplicas: num(status.updatedReplicas),
    };

    const strategyObj =
      (spec.strategy as Record<string, unknown> | undefined) ?? {};
    const strategy = str(strategyObj.type);

    // First container image
    const templateSpec =
      ((spec.template as Record<string, unknown> | undefined)?.spec as
        | Record<string, unknown>
        | undefined) ?? {};
    const specContainers = Array.isArray(templateSpec.containers)
      ? (templateSpec.containers as Record<string, unknown>[])
      : [];
    const firstContainer = specContainers[0] ?? {};
    const image = str(firstContainer.image);

    // Conditions
    const rawConditions = Array.isArray(status.conditions)
      ? (status.conditions as Record<string, unknown>[])
      : [];
    const conditions: ConditionInfo[] = rawConditions.map((c) => ({
      type: str(c.type),
      status: str(c.status),
      reason: str(c.reason),
      message: str(c.message),
    }));

    // Pods summary
    const allPods = this.store.list(this.contextName, 'Pod', params.namespace);

    // Match pods owned by this deployment (via replica set)
    const replicaSets = this.store.list(
      this.contextName,
      'ReplicaSet',
      params.namespace,
    );

    const deploymentReplicaSetNames = new Set<string>();
    for (const rs of replicaSets) {
      const rsOwners = rs.raw.metadata?.ownerReferences ?? [];
      const rsController = rsOwners.find((r) => r.controller === true);
      if (
        rsController?.kind === 'Deployment' &&
        rsController.name === params.name
      ) {
        deploymentReplicaSetNames.add(rs.name);
      }
    }

    const deploymentPods = allPods.filter((pod) => {
      const podOwners = pod.raw.metadata?.ownerReferences ?? [];
      const podController = podOwners.find((r) => r.controller === true);
      return (
        podController?.kind === 'ReplicaSet' &&
        deploymentReplicaSetNames.has(podController.name)
      );
    });

    const byStatus: Record<string, number> = {};
    for (const pod of deploymentPods) {
      const s = colorToStatus(pod.status.color);
      byStatus[s] = (byStatus[s] ?? 0) + 1;
    }

    const erroringPods = deploymentPods
      .filter((pod) => pod.status.color === 'red')
      .map((pod) => {
        const podStatus: Record<string, unknown> = pod.raw.status ?? {};
        const containerStatuses = Array.isArray(podStatus.containerStatuses)
          ? (podStatus.containerStatuses as Record<string, unknown>[])
          : [];
        let reason = pod.status.label;
        let restarts = 0;
        for (const cs of containerStatuses) {
          const stateObj =
            (cs.state as Record<string, unknown> | undefined) ?? {};
          const waitingObj = stateObj.waiting as
            | Record<string, unknown>
            | undefined;
          if (waitingObj?.reason !== undefined) {
            reason = str(waitingObj.reason);
            restarts = num(cs.restartCount);
            break;
          }
        }
        return { name: pod.name, reason, restarts };
      });

    const pods: PodSummary = {
      total: deploymentPods.length,
      byStatus,
      erroring: erroringPods,
    };

    // HPA lookup
    let hpa: HpaInfo | undefined;
    const hpas = this.store.list(
      this.contextName,
      'HorizontalPodAutoscaler',
      params.namespace,
    );
    let matchingHpa: ResourceObject | undefined;
    let matchedHpaSpec: Record<string, unknown> = {};
    for (const h of hpas) {
      const hpaSpec = h.raw.spec ?? {};
      const scaleTargetRef =
        (hpaSpec.scaleTargetRef as Record<string, unknown> | undefined) ?? {};
      if (
        scaleTargetRef.kind === 'Deployment' &&
        scaleTargetRef.name === params.name
      ) {
        matchingHpa = h;
        matchedHpaSpec = hpaSpec;
        break;
      }
    }

    if (matchingHpa !== undefined) {
      const hpaSpec = matchedHpaSpec;
      const hpaStatus = matchingHpa.raw.status ?? {};
      const metrics = Array.isArray(hpaSpec.metrics)
        ? (hpaSpec.metrics as Record<string, unknown>[])
        : [];
      let cpuTarget: number | undefined;
      for (const m of metrics) {
        if (m.type === 'Resource') {
          const resource =
            (m.resource as Record<string, unknown> | undefined) ?? {};
          if (resource.name === 'cpu') {
            const target =
              (resource.target as Record<string, unknown> | undefined) ?? {};
            if (typeof target.averageUtilization === 'number') {
              cpuTarget = target.averageUtilization;
            }
          }
        }
      }

      hpa = {
        name: matchingHpa.name,
        minReplicas: num(hpaSpec.minReplicas),
        maxReplicas: num(hpaSpec.maxReplicas),
        currentReplicas: num(hpaStatus.currentReplicas),
      };
      if (cpuTarget !== undefined) {
        hpa.cpuTarget = cpuTarget;
      }
    }

    const result: DeploymentDetailResult = {
      name: obj.name,
      namespace: obj.namespace ?? '',
      replicas,
      strategy,
      image,
      conditions,
      pods,
      recentEvents: [],
    };

    if (hpa !== undefined) {
      result.hpa = hpa;
    }

    return result;
  }

  // -------------------------------------------------------------------------
  // get_rollout_status
  // -------------------------------------------------------------------------

  private getRolloutStatus(
    params: GetRolloutStatusParams,
  ): RolloutStatusResult | null {
    const obj = this.store.get(
      this.contextName,
      'Deployment',
      params.namespace,
      params.name,
    );
    if (obj === undefined) {
      return null;
    }

    const raw = obj.raw;
    const spec: Record<string, unknown> = raw.spec ?? {};
    const status: Record<string, unknown> = raw.status ?? {};

    const desiredReplicas = num(spec.replicas ?? 1);
    const updatedReplicas = num(status.updatedReplicas);
    const availableReplicas = num(status.availableReplicas);
    const readyReplicas = num(status.readyReplicas);

    const conditions = Array.isArray(status.conditions)
      ? (status.conditions as Record<string, unknown>[])
      : [];

    const progressCond = conditions.find((c) => c.type === 'Progressing');
    const availableCond = conditions.find((c) => c.type === 'Available');

    const progressDeadlineExceeded =
      progressCond?.reason === 'ProgressDeadlineExceeded';

    let rolloutStatus: 'complete' | 'progressing' | 'stuck' | 'failed';
    let message: string;

    if (progressDeadlineExceeded) {
      rolloutStatus = 'failed';
      message = str(progressCond.message ?? 'Progress deadline exceeded');
    } else if (
      updatedReplicas === desiredReplicas &&
      availableReplicas === desiredReplicas &&
      readyReplicas === desiredReplicas
    ) {
      rolloutStatus = 'complete';
      message = 'Rollout complete';
    } else if (availableCond?.status === 'False') {
      rolloutStatus = 'stuck';
      message = str(availableCond.message ?? 'Deployment is unavailable');
    } else {
      rolloutStatus = 'progressing';
      message = str(progressCond?.message ?? 'Waiting for rollout to complete');
    }

    return {
      status: rolloutStatus,
      message,
      updatedReplicas,
      totalReplicas: desiredReplicas,
      availableReplicas,
      progressDeadlineExceeded,
    };
  }

  // -------------------------------------------------------------------------
  // get_kafka_lag
  // -------------------------------------------------------------------------

  private getKafkaLag(params: GetKafkaLagParams): KafkaLagResult[] {
    // KafkaTopic resources carry lag info in their status (if Kafka Exporter is present)
    // We read from stored KafkaTopic objects and extract consumer group lag
    const topics = this.store.list(this.contextName, 'KafkaTopic');

    const filtered = topics.filter((t) => {
      if (params.topic !== undefined && t.name !== params.topic) {
        return false;
      }
      return true;
    });

    const results: KafkaLagResult[] = [];

    for (const topic of filtered) {
      const topicStatus = topic.raw.status ?? {};
      const consumerGroups = Array.isArray(topicStatus.consumerGroups)
        ? (topicStatus.consumerGroups as Record<string, unknown>[])
        : [];

      for (const cg of consumerGroups) {
        const groupName = str(cg.name);
        if (
          params.consumerGroup !== undefined &&
          groupName !== params.consumerGroup
        ) {
          continue;
        }
        const totalLag = num(cg.totalLag);
        const trend = (() => {
          const t = str(cg.trend);
          if (t === 'climbing' || t === 'dropping' || t === 'stable') {
            return t;
          }
          return 'stable' as const;
        })();
        const lagStatus = (() => {
          const WARNING_THRESHOLD = 1000;
          const CRITICAL_THRESHOLD = 10000;
          if (totalLag >= CRITICAL_THRESHOLD) {
            return 'critical' as const;
          }
          if (totalLag >= WARNING_THRESHOLD) {
            return 'warning' as const;
          }
          return 'healthy' as const;
        })();
        results.push({
          topic: topic.name,
          consumerGroup: groupName,
          totalLag,
          trend,
          status: lagStatus,
          partitionCount: num(cg.partitionCount),
        });
      }
    }

    return results;
  }
}
