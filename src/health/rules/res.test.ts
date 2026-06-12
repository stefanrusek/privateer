/**
 * Unit tests for RES-001..005 — Resource rules (Spec 06 §6.2).
 * Table-driven: one named test per rule-table row.
 */
import { describe, it, expect } from 'vitest';
import { RES_001, RES_002, RES_003, RES_004, RES_005 } from './res.js';
import {
  makeStore,
  seedResource,
  TEST_CONTEXT,
  makePodRaw,
} from '../test-helpers.js';
import { EMPTY_CAPS } from '../types.js';

// ---------------------------------------------------------------------------
// RES-001: Pod has no CPU limit set
// ---------------------------------------------------------------------------

describe('RES-001 — Pod has no CPU limit set', () => {
  it('ok — pod has CPU limit set', () => {
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
            { name: 'main', resources: { limits: { cpu: '500m' } } },
          ],
        }),
      );
    });
    const result = RES_001.evaluate(store, TEST_CONTEXT, EMPTY_CAPS);
    expect(result.status).toBe('ok');
  });

  it('error — pod has no CPU limit', () => {
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
    const result = RES_001.evaluate(store, TEST_CONTEXT, EMPTY_CAPS);
    expect(result.status).toBe('error');
    expect(result.affectedResources).toHaveLength(1);
    expect(result.affectedResources[0]?.name).toBe('api');
  });

  it('error — one container has CPU limit, another does not', () => {
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
            { name: 'main', resources: { limits: { cpu: '500m' } } },
            { name: 'sidecar' },
          ],
        }),
      );
    });
    const result = RES_001.evaluate(store, TEST_CONTEXT, EMPTY_CAPS);
    expect(result.status).toBe('error');
  });

  it('suppressed — pod has suppress annotation for RES-001', () => {
    const store = makeStore((s, ctx) => {
      seedResource(
        s,
        ctx,
        'Pod',
        'api',
        'default',
        makePodRaw({
          name: 'api',
          annotations: { 'p9r.io/suppress-rules': 'RES-001' },
          containers: [{ name: 'main' }],
        }),
      );
    });
    const result = RES_001.evaluate(store, TEST_CONTEXT, EMPTY_CAPS);
    expect(result.status).toBe('ok');
    expect(result.affectedResources).toHaveLength(0);
  });

  it('error — pod with null namespace (namespace ?? "" fallback in toAffected)', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'Pod', 'api', null, {
        spec: { containers: [{ name: 'main' }] }, // No CPU limit
      });
    });
    const result = RES_001.evaluate(store, TEST_CONTEXT, EMPTY_CAPS);
    expect(result.status).toBe('error');
    expect(result.affectedResources[0]?.namespace).toBe('');
  });

  it('ok — pod with no containers (spec.containers not array, getPodContainers fallback)', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'Pod', 'api', 'default', {
        spec: {}, // No containers array
      });
    });
    // No containers means no missing CPU limit — ok
    expect(RES_001.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });

  it('title — singular when 1 pod affected', () => {
    const result = {
      status: 'error' as const,
      affectedResources: [{ kind: 'Pod', namespace: 'default', name: 'api' }],
    };
    expect(RES_001.title(result)).toContain('1 pod');
  });

  it('title — plural when multiple pods affected', () => {
    const result = {
      status: 'error' as const,
      affectedResources: [
        { kind: 'Pod', namespace: 'default', name: 'a' },
        { kind: 'Pod', namespace: 'default', name: 'b' },
      ],
    };
    expect(RES_001.title(result)).toContain('2 pods');
  });
});

// ---------------------------------------------------------------------------
// RES-002: Pod has no memory limit set
// ---------------------------------------------------------------------------

describe('RES-002 — Pod has no memory limit set', () => {
  it('ok — pod has memory limit set', () => {
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
            { name: 'main', resources: { limits: { memory: '256Mi' } } },
          ],
        }),
      );
    });
    const result = RES_002.evaluate(store, TEST_CONTEXT, EMPTY_CAPS);
    expect(result.status).toBe('ok');
  });

  it('error — pod has no memory limit', () => {
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
            { name: 'main', resources: { limits: { cpu: '500m' } } },
          ],
        }),
      );
    });
    const result = RES_002.evaluate(store, TEST_CONTEXT, EMPTY_CAPS);
    expect(result.status).toBe('error');
  });

  it('suppressed — skipped for annotated pod', () => {
    const store = makeStore((s, ctx) => {
      seedResource(
        s,
        ctx,
        'Pod',
        'api',
        'default',
        makePodRaw({
          name: 'api',
          annotations: { 'p9r.io/suppress-rules': 'RES-002' },
          containers: [{ name: 'main' }],
        }),
      );
    });
    const result = RES_002.evaluate(store, TEST_CONTEXT, EMPTY_CAPS);
    expect(result.status).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// RES-003: Pod has no CPU request set
// ---------------------------------------------------------------------------

describe('RES-003 — Pod has no CPU request set', () => {
  it('ok — pod has CPU request set', () => {
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
            { name: 'main', resources: { requests: { cpu: '100m' } } },
          ],
        }),
      );
    });
    const result = RES_003.evaluate(store, TEST_CONTEXT, EMPTY_CAPS);
    expect(result.status).toBe('ok');
  });

  it('warn — pod has no CPU request', () => {
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
    const result = RES_003.evaluate(store, TEST_CONTEXT, EMPTY_CAPS);
    expect(result.status).toBe('warn');
  });

  it('ok — empty store has no pods', () => {
    const store = makeStore();
    const result = RES_003.evaluate(store, TEST_CONTEXT, EMPTY_CAPS);
    expect(result.status).toBe('ok');
  });

  it('ok — suppressed pod skipped', () => {
    const store = makeStore((s, ctx) => {
      seedResource(
        s,
        ctx,
        'Pod',
        'api',
        'default',
        makePodRaw({
          name: 'api',
          annotations: { 'p9r.io/suppress-rules': 'RES-003' },
          containers: [{ name: 'main' }],
        }),
      );
    });
    expect(RES_003.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// RES-004: Pod has no memory request set
// ---------------------------------------------------------------------------

describe('RES-004 — Pod has no memory request set', () => {
  it('ok — pod has memory request set', () => {
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
            { name: 'main', resources: { requests: { memory: '128Mi' } } },
          ],
        }),
      );
    });
    const result = RES_004.evaluate(store, TEST_CONTEXT, EMPTY_CAPS);
    expect(result.status).toBe('ok');
  });

  it('warn — pod has no memory request', () => {
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
            { name: 'main', resources: { requests: { cpu: '100m' } } },
          ],
        }),
      );
    });
    const result = RES_004.evaluate(store, TEST_CONTEXT, EMPTY_CAPS);
    expect(result.status).toBe('warn');
  });

  it('ok — suppressed pod skipped', () => {
    const store = makeStore((s, ctx) => {
      seedResource(
        s,
        ctx,
        'Pod',
        'api',
        'default',
        makePodRaw({
          name: 'api',
          annotations: { 'p9r.io/suppress-rules': 'RES-004' },
          containers: [{ name: 'main' }],
        }),
      );
    });
    expect(RES_004.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// RES-005: CPU limit is more than 4x CPU request
// ---------------------------------------------------------------------------

describe('RES-005 — CPU limit more than 4x CPU request', () => {
  it('ok — CPU limit exactly 4x request (boundary, not over)', () => {
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
              resources: { requests: { cpu: '100m' }, limits: { cpu: '400m' } },
            },
          ],
        }),
      );
    });
    const result = RES_005.evaluate(store, TEST_CONTEXT, EMPTY_CAPS);
    expect(result.status).toBe('ok');
  });

  it('warn — CPU limit is 5x the request (over boundary)', () => {
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
              resources: { requests: { cpu: '100m' }, limits: { cpu: '500m' } },
            },
          ],
        }),
      );
    });
    const result = RES_005.evaluate(store, TEST_CONTEXT, EMPTY_CAPS);
    expect(result.status).toBe('warn');
  });

  it('ok — no CPU limit set (not applicable to this rule)', () => {
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
            { name: 'main', resources: { requests: { cpu: '100m' } } },
          ],
        }),
      );
    });
    const result = RES_005.evaluate(store, TEST_CONTEXT, EMPTY_CAPS);
    expect(result.status).toBe('ok');
  });

  it('ok — no CPU request set (cannot compute ratio)', () => {
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
            { name: 'main', resources: { limits: { cpu: '1000m' } } },
          ],
        }),
      );
    });
    const result = RES_005.evaluate(store, TEST_CONTEXT, EMPTY_CAPS);
    expect(result.status).toBe('ok');
  });

  it('warn — whole-number CPU units: limit 2 cores, request 100m (20x)', () => {
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
              resources: { requests: { cpu: '100m' }, limits: { cpu: '2' } },
            },
          ],
        }),
      );
    });
    const result = RES_005.evaluate(store, TEST_CONTEXT, EMPTY_CAPS);
    expect(result.status).toBe('warn');
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
          annotations: { 'p9r.io/suppress-rules': 'RES-005' },
          containers: [
            {
              name: 'main',
              resources: {
                requests: { cpu: '100m' },
                limits: { cpu: '1000m' },
              },
            },
          ],
        }),
      );
    });
    const result = RES_005.evaluate(store, TEST_CONTEXT, EMPTY_CAPS);
    expect(result.status).toBe('ok');
  });

  it('ok — CPU request is zero (cannot compute ratio, skip)', () => {
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
              resources: { requests: { cpu: '0m' }, limits: { cpu: '1000m' } },
            },
          ],
        }),
      );
    });
    // 0m request, should not fire
    const result = RES_005.evaluate(store, TEST_CONTEXT, EMPTY_CAPS);
    expect(result.status).toBe('ok');
  });

  it('ok — unparseable CPU limit string', () => {
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
              resources: {
                requests: { cpu: '100m' },
                limits: { cpu: 'invalid-cpu' },
              },
            },
          ],
        }),
      );
    });
    expect(RES_005.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });

  it('ok — CPU request is unparseable m-suffix value (NaN path in parseCpuMillicores)', () => {
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
              // 'abcm' ends with 'm', Number('abc') = NaN → parseCpuMillicores returns null
              resources: {
                requests: { cpu: 'abcm' },
                limits: { cpu: '1000m' },
              },
            },
          ],
        }),
      );
    });
    expect(RES_005.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// RES title plural branches
// ---------------------------------------------------------------------------

describe('RES title plural branches', () => {
  it('RES_001 title — plural', () => {
    const result = {
      status: 'error' as const,
      affectedResources: [
        { kind: 'Pod', namespace: 'default', name: 'a' },
        { kind: 'Pod', namespace: 'default', name: 'b' },
      ],
    };
    expect(RES_001.title(result)).toContain('2 pods');
  });

  it('RES_002 title — singular', () => {
    const result = {
      status: 'error' as const,
      affectedResources: [{ kind: 'Pod', namespace: 'default', name: 'a' }],
    };
    expect(RES_002.title(result)).toContain('1 pod');
  });

  it('RES_002 title — plural', () => {
    const result = {
      status: 'error' as const,
      affectedResources: [
        { kind: 'Pod', namespace: 'default', name: 'a' },
        { kind: 'Pod', namespace: 'default', name: 'b' },
      ],
    };
    expect(RES_002.title(result)).toContain('2 pods');
  });

  it('RES_003 title — singular', () => {
    const result = {
      status: 'warn' as const,
      affectedResources: [{ kind: 'Pod', namespace: 'default', name: 'a' }],
    };
    expect(RES_003.title(result)).toContain('1 pod');
  });

  it('RES_003 title — plural', () => {
    const result = {
      status: 'warn' as const,
      affectedResources: [
        { kind: 'Pod', namespace: 'default', name: 'a' },
        { kind: 'Pod', namespace: 'default', name: 'b' },
      ],
    };
    expect(RES_003.title(result)).toContain('2 pods');
  });

  it('RES_004 title — singular', () => {
    const result = {
      status: 'warn' as const,
      affectedResources: [{ kind: 'Pod', namespace: 'default', name: 'a' }],
    };
    expect(RES_004.title(result)).toContain('1 pod');
  });

  it('RES_004 title — plural', () => {
    const result = {
      status: 'warn' as const,
      affectedResources: [
        { kind: 'Pod', namespace: 'default', name: 'a' },
        { kind: 'Pod', namespace: 'default', name: 'b' },
      ],
    };
    expect(RES_004.title(result)).toContain('2 pods');
  });

  it('RES_005 title — singular', () => {
    const result = {
      status: 'warn' as const,
      affectedResources: [{ kind: 'Pod', namespace: 'default', name: 'a' }],
    };
    expect(RES_005.title(result)).toContain('1 pod');
  });

  it('RES_005 title — plural', () => {
    const result = {
      status: 'warn' as const,
      affectedResources: [
        { kind: 'Pod', namespace: 'default', name: 'a' },
        { kind: 'Pod', namespace: 'default', name: 'b' },
      ],
    };
    expect(RES_005.title(result)).toContain('2 pods');
  });
});
