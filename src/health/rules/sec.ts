/**
 * Security rules: SEC-001..007 (Spec 06 §6.3).
 *
 * SEC-001: Pod runs as root (error)
 * SEC-002: Pod has allowPrivilegeEscalation: true (warn)
 * SEC-003: Namespace has no NetworkPolicy (warn)
 * SEC-004: ServiceAccount has automountServiceAccountToken: true with no usage (warn)
 * SEC-005: Opaque Secret with no managing operator (error) — context-aware
 * SEC-006: ClusterRoleBinding grants cluster-admin to non-system subject (warn)
 * SEC-007: Pod mounts a Secret as env var (info)
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

function toAffected(obj: ResourceObject): AffectedResource {
  return {
    kind: obj.kind,
    namespace: obj.namespace ?? '',
    name: obj.name,
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
// SEC-001: Pod runs as root
// ---------------------------------------------------------------------------

export const SEC_001: HealthRule = {
  id: 'SEC-001',
  category: 'security',
  severity: 'error',
  title: (result) => {
    const n = result.affectedResources.length;
    return n === 1 ? `1 pod runs as root` : `${String(n)} pods run as root`;
  },
  evaluate(store: StateStore, context: string): RuleResult {
    const pods = store.list(context, 'Pod');
    const affected: AffectedResource[] = [];

    for (const pod of pods) {
      if (isRuleSuppressed(pod.annotations, 'SEC-001')) {
        continue;
      }
      const spec = pod.raw.spec;
      const secCtx = (spec?.securityContext ?? {}) as Record<string, unknown>;

      // Pod-level: runAsNonRoot: false or runAsUser: 0
      const podRunsAsRoot =
        secCtx.runAsNonRoot === false || secCtx.runAsUser === 0;

      // Container-level check
      const containers = getPodContainers(pod);
      const containerRunsAsRoot = containers.some((c) => {
        const csc = (c.securityContext ?? {}) as Record<string, unknown>;
        return csc.runAsNonRoot === false || csc.runAsUser === 0;
      });

      // Also flag if neither pod nor container explicitly sets runAsNonRoot: true
      const noNonRootGuard =
        secCtx.runAsNonRoot !== true &&
        !containers.some(
          (c) =>
            ((c.securityContext ?? {}) as Record<string, unknown>)
              .runAsNonRoot === true,
        );

      if (podRunsAsRoot || containerRunsAsRoot || noNonRootGuard) {
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
// SEC-002: Pod has allowPrivilegeEscalation: true
// ---------------------------------------------------------------------------

export const SEC_002: HealthRule = {
  id: 'SEC-002',
  category: 'security',
  severity: 'warn',
  title: (result) => {
    const n = result.affectedResources.length;
    return n === 1
      ? `1 pod has allowPrivilegeEscalation: true`
      : `${String(n)} pods have allowPrivilegeEscalation: true`;
  },
  evaluate(store: StateStore, context: string): RuleResult {
    const pods = store.list(context, 'Pod');
    const affected: AffectedResource[] = [];

    for (const pod of pods) {
      if (isRuleSuppressed(pod.annotations, 'SEC-002')) {
        continue;
      }
      const containers = getPodContainers(pod);
      const offending = containers.some((c) => {
        const csc = (c.securityContext ?? {}) as Record<string, unknown>;
        return csc.allowPrivilegeEscalation === true;
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

// ---------------------------------------------------------------------------
// SEC-003: Namespace has no NetworkPolicy
// ---------------------------------------------------------------------------

export const SEC_003: HealthRule = {
  id: 'SEC-003',
  category: 'security',
  severity: 'warn',
  title: (result) => {
    const n = result.affectedResources.length;
    return n === 1
      ? `1 namespace has no NetworkPolicy (traffic unrestricted)`
      : `${String(n)} namespaces have no NetworkPolicy`;
  },
  evaluate(store: StateStore, context: string): RuleResult {
    const namespaces = store.list(context, 'Namespace');
    const networkPolicies = store.list(context, 'NetworkPolicy');

    // Build set of namespaces that have at least one NetworkPolicy
    const coveredNamespaces = new Set<string>();
    for (const np of networkPolicies) {
      if (np.namespace !== null) {
        coveredNamespaces.add(np.namespace);
      }
    }

    const affected: AffectedResource[] = [];
    for (const ns of namespaces) {
      if (isRuleSuppressed(ns.annotations, 'SEC-003')) {
        continue;
      }
      if (!coveredNamespaces.has(ns.name)) {
        affected.push({
          kind: 'Namespace',
          namespace: '',
          name: ns.name,
        });
      }
    }

    if (affected.length === 0) {
      return { status: 'ok', affectedResources: [] };
    }
    return { status: 'warn', affectedResources: affected };
  },
};

// ---------------------------------------------------------------------------
// SEC-004: ServiceAccount has automountServiceAccountToken: true with no usage
// ---------------------------------------------------------------------------

export const SEC_004: HealthRule = {
  id: 'SEC-004',
  category: 'security',
  severity: 'warn',
  title: (result) => {
    const n = result.affectedResources.length;
    return n === 1
      ? `1 ServiceAccount has automountServiceAccountToken: true with no usage`
      : `${String(n)} ServiceAccounts have automountServiceAccountToken: true with no usage`;
  },
  evaluate(store: StateStore, context: string): RuleResult {
    const serviceAccounts = store.list(context, 'ServiceAccount');
    const pods = store.list(context, 'Pod');
    const affected: AffectedResource[] = [];

    // Build set of service account names used by pods
    const usedSAs = new Set<string>();
    for (const pod of pods) {
      const spec = pod.raw.spec;
      const saName = spec?.serviceAccountName;
      if (typeof saName === 'string' && saName.length > 0) {
        usedSAs.add(`${pod.namespace ?? ''}/${saName}`);
      }
    }

    for (const sa of serviceAccounts) {
      if (isRuleSuppressed(sa.annotations, 'SEC-004')) {
        continue;
      }
      // automountServiceAccountToken defaults to true if not set
      const automount = (sa.raw as Record<string, unknown>)
        .automountServiceAccountToken;
      if (automount !== undefined && automount !== true) {
        continue;
      }
      const key = `${sa.namespace ?? ''}/${sa.name}`;
      if (!usedSAs.has(key)) {
        affected.push(toAffected(sa));
      }
    }

    if (affected.length === 0) {
      return { status: 'ok', affectedResources: [] };
    }
    return { status: 'warn', affectedResources: affected };
  },
};

// ---------------------------------------------------------------------------
// SEC-005: Opaque Secret with no managing operator
// Context-aware: only fires when a secrets operator is detected.
// Excludes: kubernetes.io/*, helm.sh/* types, secrets with ownerReferences,
// operator-managed outputs (DopplerSecret targets).
// ---------------------------------------------------------------------------

const EXCLUDED_SECRET_TYPE_PREFIXES = ['kubernetes.io/', 'helm.sh/'];

/** Known operator-managed Secret names (from DopplerSecret/ExternalSecret spec.secretName) */
function getOperatorManagedSecretNames(
  store: StateStore,
  context: string,
): Set<string> {
  const managed = new Set<string>();

  // DopplerSecret managed outputs
  const dopplerSecrets = store.list(context, 'DopplerSecret');
  for (const ds of dopplerSecrets) {
    const spec = ds.raw.spec;
    const secretName = spec?.secretName;
    if (typeof secretName === 'string') {
      const ns =
        typeof spec?.secretNamespace === 'string'
          ? spec.secretNamespace
          : (ds.namespace ?? '');
      managed.add(`${ns}/${secretName}`);
    }
  }

  // ExternalSecret managed outputs
  const externalSecrets = store.list(context, 'ExternalSecret');
  for (const es of externalSecrets) {
    const spec = es.raw.spec;
    const target = (spec?.target ?? {}) as Record<string, unknown>;
    const secretName = target.name ?? es.name;
    if (typeof secretName === 'string') {
      managed.add(`${es.namespace ?? ''}/${secretName}`);
    }
  }

  return managed;
}

export const SEC_005: HealthRule = {
  id: 'SEC-005',
  category: 'security',
  severity: 'error',
  title: (result) => {
    if (result.status === 'suppressed') {
      return `Unmanaged Opaque Secrets check suppressed (no secrets operator detected)`;
    }
    const n = result.affectedResources.length;
    return n === 1
      ? `1 Opaque Secret is not managed by a secrets operator`
      : `${String(n)} Opaque Secrets are not managed by a secrets operator`;
  },
  evaluate(store: StateStore, context: string, caps: RuleCaps): RuleResult {
    // Rule is suppressed unless a secrets operator is detected
    if (!caps.secretsOperatorPresent) {
      return {
        status: 'suppressed',
        affectedResources: [],
        detail: 'No secrets operator detected',
      };
    }

    const secrets = store.list(context, 'Secret');
    const managed = getOperatorManagedSecretNames(store, context);
    const affected: AffectedResource[] = [];

    for (const secret of secrets) {
      if (isRuleSuppressed(secret.annotations, 'SEC-005')) {
        continue;
      }

      const secretType = (secret.raw as Record<string, unknown>).type;

      // Exclude kubernetes.io/* and helm.sh/* types (operator-managed)
      if (typeof secretType === 'string') {
        const excluded = EXCLUDED_SECRET_TYPE_PREFIXES.some((prefix) =>
          secretType.startsWith(prefix),
        );
        if (excluded) {
          continue;
        }
      }

      // Only check type: Opaque (or untyped secrets)
      if (secretType !== 'Opaque' && secretType !== undefined) {
        continue;
      }

      // Exclude secrets with ownerReferences
      const ownerRefs = secret.raw.metadata?.ownerReferences;
      if (Array.isArray(ownerRefs) && ownerRefs.length > 0) {
        continue;
      }

      // Exclude operator-managed outputs
      const key = `${secret.namespace ?? ''}/${secret.name}`;
      if (managed.has(key)) {
        continue;
      }

      affected.push(toAffected(secret));
    }

    if (affected.length === 0) {
      return { status: 'ok', affectedResources: [] };
    }
    return { status: 'error', affectedResources: affected };
  },
};

// ---------------------------------------------------------------------------
// SEC-006: ClusterRoleBinding grants cluster-admin to non-system subject
// ---------------------------------------------------------------------------

export const SEC_006: HealthRule = {
  id: 'SEC-006',
  category: 'security',
  severity: 'warn',
  title: (result) => {
    const n = result.affectedResources.length;
    return n === 1
      ? `1 ClusterRoleBinding grants cluster-admin to a non-system subject`
      : `${String(n)} ClusterRoleBindings grant cluster-admin to non-system subjects`;
  },
  evaluate(store: StateStore, context: string): RuleResult {
    const crbs = store.list(context, 'ClusterRoleBinding');
    const affected: AffectedResource[] = [];

    for (const crb of crbs) {
      if (isRuleSuppressed(crb.annotations, 'SEC-006')) {
        continue;
      }
      const roleRef = (crb.raw.roleRef ?? {}) as Record<string, unknown>;
      if (roleRef.name !== 'cluster-admin') {
        continue;
      }
      const subjects = (crb.raw.subjects ?? []) as Record<string, unknown>[];
      const hasNonSystemSubject = subjects.some((s) => {
        const name = typeof s.name === 'string' ? s.name : '';
        const ns = typeof s.namespace === 'string' ? s.namespace : '';
        // System subjects: system: prefix in name or kube-system namespace
        return !name.startsWith('system:') && ns !== 'kube-system';
      });
      if (hasNonSystemSubject) {
        affected.push(toAffected(crb));
      }
    }

    if (affected.length === 0) {
      return { status: 'ok', affectedResources: [] };
    }
    return { status: 'warn', affectedResources: affected };
  },
};

// ---------------------------------------------------------------------------
// SEC-007: Pod mounts a Secret as env var (prefer volume mount)
// ---------------------------------------------------------------------------

export const SEC_007: HealthRule = {
  id: 'SEC-007',
  category: 'security',
  severity: 'info',
  title: (result) => {
    const n = result.affectedResources.length;
    return n === 1
      ? `1 pod mounts a Secret as an env var (prefer volume mount)`
      : `${String(n)} pods mount Secrets as env vars`;
  },
  evaluate(store: StateStore, context: string): RuleResult {
    const pods = store.list(context, 'Pod');
    const affected: AffectedResource[] = [];

    for (const pod of pods) {
      if (isRuleSuppressed(pod.annotations, 'SEC-007')) {
        continue;
      }
      const containers = getPodContainers(pod);
      const usesSecretEnv = containers.some((c) => {
        const env = Array.isArray(c.env)
          ? (c.env as Record<string, unknown>[])
          : [];
        const envFrom = Array.isArray(c.envFrom)
          ? (c.envFrom as Record<string, unknown>[])
          : [];

        const secretRef = env.some((e) => {
          const valueFrom = (e.valueFrom ?? {}) as Record<string, unknown>;
          return valueFrom.secretKeyRef !== undefined;
        });
        const secretEnvFrom = envFrom.some((ef) => ef.secretRef !== undefined);
        return secretRef || secretEnvFrom;
      });

      if (usesSecretEnv) {
        affected.push(toAffected(pod));
      }
    }

    if (affected.length === 0) {
      return { status: 'ok', affectedResources: [] };
    }
    return { status: 'warn', affectedResources: affected };
  },
};
