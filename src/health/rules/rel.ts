/**
 * Reliability rules: REL-001..004 (Spec 06 §6.2).
 *
 * REL-001: Deployment has only 1 replica (warn)
 * REL-002: Deployment has no PodDisruptionBudget (warn)
 * REL-003: StatefulSet has only 1 replica (warn)
 * REL-004: CronJob has no concurrencyPolicy set (info)
 */

import type { HealthRule, RuleResult, AffectedResource } from '../types.js';
import type { StateStore } from '../../store/state-store.js';
import type { ResourceObject } from '../../core/types.js';
import { isRuleSuppressed } from '../suppression.js';

function toAffected(obj: ResourceObject): AffectedResource {
  return {
    kind: obj.kind,
    namespace: obj.namespace ?? '',
    name: obj.name,
  };
}

// ---------------------------------------------------------------------------
// REL-001: Deployment has only 1 replica
// ---------------------------------------------------------------------------

export const REL_001: HealthRule = {
  id: 'REL-001',
  category: 'reliability',
  severity: 'warn',
  title: (result) => {
    const n = result.affectedResources.length;
    return n === 1
      ? `1 deployment has only 1 replica (no redundancy)`
      : `${String(n)} deployments have only 1 replica`;
  },
  evaluate(store: StateStore, context: string): RuleResult {
    const deployments = store.list(context, 'Deployment');
    const affected: AffectedResource[] = [];

    for (const dep of deployments) {
      if (isRuleSuppressed(dep.annotations, 'REL-001')) {
        continue;
      }
      const spec = dep.raw.spec;
      const replicas = spec?.replicas;
      // Default replicas is 1 when not set
      const count = typeof replicas === 'number' ? replicas : 1;
      if (count <= 1) {
        affected.push(toAffected(dep));
      }
    }

    if (affected.length === 0) {
      return { status: 'ok', affectedResources: [] };
    }
    return { status: 'warn', affectedResources: affected };
  },
};

// ---------------------------------------------------------------------------
// REL-002: Deployment has no PodDisruptionBudget
// ---------------------------------------------------------------------------

export const REL_002: HealthRule = {
  id: 'REL-002',
  category: 'reliability',
  severity: 'warn',
  title: (result) => {
    const n = result.affectedResources.length;
    return n === 1
      ? `1 deployment has no PodDisruptionBudget`
      : `${String(n)} deployments have no PodDisruptionBudget`;
  },
  evaluate(store: StateStore, context: string): RuleResult {
    const deployments = store.list(context, 'Deployment');
    const pdbs = store.list(context, 'PodDisruptionBudget');
    const affected: AffectedResource[] = [];

    // Build set of namespaces+selectors covered by PDBs
    // A PDB covers a deployment if they share a namespace and the PDB selector
    // matches the deployment's pod template labels.
    const pdbsByNamespace = new Map<string, ResourceObject[]>();
    for (const pdb of pdbs) {
      const ns = pdb.namespace ?? '';
      const existing = pdbsByNamespace.get(ns) ?? [];
      existing.push(pdb);
      pdbsByNamespace.set(ns, existing);
    }

    for (const dep of deployments) {
      if (isRuleSuppressed(dep.annotations, 'REL-002')) {
        continue;
      }
      const ns = dep.namespace ?? '';
      const namespacePdbs = pdbsByNamespace.get(ns) ?? [];

      const spec = dep.raw.spec;
      const template = (spec?.template ?? {}) as Record<string, unknown>;
      const templateMeta = (template.metadata ?? {}) as Record<string, unknown>;
      const podLabels = (templateMeta.labels ?? {}) as Record<string, string>;

      const covered = namespacePdbs.some((pdb) => {
        const pdbSpec = pdb.raw.spec;
        const selector = (pdbSpec?.selector ?? {}) as Record<string, unknown>;
        const matchLabels = (selector.matchLabels ?? {}) as Record<
          string,
          string
        >;
        // PDB covers deployment if all PDB selector labels exist in pod template
        return Object.entries(matchLabels).every(
          ([k, v]) => podLabels[k] === v,
        );
      });

      if (!covered) {
        affected.push(toAffected(dep));
      }
    }

    if (affected.length === 0) {
      return { status: 'ok', affectedResources: [] };
    }
    return { status: 'warn', affectedResources: affected };
  },
};

// ---------------------------------------------------------------------------
// REL-003: StatefulSet has only 1 replica
// ---------------------------------------------------------------------------

export const REL_003: HealthRule = {
  id: 'REL-003',
  category: 'reliability',
  severity: 'warn',
  title: (result) => {
    const n = result.affectedResources.length;
    return n === 1
      ? `1 StatefulSet has only 1 replica`
      : `${String(n)} StatefulSets have only 1 replica`;
  },
  evaluate(store: StateStore, context: string): RuleResult {
    const statefulSets = store.list(context, 'StatefulSet');
    const affected: AffectedResource[] = [];

    for (const ss of statefulSets) {
      if (isRuleSuppressed(ss.annotations, 'REL-003')) {
        continue;
      }
      const spec = ss.raw.spec;
      const replicas = spec?.replicas;
      const count = typeof replicas === 'number' ? replicas : 1;
      if (count <= 1) {
        affected.push(toAffected(ss));
      }
    }

    if (affected.length === 0) {
      return { status: 'ok', affectedResources: [] };
    }
    return { status: 'warn', affectedResources: affected };
  },
};

// ---------------------------------------------------------------------------
// REL-004: CronJob has no concurrencyPolicy set
// ---------------------------------------------------------------------------

export const REL_004: HealthRule = {
  id: 'REL-004',
  category: 'reliability',
  severity: 'info',
  title: (result) => {
    const n = result.affectedResources.length;
    return n === 1
      ? `1 CronJob has no concurrencyPolicy set`
      : `${String(n)} CronJobs have no concurrencyPolicy set`;
  },
  evaluate(store: StateStore, context: string): RuleResult {
    const cronJobs = store.list(context, 'CronJob');
    const affected: AffectedResource[] = [];

    for (const cj of cronJobs) {
      if (isRuleSuppressed(cj.annotations, 'REL-004')) {
        continue;
      }
      const spec = cj.raw.spec;
      const policy = spec?.concurrencyPolicy;
      if (typeof policy !== 'string' || policy.trim().length === 0) {
        affected.push(toAffected(cj));
      }
    }

    if (affected.length === 0) {
      return { status: 'ok', affectedResources: [] };
    }
    return { status: 'warn', affectedResources: affected };
  },
};
