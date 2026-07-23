/**
 * Unit tests for OBS-001..003, OBS-010..012 — Observability rules (Spec 06 §6.2, §6.6).
 */
import { describe, it, expect } from 'vitest';
import { OBS_001, OBS_002, OBS_003, OBS_010, OBS_011, OBS_012 } from './obs.js';
import {
  makeStore,
  seedResource,
  TEST_CONTEXT,
  makePodRaw,
} from '../test-helpers.js';
import { EMPTY_CAPS } from '../types.js';
import type { RuleCaps } from '../types.js';

const WITH_METRICS: RuleCaps = {
  ...EMPTY_CAPS,
  kafkaExporter: true,
};

const WITH_PROMETHEUS: RuleCaps = {
  ...EMPTY_CAPS,
  prometheusConnected: true,
};

// ---------------------------------------------------------------------------
// OBS-001: Pod has no liveness probe
// ---------------------------------------------------------------------------

describe('OBS-001 — Pod has no liveness probe', () => {
  it('ok — pod has liveness probe', () => {
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
              livenessProbe: { httpGet: { path: '/health', port: 8080 } },
            },
          ],
        }),
      );
    });
    expect(OBS_001.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });

  it('warn — pod has no liveness probe', () => {
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
    const result = OBS_001.evaluate(store, TEST_CONTEXT, EMPTY_CAPS);
    expect(result.status).toBe('warn');
    expect(result.affectedResources[0]?.name).toBe('api');
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
          annotations: { 'p9r.io/suppress-rules': 'OBS-001' },
          containers: [{ name: 'main' }],
        }),
      );
    });
    expect(OBS_001.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });

  it('ok — empty store', () => {
    expect(OBS_001.evaluate(makeStore(), TEST_CONTEXT, EMPTY_CAPS).status).toBe(
      'ok',
    );
  });

  it('ok — pod with no containers (spec.containers not an array)', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'Pod', 'api', 'default', {
        spec: {},
      });
    });
    // No containers means no missing probe — ok
    expect(OBS_001.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });

  it('warn — pod with null namespace (cluster-scoped, namespace ?? "" fallback)', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'Pod', 'api', null, {
        spec: { containers: [{ name: 'main' }] },
      });
    });
    const result = OBS_001.evaluate(store, TEST_CONTEXT, EMPTY_CAPS);
    expect(result.status).toBe('warn');
    expect(result.affectedResources[0]?.namespace).toBe('');
  });
});

// ---------------------------------------------------------------------------
// OBS-002: Pod has no readiness probe
// ---------------------------------------------------------------------------

describe('OBS-002 — Pod has no readiness probe', () => {
  it('ok — pod has readiness probe', () => {
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
              readinessProbe: { httpGet: { path: '/ready', port: 8080 } },
            },
          ],
        }),
      );
    });
    expect(OBS_002.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });

  it('warn — pod has no readiness probe', () => {
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
    expect(OBS_002.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe(
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
          annotations: { 'p9r.io/suppress-rules': 'OBS-002' },
          containers: [{ name: 'main' }],
        }),
      );
    });
    expect(OBS_002.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// OBS-003: Pod has no startup probe
// ---------------------------------------------------------------------------

describe('OBS-003 — Pod has no startup probe', () => {
  it('ok — pod has startup probe', () => {
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
              startupProbe: { httpGet: { path: '/startup', port: 8080 } },
            },
          ],
        }),
      );
    });
    expect(OBS_003.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });

  it('warn — pod has no startup probe', () => {
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
    expect(OBS_003.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe(
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
          annotations: { 'p9r.io/suppress-rules': 'OBS-003' },
          containers: [{ name: 'main' }],
        }),
      );
    });
    expect(OBS_003.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// OBS-010: No Prometheus found in cluster
// ---------------------------------------------------------------------------

describe('OBS-010 — No Prometheus found', () => {
  it('warn — prometheus not connected', () => {
    const result = OBS_010.evaluate(makeStore(), TEST_CONTEXT, EMPTY_CAPS);
    expect(result.status).toBe('warn');
  });

  it('warn — exporter capabilities present but prometheus not connected (P9R-0008: proxies must not mask a genuine no-discovery outcome)', () => {
    const result = OBS_010.evaluate(makeStore(), TEST_CONTEXT, WITH_METRICS);
    expect(result.status).toBe('warn');
  });

  it('warn — strimziJmx capability present but prometheus not connected', () => {
    const caps: RuleCaps = { ...EMPTY_CAPS, strimziJmx: true };
    const result = OBS_010.evaluate(makeStore(), TEST_CONTEXT, caps);
    expect(result.status).toBe('warn');
  });

  it('ok — prometheusConnected is true (real discovery outcome)', () => {
    const result = OBS_010.evaluate(makeStore(), TEST_CONTEXT, WITH_PROMETHEUS);
    expect(result.status).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// OBS-011: No ServiceMonitors defined
// ---------------------------------------------------------------------------

describe('OBS-011 — No ServiceMonitors defined', () => {
  it('skipped — no metrics capabilities (Prometheus not present)', () => {
    const result = OBS_011.evaluate(makeStore(), TEST_CONTEXT, EMPTY_CAPS);
    expect(result.status).toBe('skipped');
  });

  it('warn — Prometheus present but no ServiceMonitors', () => {
    const result = OBS_011.evaluate(makeStore(), TEST_CONTEXT, WITH_METRICS);
    expect(result.status).toBe('warn');
  });

  it('ok — ServiceMonitors defined and Prometheus present', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'ServiceMonitor', 'app-monitor', 'monitoring', {
        spec: { endpoints: [] },
      });
    });
    const result = OBS_011.evaluate(store, TEST_CONTEXT, WITH_METRICS);
    expect(result.status).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// OBS-012: Pod has no Prometheus scrape annotation
// ---------------------------------------------------------------------------

describe('OBS-012 — Pod has no scrape annotation', () => {
  it('ok — pod has prometheus.io/scrape: true', () => {
    const store = makeStore((s, ctx) => {
      seedResource(
        s,
        ctx,
        'Pod',
        'api',
        'default',
        makePodRaw({
          name: 'api',
          annotations: { 'prometheus.io/scrape': 'true' },
          containers: [{ name: 'main' }],
        }),
      );
    });
    expect(OBS_012.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });

  it('warn — pod has no scrape annotation', () => {
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
    const result = OBS_012.evaluate(store, TEST_CONTEXT, EMPTY_CAPS);
    expect(result.status).toBe('warn');
    expect(result.affectedResources[0]?.name).toBe('api');
  });

  it('warn — pod has scrape annotation set to false', () => {
    const store = makeStore((s, ctx) => {
      seedResource(
        s,
        ctx,
        'Pod',
        'api',
        'default',
        makePodRaw({
          name: 'api',
          annotations: { 'prometheus.io/scrape': 'false' },
          containers: [{ name: 'main' }],
        }),
      );
    });
    expect(OBS_012.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe(
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
          annotations: { 'p9r.io/suppress-rules': 'OBS-012' },
          containers: [{ name: 'main' }],
        }),
      );
    });
    expect(OBS_012.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });

  it('ok — empty store', () => {
    expect(OBS_012.evaluate(makeStore(), TEST_CONTEXT, EMPTY_CAPS).status).toBe(
      'ok',
    );
  });

  it('warn — pod with null namespace (namespace ?? "" fallback)', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'Pod', 'api', null, {
        spec: { containers: [{ name: 'main' }] },
        metadata: { annotations: {} },
      });
    });
    const result = OBS_012.evaluate(store, TEST_CONTEXT, EMPTY_CAPS);
    expect(result.status).toBe('warn');
    expect(result.affectedResources[0]?.namespace).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Title plural branches for all OBS rules
// ---------------------------------------------------------------------------

describe('OBS title plural branches', () => {
  it('OBS_001 title — singular', () => {
    const result = {
      status: 'warn' as const,
      affectedResources: [{ kind: 'Pod', namespace: 'default', name: 'a' }],
    };
    expect(OBS_001.title(result)).toContain('1 pod');
  });

  it('OBS_001 title — plural', () => {
    const result = {
      status: 'warn' as const,
      affectedResources: [
        { kind: 'Pod', namespace: 'default', name: 'a' },
        { kind: 'Pod', namespace: 'default', name: 'b' },
      ],
    };
    expect(OBS_001.title(result)).toContain('2 pods');
  });

  it('OBS_002 title — singular', () => {
    const result = {
      status: 'warn' as const,
      affectedResources: [{ kind: 'Pod', namespace: 'default', name: 'a' }],
    };
    expect(OBS_002.title(result)).toContain('1 pod');
  });

  it('OBS_002 title — plural', () => {
    const result = {
      status: 'warn' as const,
      affectedResources: [
        { kind: 'Pod', namespace: 'default', name: 'a' },
        { kind: 'Pod', namespace: 'default', name: 'b' },
      ],
    };
    expect(OBS_002.title(result)).toContain('2 pods');
  });

  it('OBS_003 title — singular', () => {
    const result = {
      status: 'warn' as const,
      affectedResources: [{ kind: 'Pod', namespace: 'default', name: 'a' }],
    };
    expect(OBS_003.title(result)).toContain('1 pod');
  });

  it('OBS_003 title — plural', () => {
    const result = {
      status: 'warn' as const,
      affectedResources: [
        { kind: 'Pod', namespace: 'default', name: 'a' },
        { kind: 'Pod', namespace: 'default', name: 'b' },
      ],
    };
    expect(OBS_003.title(result)).toContain('2 pods');
  });

  it('OBS_010 title — returns fixed string', () => {
    const result = { status: 'warn' as const, affectedResources: [] };
    expect(OBS_010.title(result)).toContain('No Prometheus');
  });

  it('OBS_011 title — returns fixed string', () => {
    const result = { status: 'warn' as const, affectedResources: [] };
    expect(OBS_011.title(result)).toContain('ServiceMonitors');
  });

  it('OBS_012 title — singular', () => {
    const result = {
      status: 'warn' as const,
      affectedResources: [{ kind: 'Pod', namespace: 'default', name: 'a' }],
    };
    expect(OBS_012.title(result)).toContain('1 pod');
  });

  it('OBS_012 title — plural', () => {
    const result = {
      status: 'warn' as const,
      affectedResources: [
        { kind: 'Pod', namespace: 'default', name: 'a' },
        { kind: 'Pod', namespace: 'default', name: 'b' },
      ],
    };
    expect(OBS_012.title(result)).toContain('2 pods');
  });
});
