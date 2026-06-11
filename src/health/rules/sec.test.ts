/**
 * Unit tests for SEC-001..007 — Security rules (Spec 06 §6.3).
 */
import { describe, it, expect } from 'vitest';
import {
  SEC_001,
  SEC_002,
  SEC_003,
  SEC_004,
  SEC_005,
  SEC_006,
  SEC_007,
} from './sec.js';
import {
  makeStore,
  seedResource,
  TEST_CONTEXT,
  makePodRaw,
} from '../test-helpers.js';
import { EMPTY_CAPS } from '../types.js';
import type { RuleCaps } from '../types.js';

const WITH_SECRETS_OP: RuleCaps = {
  ...EMPTY_CAPS,
  secretsOperatorPresent: true,
};

// ---------------------------------------------------------------------------
// SEC-001: Pod runs as root
// ---------------------------------------------------------------------------

describe('SEC-001 — Pod runs as root', () => {
  it('ok — pod has runAsNonRoot: true at pod level', () => {
    const store = makeStore((s, ctx) => {
      seedResource(
        s,
        ctx,
        'Pod',
        'api',
        'default',
        makePodRaw({
          name: 'api',
          securityContext: { runAsNonRoot: true },
          containers: [{ name: 'main' }],
        }),
      );
    });
    // runAsNonRoot: true at pod level satisfies the guard
    expect(SEC_001.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });

  it('error — pod has runAsNonRoot: false', () => {
    const store = makeStore((s, ctx) => {
      seedResource(
        s,
        ctx,
        'Pod',
        'api',
        'default',
        makePodRaw({
          name: 'api',
          securityContext: { runAsNonRoot: false },
          containers: [{ name: 'main' }],
        }),
      );
    });
    expect(SEC_001.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe(
      'error',
    );
  });

  it('error — pod has runAsUser: 0', () => {
    const store = makeStore((s, ctx) => {
      seedResource(
        s,
        ctx,
        'Pod',
        'api',
        'default',
        makePodRaw({
          name: 'api',
          securityContext: { runAsUser: 0 },
          containers: [{ name: 'main' }],
        }),
      );
    });
    expect(SEC_001.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe(
      'error',
    );
  });

  it('ok — container has runAsNonRoot: true', () => {
    const store = makeStore((s, ctx) => {
      seedResource(
        s,
        ctx,
        'Pod',
        'api',
        'default',
        makePodRaw({
          name: 'api',
          containers: [
            { name: 'main', securityContext: { runAsNonRoot: true } },
          ],
        }),
      );
    });
    expect(SEC_001.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });

  it('error — container has runAsUser: 0', () => {
    const store = makeStore((s, ctx) => {
      seedResource(
        s,
        ctx,
        'Pod',
        'api',
        'default',
        makePodRaw({
          name: 'api',
          containers: [{ name: 'main', securityContext: { runAsUser: 0 } }],
        }),
      );
    });
    expect(SEC_001.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe(
      'error',
    );
  });

  it('suppressed — annotated pod skipped', () => {
    const store = makeStore((s, ctx) => {
      seedResource(
        s,
        ctx,
        'Pod',
        'api',
        'default',
        makePodRaw({
          name: 'api',
          annotations: { 'p9r.io/suppress-rules': 'SEC-001' },
          securityContext: { runAsUser: 0 },
          containers: [{ name: 'main' }],
        }),
      );
    });
    expect(SEC_001.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });

  it('ok — empty store', () => {
    expect(SEC_001.evaluate(makeStore(), TEST_CONTEXT, EMPTY_CAPS).status).toBe(
      'ok',
    );
  });

  it('error — pod with no containers (getPodContainers [] fallback — no runAsNonRoot, so error)', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'Pod', 'api', 'default', {
        spec: {}, // No containers field — triggers [] fallback in getPodContainers (line 31)
      });
    });
    // No containers means: podLevel runAsNonRoot not set, containers empty → no container-level check
    // The rule checks pod-level OR per-container; with no containers, only pod-level matters
    // spec.securityContext is undefined → runAsNonRoot not set → error
    expect(SEC_001.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe(
      'error',
    );
  });
});

// ---------------------------------------------------------------------------
// SEC-002: Pod has allowPrivilegeEscalation: true
// ---------------------------------------------------------------------------

describe('SEC-002 — allowPrivilegeEscalation', () => {
  it('ok — no allowPrivilegeEscalation set', () => {
    const store = makeStore((s, ctx) => {
      seedResource(
        s,
        ctx,
        'Pod',
        'api',
        'default',
        makePodRaw({
          name: 'api',
          containers: [{ name: 'main' }],
        }),
      );
    });
    expect(SEC_002.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });

  it('warn — container has allowPrivilegeEscalation: true', () => {
    const store = makeStore((s, ctx) => {
      seedResource(
        s,
        ctx,
        'Pod',
        'api',
        'default',
        makePodRaw({
          name: 'api',
          containers: [
            {
              name: 'main',
              securityContext: { allowPrivilegeEscalation: true },
            },
          ],
        }),
      );
    });
    expect(SEC_002.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe(
      'warn',
    );
  });

  it('ok — allowPrivilegeEscalation explicitly false', () => {
    const store = makeStore((s, ctx) => {
      seedResource(
        s,
        ctx,
        'Pod',
        'api',
        'default',
        makePodRaw({
          name: 'api',
          containers: [
            {
              name: 'main',
              securityContext: { allowPrivilegeEscalation: false },
            },
          ],
        }),
      );
    });
    expect(SEC_002.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });

  it('suppressed — annotated pod skipped', () => {
    const store = makeStore((s, ctx) => {
      seedResource(
        s,
        ctx,
        'Pod',
        'api',
        'default',
        makePodRaw({
          name: 'api',
          annotations: { 'p9r.io/suppress-rules': 'SEC-002' },
          containers: [
            {
              name: 'main',
              securityContext: { allowPrivilegeEscalation: true },
            },
          ],
        }),
      );
    });
    expect(SEC_002.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// SEC-003: Namespace has no NetworkPolicy
// ---------------------------------------------------------------------------

describe('SEC-003 — Namespace has no NetworkPolicy', () => {
  it('ok — namespace has NetworkPolicy', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'Namespace', 'default', null, {
        metadata: { name: 'default' },
      });
      seedResource(s, ctx, 'NetworkPolicy', 'deny-all', 'default', {
        spec: { podSelector: {} },
      });
    });
    expect(SEC_003.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });

  it('warn — namespace has no NetworkPolicy', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'Namespace', 'default', null, {
        metadata: { name: 'default' },
      });
    });
    const result = SEC_003.evaluate(store, TEST_CONTEXT, EMPTY_CAPS);
    expect(result.status).toBe('warn');
    expect(result.affectedResources[0]?.name).toBe('default');
  });

  it('ok — no namespaces in store', () => {
    expect(SEC_003.evaluate(makeStore(), TEST_CONTEXT, EMPTY_CAPS).status).toBe(
      'ok',
    );
  });

  it('suppressed — annotated namespace skipped', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'Namespace', 'default', null, {
        metadata: {
          name: 'default',
          annotations: { 'p9r.io/suppress-rules': 'SEC-003' },
        },
      });
    });
    expect(SEC_003.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });

  it('warn — NetworkPolicy with null namespace does not cover namespace (false branch)', () => {
    // NetworkPolicy with null namespace → np.namespace !== null is false → skipped
    // So the 'default' namespace is still not covered
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'Namespace', 'default', null, {
        metadata: { name: 'default' },
      });
      seedResource(s, ctx, 'NetworkPolicy', 'cluster-np', null, {
        spec: { podSelector: {} },
      });
    });
    const result = SEC_003.evaluate(store, TEST_CONTEXT, EMPTY_CAPS);
    expect(result.status).toBe('warn');
  });
});

// ---------------------------------------------------------------------------
// SEC-004: ServiceAccount with automountServiceAccountToken with no usage
// ---------------------------------------------------------------------------

describe('SEC-004 — ServiceAccount automountServiceAccountToken unused', () => {
  it('warn — ServiceAccount with automount=true and no pods use it', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'ServiceAccount', 'my-sa', 'default', {
        automountServiceAccountToken: true,
      });
    });
    expect(SEC_004.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe(
      'warn',
    );
  });

  it('ok — ServiceAccount used by a pod', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'ServiceAccount', 'my-sa', 'default', {
        automountServiceAccountToken: true,
      });
      seedResource(
        s,
        ctx,
        'Pod',
        'api',
        'default',
        makePodRaw({
          name: 'api',
          serviceAccountName: 'my-sa',
          containers: [{ name: 'main' }],
        }),
      );
    });
    expect(SEC_004.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });

  it('ok — ServiceAccount has automount: false', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'ServiceAccount', 'my-sa', 'default', {
        automountServiceAccountToken: false,
      });
    });
    expect(SEC_004.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });

  it('warn — ServiceAccount has no automount field (default true) and unused', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'ServiceAccount', 'my-sa', 'default', {});
    });
    expect(SEC_004.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe(
      'warn',
    );
  });

  it('ok — empty store', () => {
    expect(SEC_004.evaluate(makeStore(), TEST_CONTEXT, EMPTY_CAPS).status).toBe(
      'ok',
    );
  });

  it('ok — suppressed ServiceAccount skipped', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'ServiceAccount', 'my-sa', 'default', {
        metadata: { annotations: { 'p9r.io/suppress-rules': 'SEC-004' } },
        automountServiceAccountToken: true,
      });
    });
    expect(SEC_004.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });

  it('warn — ServiceAccount with null namespace (sa.namespace ?? "" fallback)', () => {
    // ServiceAccount with null namespace covers sa.namespace ?? '' branch at line 219
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'ServiceAccount', 'cluster-sa', null, {
        automountServiceAccountToken: true,
      });
    });
    const result = SEC_004.evaluate(store, TEST_CONTEXT, EMPTY_CAPS);
    expect(result.status).toBe('warn');
    expect(result.affectedResources[0]?.namespace).toBe('');
  });

  it('ok — Pod with null namespace used by SA (pod.namespace ?? "" fallback)', () => {
    // Pod with null namespace covers pod.namespace ?? '' branch at line 206
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'ServiceAccount', 'cluster-sa', null, {
        automountServiceAccountToken: true,
      });
      // Pod with null namespace and serviceAccountName
      seedResource(s, ctx, 'Pod', 'cluster-pod', null, {
        spec: { serviceAccountName: 'cluster-sa' },
      });
    });
    expect(SEC_004.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// SEC-005: Opaque Secret with no managing operator
// ---------------------------------------------------------------------------

describe('SEC-005 — Opaque Secret with no managing operator', () => {
  it('suppressed — no secrets operator detected, rule suppressed entirely', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'Secret', 'my-secret', 'default', {
        type: 'Opaque',
        data: {},
      });
    });
    const result = SEC_005.evaluate(store, TEST_CONTEXT, EMPTY_CAPS);
    expect(result.status).toBe('suppressed');
  });

  it('error — Opaque secret with no ownerRefs when secrets operator present', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'Secret', 'my-secret', 'default', {
        type: 'Opaque',
        data: {},
      });
    });
    const result = SEC_005.evaluate(store, TEST_CONTEXT, WITH_SECRETS_OP);
    expect(result.status).toBe('error');
    expect(result.affectedResources[0]?.name).toBe('my-secret');
  });

  it('ok — Secret has ownerReferences (operator-managed)', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'Secret', 'my-secret', 'default', {
        type: 'Opaque',
        metadata: {
          ownerReferences: [
            { apiVersion: 'v1', kind: 'DopplerSecret', name: 'ds', uid: 'u1' },
          ],
        },
        data: {},
      });
    });
    const result = SEC_005.evaluate(store, TEST_CONTEXT, WITH_SECRETS_OP);
    expect(result.status).toBe('ok');
  });

  it('ok — Secret type is kubernetes.io/service-account-token (excluded)', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'Secret', 'sa-token', 'default', {
        type: 'kubernetes.io/service-account-token',
        data: {},
      });
    });
    const result = SEC_005.evaluate(store, TEST_CONTEXT, WITH_SECRETS_OP);
    expect(result.status).toBe('ok');
  });

  it('ok — Secret type is helm.sh/release.v1 (excluded)', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'Secret', 'helm-rel', 'default', {
        type: 'helm.sh/release.v1',
        data: {},
      });
    });
    const result = SEC_005.evaluate(store, TEST_CONTEXT, WITH_SECRETS_OP);
    expect(result.status).toBe('ok');
  });

  it('ok — Secret is DopplerSecret managed output (with secretNamespace)', () => {
    const store = makeStore((s, ctx) => {
      // Create DopplerSecret that manages 'env-vars' secret
      seedResource(s, ctx, 'DopplerSecret', 'my-doppler', 'default', {
        spec: {
          secretName: 'env-vars',
          secretNamespace: 'default',
        },
      });
      // The managed output secret
      seedResource(s, ctx, 'Secret', 'env-vars', 'default', {
        type: 'Opaque',
        data: {},
      });
    });
    const result = SEC_005.evaluate(store, TEST_CONTEXT, WITH_SECRETS_OP);
    expect(result.status).toBe('ok');
  });

  it('ok — DopplerSecret without secretNamespace (ds.namespace ?? "" fallback)', () => {
    const store = makeStore((s, ctx) => {
      // DopplerSecret with no secretNamespace — uses ds.namespace fallback (line 256)
      seedResource(s, ctx, 'DopplerSecret', 'my-doppler', 'default', {
        spec: { secretName: 'env-vars' }, // No secretNamespace
      });
      seedResource(s, ctx, 'Secret', 'env-vars', 'default', {
        type: 'Opaque',
        data: {},
      });
    });
    const result = SEC_005.evaluate(store, TEST_CONTEXT, WITH_SECRETS_OP);
    expect(result.status).toBe('ok');
  });

  it('ok — DopplerSecret with null namespace (ds.namespace null ?? "" fallback)', () => {
    // DopplerSecret with null namespace and no secretNamespace → uses '' fallback
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'DopplerSecret', 'cluster-doppler', null, {
        spec: { secretName: 'cluster-secret' }, // No secretNamespace, null namespace
      });
      seedResource(s, ctx, 'Secret', 'cluster-secret', null, {
        type: 'Opaque',
        data: {},
      });
    });
    const result = SEC_005.evaluate(store, TEST_CONTEXT, WITH_SECRETS_OP);
    expect(result.status).toBe('ok');
  });

  it('ok — Secret with non-Opaque, non-excluded type (e.g. custom type) is skipped', () => {
    const store = makeStore((s, ctx) => {
      // Custom type — not Opaque, not excluded prefix → triggers non-Opaque continue (line 317)
      seedResource(s, ctx, 'Secret', 'custom-type-secret', 'default', {
        type: 'my-app.io/auth-token',
        data: {},
      });
    });
    const result = SEC_005.evaluate(store, TEST_CONTEXT, WITH_SECRETS_OP);
    expect(result.status).toBe('ok');
  });

  it('suppressed — SEC-005 annotation suppresses specific secret', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'Secret', 'my-secret', 'default', {
        type: 'Opaque',
        metadata: { annotations: { 'p9r.io/suppress-rules': 'SEC-005' } },
        data: {},
      });
    });
    const result = SEC_005.evaluate(store, TEST_CONTEXT, WITH_SECRETS_OP);
    expect(result.status).toBe('ok');
  });

  it('ok — Secret is ExternalSecret managed output (with spec.target.name)', () => {
    const store = makeStore((s, ctx) => {
      // Create ExternalSecret that manages 'my-creds' secret
      seedResource(s, ctx, 'ExternalSecret', 'my-es', 'default', {
        spec: { target: { name: 'my-creds' } },
      });
      // The managed output secret
      seedResource(s, ctx, 'Secret', 'my-creds', 'default', {
        type: 'Opaque',
        data: {},
      });
    });
    const result = SEC_005.evaluate(store, TEST_CONTEXT, WITH_SECRETS_OP);
    expect(result.status).toBe('ok');
  });

  it('ok — Secret is ExternalSecret managed output (no spec.target.name, fallback to es.name)', () => {
    const store = makeStore((s, ctx) => {
      // ExternalSecret with no target.name — falls back to ES name
      seedResource(s, ctx, 'ExternalSecret', 'my-es-secret', 'default', {
        spec: { target: {} }, // No target.name — fallback to es.name 'my-es-secret'
      });
      seedResource(s, ctx, 'Secret', 'my-es-secret', 'default', {
        type: 'Opaque',
        data: {},
      });
    });
    const result = SEC_005.evaluate(store, TEST_CONTEXT, WITH_SECRETS_OP);
    expect(result.status).toBe('ok');
  });

  it('ok — ExternalSecret with no spec field (spec?.target ?? {} fallback)', () => {
    // ExternalSecret with no spec — spec?.target is undefined → ?? {} fires (line 265)
    // Falls back to es.name as secretName
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'ExternalSecret', 'my-nospec-secret', 'default', {
        // No spec field — spec is undefined
      });
      seedResource(s, ctx, 'Secret', 'my-nospec-secret', 'default', {
        type: 'Opaque',
        data: {},
      });
    });
    const result = SEC_005.evaluate(store, TEST_CONTEXT, WITH_SECRETS_OP);
    expect(result.status).toBe('ok');
  });

  it('ok — ExternalSecret with null namespace (es.namespace ?? "" fallback)', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'ExternalSecret', 'cluster-es', null, {
        spec: { target: { name: 'cluster-secret' } },
      });
      seedResource(s, ctx, 'Secret', 'cluster-secret', null, {
        type: 'Opaque',
        data: {},
      });
    });
    const result = SEC_005.evaluate(store, TEST_CONTEXT, WITH_SECRETS_OP);
    expect(result.status).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// SEC-006: ClusterRoleBinding grants cluster-admin to non-system subject
// ---------------------------------------------------------------------------

describe('SEC-006 — ClusterRoleBinding cluster-admin non-system', () => {
  it('ok — ClusterRoleBinding is not cluster-admin', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'ClusterRoleBinding', 'view-binding', null, {
        roleRef: {
          kind: 'ClusterRole',
          name: 'view',
          apiGroup: 'rbac.authorization.k8s.io',
        },
        subjects: [{ kind: 'User', name: 'alice', namespace: 'default' }],
      });
    });
    expect(SEC_006.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });

  it('warn — cluster-admin granted to non-system user', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'ClusterRoleBinding', 'admin-binding', null, {
        roleRef: {
          kind: 'ClusterRole',
          name: 'cluster-admin',
          apiGroup: 'rbac.authorization.k8s.io',
        },
        subjects: [{ kind: 'User', name: 'alice', namespace: 'default' }],
      });
    });
    expect(SEC_006.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe(
      'warn',
    );
  });

  it('ok — cluster-admin granted to system: prefixed subject', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'ClusterRoleBinding', 'system-binding', null, {
        roleRef: {
          kind: 'ClusterRole',
          name: 'cluster-admin',
          apiGroup: 'rbac.authorization.k8s.io',
        },
        subjects: [
          {
            kind: 'User',
            name: 'system:kube-controller-manager',
            namespace: '',
          },
        ],
      });
    });
    expect(SEC_006.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });

  it('ok — cluster-admin in kube-system namespace', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'ClusterRoleBinding', 'kube-admin', null, {
        roleRef: {
          kind: 'ClusterRole',
          name: 'cluster-admin',
          apiGroup: 'rbac.authorization.k8s.io',
        },
        subjects: [
          { kind: 'ServiceAccount', name: 'admin', namespace: 'kube-system' },
        ],
      });
    });
    expect(SEC_006.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });

  it('suppressed — annotated CRB skipped', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'ClusterRoleBinding', 'admin-binding', null, {
        metadata: { annotations: { 'p9r.io/suppress-rules': 'SEC-006' } },
        roleRef: {
          kind: 'ClusterRole',
          name: 'cluster-admin',
          apiGroup: 'rbac.authorization.k8s.io',
        },
        subjects: [{ kind: 'User', name: 'alice', namespace: 'default' }],
      });
    });
    expect(SEC_006.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });

  it('warn — subject with non-string name and namespace (typeof false branches)', () => {
    // Subject where name and namespace are numbers, not strings → typeof checks are false
    // '' (default) does not start with 'system:' and is not 'kube-system' → non-system → warn
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'ClusterRoleBinding', 'admin-binding', null, {
        roleRef: {
          kind: 'ClusterRole',
          name: 'cluster-admin',
          apiGroup: 'rbac.authorization.k8s.io',
        },
        subjects: [{ kind: 'User', name: 42, namespace: 99 }],
      });
    });
    expect(SEC_006.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe(
      'warn',
    );
  });

  it('ok — CRB without roleRef field (roleRef ?? {} fallback → name undefined, not cluster-admin)', () => {
    // CRB with no roleRef → (crb.raw.roleRef ?? {}) fires the ?? branch
    // roleRef.name is undefined → !== 'cluster-admin' → skip
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'ClusterRoleBinding', 'no-roleref', null, {
        subjects: [{ kind: 'User', name: 'alice', namespace: 'default' }],
      });
    });
    expect(SEC_006.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });

  it('ok — CRB cluster-admin without subjects field (subjects ?? [] fallback)', () => {
    // CRB with no subjects → (crb.raw.subjects ?? []) fires the ?? branch → empty array → no subjects → ok
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'ClusterRoleBinding', 'admin-no-subjects', null, {
        roleRef: {
          kind: 'ClusterRole',
          name: 'cluster-admin',
          apiGroup: 'rbac.authorization.k8s.io',
        },
        // No subjects field
      });
    });
    expect(SEC_006.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// SEC-007: Pod mounts Secret as env var
// ---------------------------------------------------------------------------

describe('SEC-007 — Pod mounts Secret as env var', () => {
  it('ok — pod uses volume mount for secret', () => {
    const store = makeStore((s, ctx) => {
      seedResource(
        s,
        ctx,
        'Pod',
        'api',
        'default',
        makePodRaw({
          name: 'api',
          containers: [{ name: 'main' }],
        }),
      );
    });
    expect(SEC_007.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });

  it('warn — container uses secretKeyRef in env', () => {
    const store = makeStore((s, ctx) => {
      seedResource(
        s,
        ctx,
        'Pod',
        'api',
        'default',
        makePodRaw({
          name: 'api',
          containers: [
            {
              name: 'main',
              env: [
                {
                  name: 'MY_SECRET',
                  valueFrom: {
                    secretKeyRef: { name: 'my-secret', key: 'value' },
                  },
                },
              ],
            },
          ],
        }),
      );
    });
    expect(SEC_007.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe(
      'warn',
    );
  });

  it('warn — container uses envFrom secretRef', () => {
    const store = makeStore((s, ctx) => {
      seedResource(
        s,
        ctx,
        'Pod',
        'api',
        'default',
        makePodRaw({
          name: 'api',
          containers: [
            {
              name: 'main',
              envFrom: [{ secretRef: { name: 'my-secret' } }],
            },
          ],
        }),
      );
    });
    expect(SEC_007.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe(
      'warn',
    );
  });

  it('suppressed — annotated pod skipped', () => {
    const store = makeStore((s, ctx) => {
      seedResource(
        s,
        ctx,
        'Pod',
        'api',
        'default',
        makePodRaw({
          name: 'api',
          annotations: { 'p9r.io/suppress-rules': 'SEC-007' },
          containers: [
            {
              name: 'main',
              env: [
                {
                  name: 'X',
                  valueFrom: { secretKeyRef: { name: 's', key: 'k' } },
                },
              ],
            },
          ],
        }),
      );
    });
    expect(SEC_007.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });

  it('ok — container with non-array env and envFrom (covers Array.isArray false branches)', () => {
    // Container object where env and envFrom are non-array values (null)
    // This covers the false branch of Array.isArray(c.env) and Array.isArray(c.envFrom)
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'Pod', 'api', 'default', {
        spec: {
          containers: [{ name: 'main', env: null, envFrom: null }],
        },
      });
    });
    expect(SEC_007.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });

  it('ok — container env entry without valueFrom field (e.valueFrom ?? {} fallback)', () => {
    // Env entry with no valueFrom — covers the ?? {} fallback at line 422
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'Pod', 'api', 'default', {
        spec: {
          containers: [
            { name: 'main', env: [{ name: 'MY_VAR', value: 'hello' }] },
          ],
        },
      });
    });
    expect(SEC_007.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// Title plural branches for all SEC rules
// ---------------------------------------------------------------------------

describe('SEC title plural branches', () => {
  it('SEC_001 title — singular', () => {
    const result = {
      status: 'error' as const,
      affectedResources: [{ kind: 'Pod', namespace: 'default', name: 'a' }],
    };
    expect(SEC_001.title(result)).toContain('1 pod');
  });

  it('SEC_001 title — plural', () => {
    const result = {
      status: 'error' as const,
      affectedResources: [
        { kind: 'Pod', namespace: 'default', name: 'a' },
        { kind: 'Pod', namespace: 'default', name: 'b' },
      ],
    };
    expect(SEC_001.title(result)).toContain('2 pods');
  });

  it('SEC_002 title — singular', () => {
    const result = {
      status: 'warn' as const,
      affectedResources: [{ kind: 'Pod', namespace: 'default', name: 'a' }],
    };
    expect(SEC_002.title(result)).toContain('1 pod');
  });

  it('SEC_002 title — plural', () => {
    const result = {
      status: 'warn' as const,
      affectedResources: [
        { kind: 'Pod', namespace: 'default', name: 'a' },
        { kind: 'Pod', namespace: 'default', name: 'b' },
      ],
    };
    expect(SEC_002.title(result)).toContain('2 pods');
  });

  it('SEC_003 title — singular', () => {
    const result = {
      status: 'warn' as const,
      affectedResources: [
        { kind: 'Namespace', namespace: '', name: 'default' },
      ],
    };
    expect(SEC_003.title(result)).toContain('1 namespace');
  });

  it('SEC_003 title — plural', () => {
    const result = {
      status: 'warn' as const,
      affectedResources: [
        { kind: 'Namespace', namespace: '', name: 'default' },
        { kind: 'Namespace', namespace: '', name: 'prod' },
      ],
    };
    expect(SEC_003.title(result)).toContain('2 namespaces');
  });

  it('SEC_004 title — singular', () => {
    const result = {
      status: 'warn' as const,
      affectedResources: [
        { kind: 'ServiceAccount', namespace: 'default', name: 'sa' },
      ],
    };
    expect(SEC_004.title(result)).toContain('1 ServiceAccount');
  });

  it('SEC_004 title — plural', () => {
    const result = {
      status: 'warn' as const,
      affectedResources: [
        { kind: 'ServiceAccount', namespace: 'default', name: 'sa1' },
        { kind: 'ServiceAccount', namespace: 'default', name: 'sa2' },
      ],
    };
    expect(SEC_004.title(result)).toContain('2 ServiceAccounts');
  });

  it('SEC_005 title — singular', () => {
    const result = {
      status: 'error' as const,
      affectedResources: [{ kind: 'Secret', namespace: 'default', name: 's' }],
    };
    expect(SEC_005.title(result)).toContain('1 Opaque Secret');
  });

  it('SEC_005 title — plural', () => {
    const result = {
      status: 'error' as const,
      affectedResources: [
        { kind: 'Secret', namespace: 'default', name: 's1' },
        { kind: 'Secret', namespace: 'default', name: 's2' },
      ],
    };
    expect(SEC_005.title(result)).toContain('2 Opaque Secrets');
  });

  it('SEC_005 title — suppressed status', () => {
    const result = { status: 'suppressed' as const, affectedResources: [] };
    expect(SEC_005.title(result)).toContain('suppressed');
  });

  it('SEC_006 title — singular', () => {
    const result = {
      status: 'warn' as const,
      affectedResources: [
        { kind: 'ClusterRoleBinding', namespace: '', name: 'crb' },
      ],
    };
    expect(SEC_006.title(result)).toContain('1 ClusterRoleBinding');
  });

  it('SEC_006 title — plural', () => {
    const result = {
      status: 'warn' as const,
      affectedResources: [
        { kind: 'ClusterRoleBinding', namespace: '', name: 'crb1' },
        { kind: 'ClusterRoleBinding', namespace: '', name: 'crb2' },
      ],
    };
    expect(SEC_006.title(result)).toContain('2 ClusterRoleBindings');
  });

  it('SEC_007 title — singular', () => {
    const result = {
      status: 'warn' as const,
      affectedResources: [{ kind: 'Pod', namespace: 'default', name: 'a' }],
    };
    expect(SEC_007.title(result)).toContain('1 pod');
  });

  it('SEC_007 title — plural', () => {
    const result = {
      status: 'warn' as const,
      affectedResources: [
        { kind: 'Pod', namespace: 'default', name: 'a' },
        { kind: 'Pod', namespace: 'default', name: 'b' },
      ],
    };
    expect(SEC_007.title(result)).toContain('2 pods');
  });
});
