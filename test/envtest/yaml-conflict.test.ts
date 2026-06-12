import { describe, it, expect, beforeAll, inject } from 'vitest';
import { makeKubeConfig, coreApi, freshNamespace } from './client.js';
import { KubeClientAdapter } from '../../src/adapters/kube-client.adapter.js';
import type { CoreV1Api } from '@kubernetes/client-node';

/**
 * @envtest — verifies that KubeClientAdapter.replace() returns a typed
 * `conflict` error (409) when the caller's resourceVersion is stale (Spec 04
 * §6.3, Spec 08 §6.4).
 *
 * This is the real-API proof that the DiffView conflict-detection path works
 * end-to-end against a live kube-apiserver.
 */
describe('YAML conflict detection @envtest', () => {
  let adapter: KubeClientAdapter;
  let api: CoreV1Api;
  let ns: string;

  beforeAll(async () => {
    const server = inject('envtestServer');
    const token = inject('envtestToken');
    const kc = makeKubeConfig(server, token);
    adapter = new KubeClientAdapter(kc);
    api = coreApi(server, token);
    ns = await freshNamespace(api);
  });

  it('replace returns conflict (409) on stale resourceVersion', async () => {
    // 1. Create a ConfigMap and capture the initial resourceVersion.
    await api.createNamespacedConfigMap({
      namespace: ns,
      body: {
        metadata: { name: 'conflict-test' },
        data: { env: 'staging' },
      },
    });

    const v1Result = await adapter.get('ConfigMap', 'conflict-test', ns);
    expect(v1Result.ok).toBe(true);
    if (!v1Result.ok) {
      return;
    }
    const v1 = v1Result.value;
    const v1Version = v1.metadata?.resourceVersion;
    expect(typeof v1Version).toBe('string');

    // 2. Advance the server by performing a successful replace.
    const v2 = { ...v1, data: { env: 'updated' } };
    const v2Result = await adapter.replace(v2);
    expect(v2Result.ok).toBe(true);

    // 3. Attempt to replace using the stale v1 resourceVersion — should 409.
    const stale = { ...v1, data: { env: 'stale-edit' } };
    const conflictResult = await adapter.replace(stale);

    expect(conflictResult.ok).toBe(false);
    if (!conflictResult.ok) {
      expect(conflictResult.error.kind).toBe('conflict');
      expect(conflictResult.error.statusCode).toBe(409);
    }
  });

  it('replace succeeds after re-fetching the latest resourceVersion', async () => {
    // 1. Create and immediately update to bump the server version.
    await api.createNamespacedConfigMap({
      namespace: ns,
      body: {
        metadata: { name: 'conflict-refetch' },
        data: { tier: 'frontend' },
      },
    });

    const v1Result = await adapter.get('ConfigMap', 'conflict-refetch', ns);
    expect(v1Result.ok).toBe(true);
    if (!v1Result.ok) {
      return;
    }

    // Bump the server version via a direct replace.
    const v2 = { ...v1Result.value, data: { tier: 'backend' } };
    const v2Result = await adapter.replace(v2);
    expect(v2Result.ok).toBe(true);
    if (!v2Result.ok) {
      return;
    }

    // 2. Re-fetch the latest and apply our change on top.
    const freshResult = await adapter.get('ConfigMap', 'conflict-refetch', ns);
    expect(freshResult.ok).toBe(true);
    if (!freshResult.ok) {
      return;
    }
    const fresh = { ...freshResult.value, data: { tier: 'production' } };
    const applyResult = await adapter.replace(fresh);

    // Should succeed now that we have the latest resourceVersion.
    expect(applyResult.ok).toBe(true);
    if (applyResult.ok) {
      const resultData = (
        applyResult.value as { data?: Record<string, string> }
      ).data;
      expect(resultData?.tier).toBe('production');
    }
  });
});
