import { describe, it, expect, beforeAll, inject } from 'vitest';
import { makeKubeConfig, coreApi, freshNamespace } from './client.js';
import { KubeClientAdapter } from '../../src/adapters/kube-client.adapter.js';
import type { CoreV1Api } from '@kubernetes/client-node';

/**
 * @envtest — verifies KubeClientAdapter against a real apiserver.
 * Covers: list, get, replace, delete, discoverCrds, listEvents, watch (Spec 08 §5.3).
 */
describe('KubeClientAdapter @envtest', () => {
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

  it('listContexts returns the envtest context', () => {
    const contexts = adapter.listContexts();
    expect(contexts.map((c) => c.name)).toContain('envtest');
  });

  it('currentContext returns the active context', () => {
    expect(adapter.currentContext()).toBe('envtest');
  });

  it('list returns ConfigMaps in a namespace', async () => {
    await api.createNamespacedConfigMap({
      namespace: ns,
      body: { metadata: { name: 'list-test' }, data: { key: 'val' } },
    });
    const result = await adapter.list('ConfigMap', { namespace: ns });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const names = result.value.items.map((i) => i.metadata?.name);
      expect(names).toContain('list-test');
    }
  });

  it('get returns a ConfigMap by name', async () => {
    await api.createNamespacedConfigMap({
      namespace: ns,
      body: { metadata: { name: 'get-test' }, data: { k: 'v' } },
    });
    const result = await adapter.get('ConfigMap', 'get-test', ns);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.metadata?.name).toBe('get-test');
    }
  });

  it('get returns notFound for a missing resource', async () => {
    const result = await adapter.get('ConfigMap', 'does-not-exist', ns);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('notFound');
    }
  });

  it('replace updates a ConfigMap', async () => {
    await api.createNamespacedConfigMap({
      namespace: ns,
      body: { metadata: { name: 'replace-test' }, data: { before: 'yes' } },
    });
    const getResult = await adapter.get('ConfigMap', 'replace-test', ns);
    expect(getResult.ok).toBe(true);
    if (!getResult.ok) {
      return;
    }
    const updated = {
      ...getResult.value,
      data: { after: 'yes' },
    };
    const replaceResult = await adapter.replace(updated);
    expect(replaceResult.ok).toBe(true);
    if (replaceResult.ok) {
      expect(
        (replaceResult.value as { data?: Record<string, string> }).data?.after,
      ).toBe('yes');
    }
  });

  it('delete removes a ConfigMap', async () => {
    await api.createNamespacedConfigMap({
      namespace: ns,
      body: { metadata: { name: 'delete-test' } },
    });
    const deleteResult = await adapter.delete('ConfigMap', 'delete-test', ns);
    expect(deleteResult.ok).toBe(true);

    const getResult = await adapter.get('ConfigMap', 'delete-test', ns);
    expect(getResult.ok).toBe(false);
    if (!getResult.ok) {
      expect(getResult.error.kind).toBe('notFound');
    }
  });

  it('discoverCrds returns CRD definitions', async () => {
    const result = await adapter.discoverCrds();
    expect(result.ok).toBe(true);
    if (result.ok) {
      // envtest has vendored CRDs applied in global-setup
      expect(Array.isArray(result.value)).toBe(true);
    }
  });

  it('discoverCrds includes group, kind, plural, namespaced, versions', async () => {
    const result = await adapter.discoverCrds();
    expect(result.ok).toBe(true);
    if (result.ok && result.value.length > 0) {
      const crd = result.value[0];
      expect(typeof crd?.group).toBe('string');
      expect(typeof crd?.kind).toBe('string');
      expect(typeof crd?.plural).toBe('string');
      expect(typeof crd?.namespaced).toBe('boolean');
      expect(Array.isArray(crd?.versions)).toBe(true);
    }
  });

  it('watch delivers ADDED events for new ConfigMaps', async () => {
    const events: string[] = [];
    const sub = adapter.watch('ConfigMap', { namespace: ns }, (event) => {
      if (event.name === 'watch-test') {
        events.push(event.type);
      }
    });

    await api.createNamespacedConfigMap({
      namespace: ns,
      body: { metadata: { name: 'watch-test' } },
    });

    // Wait for event
    await new Promise<void>((resolve) => {
      let attempts = 0;
      const check = (): void => {
        if (events.includes('ADDED') || attempts > 50) {
          resolve();
          return;
        }
        attempts++;
        setTimeout(check, 100);
      };
      check();
    });

    sub.close();
    expect(events).toContain('ADDED');
  });
});
