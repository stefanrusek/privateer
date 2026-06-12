/**
 * Resource rules: RES-001..005 (Spec 06 §6.2).
 *
 * RES-001: Pod has no CPU limit set (error)
 * RES-002: Pod has no memory limit set (error)
 * RES-003: Pod has no CPU request set (warn)
 * RES-004: Pod has no memory request set (warn)
 * RES-005: CPU limit is more than 4x CPU request (warn)
 */

import type { HealthRule, RuleResult, AffectedResource } from '../types.js';
import type { StateStore } from '../../store/state-store.js';
import type { ResourceObject } from '../../core/types.js';
import { isRuleSuppressed } from '../suppression.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface Resources {
  cpuLimit: string | undefined;
  cpuRequest: string | undefined;
  memLimit: string | undefined;
  memRequest: string | undefined;
}

function getContainerResources(container: Record<string, unknown>): Resources {
  const res = (container.resources ?? {}) as Record<string, unknown>;
  const limits = (res.limits ?? {}) as Record<string, unknown>;
  const requests = (res.requests ?? {}) as Record<string, unknown>;
  return {
    cpuLimit: typeof limits.cpu === 'string' ? limits.cpu : undefined,
    cpuRequest: typeof requests.cpu === 'string' ? requests.cpu : undefined,
    memLimit: typeof limits.memory === 'string' ? limits.memory : undefined,
    memRequest:
      typeof requests.memory === 'string' ? requests.memory : undefined,
  };
}

function getPodContainers(pod: ResourceObject): Record<string, unknown>[] {
  const spec = pod.raw.spec;
  const containers = spec?.containers;
  return Array.isArray(containers)
    ? (containers as Record<string, unknown>[])
    : [];
}

function toAffected(pod: ResourceObject): AffectedResource {
  return {
    kind: 'Pod',
    namespace: pod.namespace ?? '',
    name: pod.name,
  };
}

/**
 * Parse a CPU value string to millicores.
 * "500m" → 500, "1" → 1000, "2.5" → 2500.
 * Returns null if unparseable.
 */
function parseCpuMillicores(val: string): number | null {
  if (val.endsWith('m')) {
    const n = Number(val.slice(0, -1));
    return isNaN(n) ? null : n;
  }
  const n = Number(val);
  return isNaN(n) ? null : Math.round(n * 1000);
}

// ---------------------------------------------------------------------------
// RES-001: Pod has no CPU limit set
// ---------------------------------------------------------------------------

export const RES_001: HealthRule = {
  id: 'RES-001',
  category: 'resources',
  severity: 'error',
  title: (result) => {
    const n = result.affectedResources.length;
    return n === 1
      ? `1 pod has no CPU limit set`
      : `${String(n)} pods have no CPU limit set`;
  },
  evaluate(store: StateStore, context: string): RuleResult {
    const pods = store.list(context, 'Pod');
    const affected: AffectedResource[] = [];

    for (const pod of pods) {
      if (isRuleSuppressed(pod.annotations, 'RES-001')) {
        continue;
      }
      const containers = getPodContainers(pod);
      const missing = containers.some((c) => {
        const r = getContainerResources(c);
        return r.cpuLimit === undefined;
      });
      if (missing) {
        affected.push(toAffected(pod));
      }
    }

    if (affected.length === 0) {
      return { status: 'ok', affectedResources: [] };
    }
    return { status: 'error', affectedResources: affected };
  },
};

// ---------------------------------------------------------------------------
// RES-002: Pod has no memory limit set
// ---------------------------------------------------------------------------

export const RES_002: HealthRule = {
  id: 'RES-002',
  category: 'resources',
  severity: 'error',
  title: (result) => {
    const n = result.affectedResources.length;
    return n === 1
      ? `1 pod has no memory limit set`
      : `${String(n)} pods have no memory limit set`;
  },
  evaluate(store: StateStore, context: string): RuleResult {
    const pods = store.list(context, 'Pod');
    const affected: AffectedResource[] = [];

    for (const pod of pods) {
      if (isRuleSuppressed(pod.annotations, 'RES-002')) {
        continue;
      }
      const containers = getPodContainers(pod);
      const missing = containers.some((c) => {
        const r = getContainerResources(c);
        return r.memLimit === undefined;
      });
      if (missing) {
        affected.push(toAffected(pod));
      }
    }

    if (affected.length === 0) {
      return { status: 'ok', affectedResources: [] };
    }
    return { status: 'error', affectedResources: affected };
  },
};

// ---------------------------------------------------------------------------
// RES-003: Pod has no CPU request set
// ---------------------------------------------------------------------------

export const RES_003: HealthRule = {
  id: 'RES-003',
  category: 'resources',
  severity: 'warn',
  title: (result) => {
    const n = result.affectedResources.length;
    return n === 1
      ? `1 pod has no CPU request set`
      : `${String(n)} pods have no CPU request set`;
  },
  evaluate(store: StateStore, context: string): RuleResult {
    const pods = store.list(context, 'Pod');
    const affected: AffectedResource[] = [];

    for (const pod of pods) {
      if (isRuleSuppressed(pod.annotations, 'RES-003')) {
        continue;
      }
      const containers = getPodContainers(pod);
      const missing = containers.some((c) => {
        const r = getContainerResources(c);
        return r.cpuRequest === undefined;
      });
      if (missing) {
        affected.push(toAffected(pod));
      }
    }

    if (affected.length === 0) {
      return { status: 'ok', affectedResources: [] };
    }
    return { status: 'warn', affectedResources: affected };
  },
};

// ---------------------------------------------------------------------------
// RES-004: Pod has no memory request set
// ---------------------------------------------------------------------------

export const RES_004: HealthRule = {
  id: 'RES-004',
  category: 'resources',
  severity: 'warn',
  title: (result) => {
    const n = result.affectedResources.length;
    return n === 1
      ? `1 pod has no memory request set`
      : `${String(n)} pods have no memory request set`;
  },
  evaluate(store: StateStore, context: string): RuleResult {
    const pods = store.list(context, 'Pod');
    const affected: AffectedResource[] = [];

    for (const pod of pods) {
      if (isRuleSuppressed(pod.annotations, 'RES-004')) {
        continue;
      }
      const containers = getPodContainers(pod);
      const missing = containers.some((c) => {
        const r = getContainerResources(c);
        return r.memRequest === undefined;
      });
      if (missing) {
        affected.push(toAffected(pod));
      }
    }

    if (affected.length === 0) {
      return { status: 'ok', affectedResources: [] };
    }
    return { status: 'warn', affectedResources: affected };
  },
};

// ---------------------------------------------------------------------------
// RES-005: CPU limit is more than 4x CPU request (noisy neighbor risk)
// ---------------------------------------------------------------------------

export const RES_005: HealthRule = {
  id: 'RES-005',
  category: 'resources',
  severity: 'warn',
  title: (result) => {
    const n = result.affectedResources.length;
    return n === 1
      ? `1 pod has CPU limit more than 4x its CPU request`
      : `${String(n)} pods have CPU limit more than 4x CPU request`;
  },
  evaluate(store: StateStore, context: string): RuleResult {
    const pods = store.list(context, 'Pod');
    const affected: AffectedResource[] = [];

    for (const pod of pods) {
      if (isRuleSuppressed(pod.annotations, 'RES-005')) {
        continue;
      }
      const containers = getPodContainers(pod);
      const offending = containers.some((c) => {
        const r = getContainerResources(c);
        if (r.cpuLimit === undefined || r.cpuRequest === undefined) {
          return false;
        }
        const limitMc = parseCpuMillicores(r.cpuLimit);
        const requestMc = parseCpuMillicores(r.cpuRequest);
        if (limitMc === null || requestMc === null || requestMc === 0) {
          return false;
        }
        return limitMc > requestMc * 4;
      });
      if (offending) {
        affected.push(toAffected(pod));
      }
    }

    if (affected.length === 0) {
      return { status: 'ok', affectedResources: [] };
    }
    return { status: 'warn', affectedResources: affected };
  },
};
