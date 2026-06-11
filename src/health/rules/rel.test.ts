/**
 * Unit tests for REL-001..004 — Reliability rules (Spec 06 §6.2).
 */
import { describe, it, expect } from 'vitest';
import { REL_001, REL_002, REL_003, REL_004 } from './rel.js';
import { makeStore, seedResource, TEST_CONTEXT } from '../test-helpers.js';
import { EMPTY_CAPS } from '../types.js';

// ---------------------------------------------------------------------------
// REL-001: Deployment has only 1 replica
// ---------------------------------------------------------------------------

describe('REL-001 — Deployment has only 1 replica', () => {
  it('ok — deployment has 3 replicas', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'Deployment', 'api', 'default', {
        spec: { replicas: 3 },
      });
    });
    expect(REL_001.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });

  it('warn — deployment has 1 replica', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'Deployment', 'api', 'default', {
        spec: { replicas: 1 },
      });
    });
    const result = REL_001.evaluate(store, TEST_CONTEXT, EMPTY_CAPS);
    expect(result.status).toBe('warn');
    expect(result.affectedResources[0]?.name).toBe('api');
  });

  it('warn — deployment with no replicas field defaults to 1', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'Deployment', 'api', 'default', {
        spec: {},
      });
    });
    expect(REL_001.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe(
      'warn',
    );
  });

  it('ok — empty store', () => {
    const store = makeStore();
    expect(REL_001.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });

  it('suppressed — annotated deployment skipped', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'Deployment', 'api', 'default', {
        metadata: { annotations: { 'p9r.io/suppress-rules': 'REL-001' } },
        spec: { replicas: 1 },
      });
    });
    expect(REL_001.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });

  it('title — singular', () => {
    const result = {
      status: 'warn' as const,
      affectedResources: [
        { kind: 'Deployment', namespace: 'default', name: 'api' },
      ],
    };
    expect(REL_001.title(result)).toContain('1 deployment');
  });

  it('title — plural', () => {
    const result = {
      status: 'warn' as const,
      affectedResources: [
        { kind: 'Deployment', namespace: 'default', name: 'a' },
        { kind: 'Deployment', namespace: 'default', name: 'b' },
      ],
    };
    expect(REL_001.title(result)).toContain('2 deployments');
  });
});

// ---------------------------------------------------------------------------
// REL-002: Deployment has no PodDisruptionBudget
// ---------------------------------------------------------------------------

describe('REL-002 — Deployment has no PodDisruptionBudget', () => {
  it('warn — deployment with no PDB', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'Deployment', 'api', 'default', {
        spec: {
          replicas: 3,
          template: { metadata: { labels: { app: 'api' } } },
        },
      });
    });
    const result = REL_002.evaluate(store, TEST_CONTEXT, EMPTY_CAPS);
    expect(result.status).toBe('warn');
  });

  it('ok — deployment covered by PDB with matching selector', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'Deployment', 'api', 'default', {
        spec: {
          replicas: 3,
          template: { metadata: { labels: { app: 'api' } } },
        },
      });
      seedResource(s, ctx, 'PodDisruptionBudget', 'api-pdb', 'default', {
        spec: { selector: { matchLabels: { app: 'api' } }, minAvailable: 2 },
      });
    });
    expect(REL_002.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });

  it('warn — PDB in different namespace does not cover deployment', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'Deployment', 'api', 'default', {
        spec: {
          template: { metadata: { labels: { app: 'api' } } },
        },
      });
      seedResource(s, ctx, 'PodDisruptionBudget', 'api-pdb', 'other-ns', {
        spec: { selector: { matchLabels: { app: 'api' } } },
      });
    });
    expect(REL_002.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe(
      'warn',
    );
  });

  it('ok — empty store', () => {
    expect(REL_002.evaluate(makeStore(), TEST_CONTEXT, EMPTY_CAPS).status).toBe(
      'ok',
    );
  });

  it('ok — suppressed deployment skipped', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'Deployment', 'api', 'default', {
        metadata: { annotations: { 'p9r.io/suppress-rules': 'REL-002' } },
        spec: { replicas: 2, selector: { matchLabels: { app: 'api' } } },
      });
    });
    expect(REL_002.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });

  it('warn — Deployment has no spec.template (template ?? {} fallback)', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'Deployment', 'api', 'default', {
        spec: { replicas: 2 }, // No template — triggers ?? {} fallback
      });
    });
    expect(REL_002.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe(
      'warn',
    );
  });

  it('warn — Deployment template has no metadata (metadata ?? {} fallback)', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'Deployment', 'api', 'default', {
        spec: { replicas: 2, template: {} }, // No metadata — triggers ?? {} fallback
      });
    });
    expect(REL_002.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe(
      'warn',
    );
  });

  it('warn — Deployment template.metadata has no labels (labels ?? {} fallback)', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'Deployment', 'api', 'default', {
        spec: { replicas: 2, template: { metadata: {} } }, // No labels — triggers ?? {} fallback
      });
    });
    expect(REL_002.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe(
      'warn',
    );
  });

  it('ok — PDB has no spec.selector (selector ?? {} fallback, empty matchLabels covers all)', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'Deployment', 'api', 'default', {
        spec: { template: { metadata: { labels: { app: 'api' } } } },
      });
      seedResource(s, ctx, 'PodDisruptionBudget', 'api-pdb', 'default', {
        spec: {}, // No selector — triggers ?? {} fallback (line 105)
      });
    });
    // PDB with empty selector has empty matchLabels — every() on empty is vacuously true
    // so the PDB "covers" all deployments in the namespace
    expect(REL_002.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });

  it('warn — Deployment with null namespace (dep.namespace ?? "" fallback)', () => {
    const store = makeStore((s, ctx) => {
      // Cluster-scoped deployment with null namespace
      seedResource(s, ctx, 'Deployment', 'api', null, {
        spec: { template: { metadata: { labels: { app: 'api' } } } },
      });
    });
    const result = REL_002.evaluate(store, TEST_CONTEXT, EMPTY_CAPS);
    expect(result.status).toBe('warn');
    expect(result.affectedResources[0]?.namespace).toBe('');
  });

  it('ok — PDB with null namespace covers null-namespace deployment', () => {
    const store = makeStore((s, ctx) => {
      // Both null namespace — PDB covers deployment
      seedResource(s, ctx, 'Deployment', 'api', null, {
        spec: { template: { metadata: { labels: { app: 'api' } } } },
      });
      seedResource(s, ctx, 'PodDisruptionBudget', 'api-pdb', null, {
        spec: { selector: { matchLabels: { app: 'api' } } },
      });
    });
    expect(REL_002.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });

  it('warn — PDB selector has no matchLabels (matchLabels ?? {} fallback)', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'Deployment', 'api', 'default', {
        spec: { template: { metadata: { labels: { app: 'api' } } } },
      });
      seedResource(s, ctx, 'PodDisruptionBudget', 'api-pdb', 'default', {
        spec: { selector: {} }, // No matchLabels — triggers ?? {} fallback (line 106)
      });
    });
    // PDB with no matchLabels covers all pods via empty matchLabels (every() returns true for empty)
    expect(REL_002.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// REL-003: StatefulSet has only 1 replica
// ---------------------------------------------------------------------------

describe('REL-003 — StatefulSet has only 1 replica', () => {
  it('ok — StatefulSet has 3 replicas', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'StatefulSet', 'db', 'default', {
        spec: { replicas: 3 },
      });
    });
    expect(REL_003.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });

  it('warn — StatefulSet has 1 replica', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'StatefulSet', 'db', 'default', {
        spec: { replicas: 1 },
      });
    });
    const result = REL_003.evaluate(store, TEST_CONTEXT, EMPTY_CAPS);
    expect(result.status).toBe('warn');
    expect(result.affectedResources[0]?.name).toBe('db');
  });

  it('warn — StatefulSet defaults to 1 replica when not set', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'StatefulSet', 'db', 'default', { spec: {} });
    });
    expect(REL_003.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe(
      'warn',
    );
  });

  it('suppressed — annotated StatefulSet skipped', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'StatefulSet', 'db', 'default', {
        metadata: { annotations: { 'p9r.io/suppress-rules': 'REL-003' } },
        spec: { replicas: 1 },
      });
    });
    expect(REL_003.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// REL-004: CronJob has no concurrencyPolicy set
// ---------------------------------------------------------------------------

describe('REL-004 — CronJob has no concurrencyPolicy set', () => {
  it('ok — CronJob has concurrencyPolicy set to Forbid', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'CronJob', 'backup', 'default', {
        spec: { concurrencyPolicy: 'Forbid', schedule: '0 * * * *' },
      });
    });
    expect(REL_004.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });

  it('warn — CronJob has no concurrencyPolicy', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'CronJob', 'backup', 'default', {
        spec: { schedule: '0 * * * *' },
      });
    });
    const result = REL_004.evaluate(store, TEST_CONTEXT, EMPTY_CAPS);
    expect(result.status).toBe('warn');
    expect(result.affectedResources[0]?.name).toBe('backup');
  });

  it('ok — CronJob has Allow concurrencyPolicy', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'CronJob', 'backup', 'default', {
        spec: { concurrencyPolicy: 'Allow', schedule: '0 * * * *' },
      });
    });
    expect(REL_004.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });

  it('warn — concurrencyPolicy is empty string', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'CronJob', 'backup', 'default', {
        spec: { concurrencyPolicy: '', schedule: '0 * * * *' },
      });
    });
    expect(REL_004.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe(
      'warn',
    );
  });

  it('ok — empty store', () => {
    expect(REL_004.evaluate(makeStore(), TEST_CONTEXT, EMPTY_CAPS).status).toBe(
      'ok',
    );
  });

  it('suppressed — annotated CronJob skipped', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'CronJob', 'backup', 'default', {
        metadata: { annotations: { 'p9r.io/suppress-rules': 'REL-004' } },
        spec: { schedule: '0 * * * *' },
      });
    });
    expect(REL_004.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// Title plural branches
// ---------------------------------------------------------------------------

describe('REL title plural branches', () => {
  it('REL_001 title — plural', () => {
    const result = {
      status: 'warn' as const,
      affectedResources: [
        { kind: 'Deployment', namespace: 'default', name: 'a' },
        { kind: 'Deployment', namespace: 'default', name: 'b' },
      ],
    };
    expect(REL_001.title(result)).toContain('2 deployments');
  });

  it('REL_002 title — singular', () => {
    const result = {
      status: 'warn' as const,
      affectedResources: [
        { kind: 'Deployment', namespace: 'default', name: 'a' },
      ],
    };
    expect(REL_002.title(result)).toContain('1 deployment');
  });

  it('REL_002 title — plural', () => {
    const result = {
      status: 'warn' as const,
      affectedResources: [
        { kind: 'Deployment', namespace: 'default', name: 'a' },
        { kind: 'Deployment', namespace: 'default', name: 'b' },
      ],
    };
    expect(REL_002.title(result)).toContain('2 deployments');
  });

  it('REL_003 title — singular', () => {
    const result = {
      status: 'warn' as const,
      affectedResources: [
        { kind: 'StatefulSet', namespace: 'default', name: 'a' },
      ],
    };
    expect(REL_003.title(result)).toContain('1 StatefulSet');
  });

  it('REL_003 title — plural', () => {
    const result = {
      status: 'warn' as const,
      affectedResources: [
        { kind: 'StatefulSet', namespace: 'default', name: 'a' },
        { kind: 'StatefulSet', namespace: 'default', name: 'b' },
      ],
    };
    expect(REL_003.title(result)).toContain('2 StatefulSets');
  });

  it('REL_004 title — singular', () => {
    const result = {
      status: 'warn' as const,
      affectedResources: [{ kind: 'CronJob', namespace: 'default', name: 'a' }],
    };
    expect(REL_004.title(result)).toContain('1 CronJob');
  });

  it('REL_004 title — plural', () => {
    const result = {
      status: 'warn' as const,
      affectedResources: [
        { kind: 'CronJob', namespace: 'default', name: 'a' },
        { kind: 'CronJob', namespace: 'default', name: 'b' },
      ],
    };
    expect(REL_004.title(result)).toContain('2 CronJobs');
  });
});
