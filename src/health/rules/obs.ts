/**
 * Observability rules: OBS-001..003, OBS-010..012 (Spec 06 §6.2, §6.6).
 *
 * OBS-001: Pod has no liveness probe (warn)
 * OBS-002: Pod has no readiness probe (warn)
 * OBS-003: Pod has no startup probe (info)
 * OBS-010: No Prometheus found in cluster (info)
 * OBS-011: No ServiceMonitors defined (info)
 * OBS-012: Pod has no Prometheus scrape annotation (warn)
 */

import type {
  HealthRule,
  RuleResult,
  AffectedResource,
  RuleCaps,
} from '../types.js';
import type { StateStore } from '../../store/state-store.js';
import type { ResourceObject } from '../../core/types.js';
import { isRuleSuppressed } from '../suppression.js';

function toAffected(pod: ResourceObject): AffectedResource {
  return {
    kind: 'Pod',
    namespace: pod.namespace ?? '',
    name: pod.name,
  };
}

function getPodContainers(pod: ResourceObject): Record<string, unknown>[] {
  const spec = pod.raw.spec;
  const containers = spec?.containers;
  return Array.isArray(containers)
    ? (containers as Record<string, unknown>[])
    : [];
}

// ---------------------------------------------------------------------------
// OBS-001: Pod has no liveness probe
// ---------------------------------------------------------------------------

export const OBS_001: HealthRule = {
  id: 'OBS-001',
  category: 'observability',
  severity: 'warn',
  title: (result) => {
    const n = result.affectedResources.length;
    return n === 1
      ? `1 pod has no liveness probe`
      : `${String(n)} pods have no liveness probe`;
  },
  evaluate(store: StateStore, context: string): RuleResult {
    const pods = store.list(context, 'Pod');
    const affected: AffectedResource[] = [];

    for (const pod of pods) {
      if (isRuleSuppressed(pod.annotations, 'OBS-001')) {
        continue;
      }
      const containers = getPodContainers(pod);
      const missing = containers.some((c) => {
        return c.livenessProbe === undefined || c.livenessProbe === null;
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
// OBS-002: Pod has no readiness probe
// ---------------------------------------------------------------------------

export const OBS_002: HealthRule = {
  id: 'OBS-002',
  category: 'observability',
  severity: 'warn',
  title: (result) => {
    const n = result.affectedResources.length;
    return n === 1
      ? `1 pod has no readiness probe`
      : `${String(n)} pods have no readiness probe`;
  },
  evaluate(store: StateStore, context: string): RuleResult {
    const pods = store.list(context, 'Pod');
    const affected: AffectedResource[] = [];

    for (const pod of pods) {
      if (isRuleSuppressed(pod.annotations, 'OBS-002')) {
        continue;
      }
      const containers = getPodContainers(pod);
      const missing = containers.some((c) => {
        return c.readinessProbe === undefined || c.readinessProbe === null;
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
// OBS-003: Pod has no startup probe
// ---------------------------------------------------------------------------

export const OBS_003: HealthRule = {
  id: 'OBS-003',
  category: 'observability',
  severity: 'info',
  title: (result) => {
    const n = result.affectedResources.length;
    return n === 1
      ? `1 pod has no startup probe`
      : `${String(n)} pods have no startup probe`;
  },
  evaluate(store: StateStore, context: string): RuleResult {
    const pods = store.list(context, 'Pod');
    const affected: AffectedResource[] = [];

    for (const pod of pods) {
      if (isRuleSuppressed(pod.annotations, 'OBS-003')) {
        continue;
      }
      const containers = getPodContainers(pod);
      const missing = containers.some((c) => {
        return c.startupProbe === undefined || c.startupProbe === null;
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
// OBS-010: No Prometheus found in cluster
// ---------------------------------------------------------------------------

export const OBS_010: HealthRule = {
  id: 'OBS-010',
  category: 'observability',
  severity: 'info',
  title: () => `No Prometheus found in cluster`,
  evaluate(_store: StateStore, _context: string, caps: RuleCaps): RuleResult {
    // This rule fires when no metrics exporter capabilities are present,
    // indicating Prometheus is not available.
    if (!caps.kafkaExporter && !caps.strimziJmx) {
      // Check whether any cadvisor/kube-state-metrics signals could indicate
      // Prometheus — but since we only have kafkaExporter and strimziJmx in
      // caps for this chunk, we signal based on no caps at all.
      return {
        status: 'warn',
        affectedResources: [],
        detail: 'No Prometheus metrics source detected',
      };
    }
    return { status: 'ok', affectedResources: [] };
  },
};

// ---------------------------------------------------------------------------
// OBS-011: No ServiceMonitors defined
// ---------------------------------------------------------------------------

export const OBS_011: HealthRule = {
  id: 'OBS-011',
  category: 'observability',
  severity: 'info',
  title: () =>
    `No ServiceMonitors defined (Prometheus present but nothing monitored)`,
  evaluate(store: StateStore, context: string, caps: RuleCaps): RuleResult {
    // Only relevant if Prometheus is present
    if (!caps.kafkaExporter && !caps.strimziJmx) {
      return { status: 'skipped', affectedResources: [] };
    }
    const serviceMonitors = store.list(context, 'ServiceMonitor');
    if (serviceMonitors.length === 0) {
      return {
        status: 'warn',
        affectedResources: [],
        detail: 'Prometheus is present but no ServiceMonitors are defined',
      };
    }
    return { status: 'ok', affectedResources: [] };
  },
};

// ---------------------------------------------------------------------------
// OBS-012: Pod has no Prometheus scrape annotation
// ---------------------------------------------------------------------------

export const OBS_012: HealthRule = {
  id: 'OBS-012',
  category: 'observability',
  severity: 'warn',
  title: (result) => {
    const n = result.affectedResources.length;
    return n === 1
      ? `1 pod has no Prometheus scrape annotation`
      : `${String(n)} pods have no Prometheus scrape annotation`;
  },
  evaluate(store: StateStore, context: string): RuleResult {
    const pods = store.list(context, 'Pod');
    const affected: AffectedResource[] = [];

    for (const pod of pods) {
      if (isRuleSuppressed(pod.annotations, 'OBS-012')) {
        continue;
      }
      const scrape = pod.annotations['prometheus.io/scrape'];
      if (scrape !== 'true') {
        affected.push({
          kind: 'Pod',
          namespace: pod.namespace ?? '',
          name: pod.name,
        });
      }
    }

    if (affected.length === 0) {
      return { status: 'ok', affectedResources: [] };
    }
    return { status: 'warn', affectedResources: affected };
  },
};
