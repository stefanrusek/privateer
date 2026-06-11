/**
 * Unit tests for NET-001..003 — Networking rules (Spec 06 §6.4).
 */
import { describe, it, expect } from 'vitest';
import { NET_001, NET_002, NET_003 } from './net.js';
import { makeStore, seedResource, TEST_CONTEXT } from '../test-helpers.js';
import { EMPTY_CAPS } from '../types.js';

// ---------------------------------------------------------------------------
// NET-001: LoadBalancer Service in namespace with no NetworkPolicy
// ---------------------------------------------------------------------------

describe('NET-001 — LoadBalancer Service without NetworkPolicy', () => {
  it('ok — LoadBalancer in namespace with NetworkPolicy', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'Service', 'my-lb', 'default', {
        spec: { type: 'LoadBalancer', ports: [{ port: 80 }] },
      });
      seedResource(s, ctx, 'NetworkPolicy', 'default-deny', 'default', {
        spec: { podSelector: {} },
      });
    });
    expect(NET_001.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });

  it('warn — LoadBalancer in namespace with no NetworkPolicy', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'Service', 'my-lb', 'default', {
        spec: { type: 'LoadBalancer', ports: [{ port: 80 }] },
      });
    });
    const result = NET_001.evaluate(store, TEST_CONTEXT, EMPTY_CAPS);
    expect(result.status).toBe('warn');
    expect(result.affectedResources[0]?.name).toBe('my-lb');
  });

  it('ok — ClusterIP service (not LoadBalancer) ignored', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'Service', 'my-svc', 'default', {
        spec: { type: 'ClusterIP', ports: [{ port: 80 }] },
      });
    });
    expect(NET_001.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });

  it('suppressed — annotated service skipped', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'Service', 'my-lb', 'default', {
        metadata: { annotations: { 'p9r.io/suppress-rules': 'NET-001' } },
        spec: { type: 'LoadBalancer' },
      });
    });
    expect(NET_001.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });

  it('ok — empty store', () => {
    expect(NET_001.evaluate(makeStore(), TEST_CONTEXT, EMPTY_CAPS).status).toBe(
      'ok',
    );
  });

  it('warn — LoadBalancer service with null namespace (namespace ?? "" fallback)', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'Service', 'my-lb', null, {
        spec: { type: 'LoadBalancer' },
      });
    });
    const result = NET_001.evaluate(store, TEST_CONTEXT, EMPTY_CAPS);
    expect(result.status).toBe('warn');
    expect(result.affectedResources[0]?.namespace).toBe('');
  });
});

// ---------------------------------------------------------------------------
// NET-002: Ingress has no TLS configured
// ---------------------------------------------------------------------------

describe('NET-002 — Ingress has no TLS configured', () => {
  it('ok — Ingress has TLS configured', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'Ingress', 'my-ingress', 'default', {
        spec: {
          tls: [{ hosts: ['example.com'], secretName: 'tls-secret' }],
          rules: [],
        },
      });
    });
    expect(NET_002.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });

  it('warn — Ingress has no TLS', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'Ingress', 'my-ingress', 'default', {
        spec: { rules: [{ host: 'example.com' }] },
      });
    });
    const result = NET_002.evaluate(store, TEST_CONTEXT, EMPTY_CAPS);
    expect(result.status).toBe('warn');
    expect(result.affectedResources[0]?.name).toBe('my-ingress');
  });

  it('warn — Ingress has empty TLS array', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'Ingress', 'my-ingress', 'default', {
        spec: { tls: [], rules: [] },
      });
    });
    expect(NET_002.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe(
      'warn',
    );
  });

  it('suppressed — annotated ingress skipped', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'Ingress', 'my-ingress', 'default', {
        metadata: { annotations: { 'p9r.io/suppress-rules': 'NET-002' } },
        spec: { rules: [] },
      });
    });
    expect(NET_002.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// NET-003: Ingress references missing Service
// ---------------------------------------------------------------------------

describe('NET-003 — Ingress references missing Service', () => {
  it('ok — Ingress backend Service exists', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'Service', 'my-svc', 'default', {
        spec: { type: 'ClusterIP' },
      });
      seedResource(s, ctx, 'Ingress', 'my-ingress', 'default', {
        spec: {
          rules: [
            {
              host: 'example.com',
              http: {
                paths: [
                  {
                    path: '/',
                    backend: {
                      service: { name: 'my-svc', port: { number: 80 } },
                    },
                  },
                ],
              },
            },
          ],
        },
      });
    });
    expect(NET_003.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });

  it('warn — Ingress references missing Service', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'Ingress', 'my-ingress', 'default', {
        spec: {
          rules: [
            {
              http: {
                paths: [
                  {
                    path: '/',
                    backend: {
                      service: { name: 'missing-svc', port: { number: 80 } },
                    },
                  },
                ],
              },
            },
          ],
        },
      });
    });
    const result = NET_003.evaluate(store, TEST_CONTEXT, EMPTY_CAPS);
    expect(result.status).toBe('warn');
    expect(result.affectedResources[0]?.name).toBe('my-ingress');
  });

  it('warn — Ingress default backend references missing Service', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'Ingress', 'my-ingress', 'default', {
        spec: {
          defaultBackend: {
            service: { name: 'missing-svc', port: { number: 80 } },
          },
          rules: [],
        },
      });
    });
    expect(NET_003.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe(
      'warn',
    );
  });

  it('ok — Ingress has no backend (just TLS/host config)', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'Ingress', 'my-ingress', 'default', {
        spec: {
          tls: [{ hosts: ['example.com'] }],
          rules: [{ host: 'example.com' }],
        },
      });
    });
    expect(NET_003.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });

  it('ok — Ingress spec.rules is not an array (fallback to empty)', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'Ingress', 'my-ingress', 'default', {
        spec: {
          // rules is absent (falsy), exercising the [] fallback branch
        },
      });
    });
    expect(NET_003.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });

  it('warn — Ingress with null namespace references missing Service', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'Ingress', 'cluster-ingress', null, {
        spec: {
          defaultBackend: { service: { name: 'missing-svc' } },
          rules: [],
        },
      });
    });
    const result = NET_003.evaluate(store, TEST_CONTEXT, EMPTY_CAPS);
    expect(result.status).toBe('warn');
    expect(result.affectedResources[0]?.namespace).toBe('');
  });

  it('ok — Ingress rule path with no backend field (backend ?? {} fallback)', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'Ingress', 'my-ingress', 'default', {
        spec: {
          rules: [
            {
              http: {
                paths: [
                  { path: '/' }, // no backend field
                ],
              },
            },
          ],
        },
      });
    });
    expect(NET_003.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });

  it('suppressed — annotated ingress skipped', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'Ingress', 'my-ingress', 'default', {
        metadata: { annotations: { 'p9r.io/suppress-rules': 'NET-003' } },
        spec: {
          rules: [
            {
              http: {
                paths: [
                  {
                    backend: {
                      service: { name: 'missing', port: { number: 80 } },
                    },
                  },
                ],
              },
            },
          ],
        },
      });
    });
    expect(NET_003.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });

  it('ok — Ingress rule path has backend with no service name', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'Ingress', 'my-ingress', 'default', {
        spec: {
          rules: [
            {
              http: {
                paths: [
                  {
                    path: '/',
                    backend: {
                      resource: {
                        apiGroup: 'storage.k8s.io',
                        kind: 'StorageBucket',
                        name: 'bucket',
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
      });
    });
    // backend has no service.name, so no missing service check
    expect(NET_003.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// NET title plural branches
// ---------------------------------------------------------------------------

describe('NET title plural branches', () => {
  it('NET_001 title — singular', () => {
    const result = {
      status: 'warn' as const,
      affectedResources: [
        { kind: 'Service', namespace: 'default', name: 'lb' },
      ],
    };
    expect(NET_001.title(result)).toContain('1 LoadBalancer');
  });

  it('NET_001 title — plural', () => {
    const result = {
      status: 'warn' as const,
      affectedResources: [
        { kind: 'Service', namespace: 'default', name: 'lb1' },
        { kind: 'Service', namespace: 'default', name: 'lb2' },
      ],
    };
    expect(NET_001.title(result)).toContain('2 LoadBalancer');
  });

  it('NET_002 title — singular', () => {
    const result = {
      status: 'warn' as const,
      affectedResources: [{ kind: 'Ingress', namespace: 'default', name: 'i' }],
    };
    expect(NET_002.title(result)).toContain('1 Ingress');
  });

  it('NET_002 title — plural', () => {
    const result = {
      status: 'warn' as const,
      affectedResources: [
        { kind: 'Ingress', namespace: 'default', name: 'i1' },
        { kind: 'Ingress', namespace: 'default', name: 'i2' },
      ],
    };
    expect(NET_002.title(result)).toContain('2 Ingresses');
  });

  it('NET_003 title — singular', () => {
    const result = {
      status: 'warn' as const,
      affectedResources: [{ kind: 'Ingress', namespace: 'default', name: 'i' }],
    };
    expect(NET_003.title(result)).toContain('1 Ingress');
  });

  it('NET_003 title — plural', () => {
    const result = {
      status: 'warn' as const,
      affectedResources: [
        { kind: 'Ingress', namespace: 'default', name: 'i1' },
        { kind: 'Ingress', namespace: 'default', name: 'i2' },
      ],
    };
    expect(NET_003.title(result)).toContain('2 Ingresses');
  });
});
