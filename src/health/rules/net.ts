/**
 * Networking rules: NET-001..003 (Spec 06 §6.4).
 *
 * NET-001: Service of type LoadBalancer in namespace with no NetworkPolicy (warn)
 * NET-002: Ingress has no TLS configured (info)
 * NET-003: Ingress references a missing Service (warn)
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
// NET-001: LoadBalancer Service in namespace with no NetworkPolicy
// ---------------------------------------------------------------------------

export const NET_001: HealthRule = {
  id: 'NET-001',
  category: 'networking',
  severity: 'warn',
  title: (result) => {
    const n = result.affectedResources.length;
    return n === 1
      ? `1 LoadBalancer Service in a namespace with no NetworkPolicy`
      : `${String(n)} LoadBalancer Services in namespaces with no NetworkPolicy`;
  },
  evaluate(store: StateStore, context: string): RuleResult {
    const services = store.list(context, 'Service');
    const networkPolicies = store.list(context, 'NetworkPolicy');

    const coveredNamespaces = new Set<string>();
    for (const np of networkPolicies) {
      if (np.namespace !== null) {
        coveredNamespaces.add(np.namespace);
      }
    }

    const affected: AffectedResource[] = [];
    for (const svc of services) {
      if (isRuleSuppressed(svc.annotations, 'NET-001')) {
        continue;
      }
      const spec = svc.raw.spec;
      if (spec?.type !== 'LoadBalancer') {
        continue;
      }
      const ns = svc.namespace ?? '';
      if (!coveredNamespaces.has(ns)) {
        affected.push(toAffected(svc));
      }
    }

    if (affected.length === 0) {
      return { status: 'ok', affectedResources: [] };
    }
    return { status: 'warn', affectedResources: affected };
  },
};

// ---------------------------------------------------------------------------
// NET-002: Ingress has no TLS configured
// ---------------------------------------------------------------------------

export const NET_002: HealthRule = {
  id: 'NET-002',
  category: 'networking',
  severity: 'info',
  title: (result) => {
    const n = result.affectedResources.length;
    return n === 1
      ? `1 Ingress has no TLS configured`
      : `${String(n)} Ingresses have no TLS configured`;
  },
  evaluate(store: StateStore, context: string): RuleResult {
    const ingresses = store.list(context, 'Ingress');
    const affected: AffectedResource[] = [];

    for (const ingress of ingresses) {
      if (isRuleSuppressed(ingress.annotations, 'NET-002')) {
        continue;
      }
      const spec = ingress.raw.spec;
      const tls = spec?.tls;
      if (!Array.isArray(tls) || tls.length === 0) {
        affected.push(toAffected(ingress));
      }
    }

    if (affected.length === 0) {
      return { status: 'ok', affectedResources: [] };
    }
    return { status: 'warn', affectedResources: affected };
  },
};

// ---------------------------------------------------------------------------
// NET-003: Ingress references a missing Service
// ---------------------------------------------------------------------------

export const NET_003: HealthRule = {
  id: 'NET-003',
  category: 'networking',
  severity: 'warn',
  title: (result) => {
    const n = result.affectedResources.length;
    return n === 1
      ? `1 Ingress references a missing Service`
      : `${String(n)} Ingresses reference missing Services`;
  },
  evaluate(store: StateStore, context: string): RuleResult {
    const ingresses = store.list(context, 'Ingress');
    const affected: AffectedResource[] = [];

    for (const ingress of ingresses) {
      if (isRuleSuppressed(ingress.annotations, 'NET-003')) {
        continue;
      }
      const ns = ingress.namespace ?? '';
      const spec = ingress.raw.spec;

      // Check default backend
      const defaultBackend = (spec?.defaultBackend ?? {}) as Record<
        string,
        unknown
      >;
      const defaultService = (defaultBackend.service ?? {}) as Record<
        string,
        unknown
      >;
      const defaultServiceName =
        typeof defaultService.name === 'string'
          ? defaultService.name
          : undefined;

      if (defaultServiceName !== undefined) {
        const found = store.get(context, 'Service', ns, defaultServiceName);
        if (found === undefined) {
          affected.push(toAffected(ingress));
          continue;
        }
      }

      // Check rules backends
      const rules = Array.isArray(spec?.rules)
        ? (spec.rules as Record<string, unknown>[])
        : [];
      let missing = false;
      for (const rule of rules) {
        const http = (rule.http ?? {}) as Record<string, unknown>;
        const paths = Array.isArray(http.paths)
          ? (http.paths as Record<string, unknown>[])
          : [];
        for (const path of paths) {
          const backend = (path.backend ?? {}) as Record<string, unknown>;
          const backendService = (backend.service ?? {}) as Record<
            string,
            unknown
          >;
          const svcName =
            typeof backendService.name === 'string'
              ? backendService.name
              : undefined;
          if (svcName !== undefined) {
            const found = store.get(context, 'Service', ns, svcName);
            if (found === undefined) {
              missing = true;
              break;
            }
          }
        }
        if (missing) break;
      }
      if (missing) {
        affected.push(toAffected(ingress));
      }
    }

    if (affected.length === 0) {
      return { status: 'ok', affectedResources: [] };
    }
    return { status: 'warn', affectedResources: affected };
  },
};
