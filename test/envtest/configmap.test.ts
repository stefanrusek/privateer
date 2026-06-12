import { describe, it, expect, beforeAll, inject, vi } from 'vitest';
import { Watch } from '@kubernetes/client-node';
import { coreApi, freshNamespace, makeKubeConfig } from './client.js';
import type { CoreV1Api } from '@kubernetes/client-node';

// @envtest — proves the harness can create, watch, and delete against a real
// API server (Spec 08 §5.3 "One @envtest proof test").
describe('envtest control plane', () => {
  let api: CoreV1Api;
  let server: string;
  let token: string;
  let ns: string;

  beforeAll(async () => {
    server = inject('envtestServer');
    token = inject('envtestToken');
    api = coreApi(server, token);
    ns = await freshNamespace(api);
  });

  it('serves the built-in namespaces', async () => {
    const list = await api.listNamespace();
    const names = list.items.map((n) => n.metadata?.name);
    expect(names).toContain('default');
    expect(names).toContain('kube-system');
  });

  it('creates and reads back a ConfigMap', async () => {
    await api.createNamespacedConfigMap({
      namespace: ns,
      body: { metadata: { name: 'cfg' }, data: { hello: 'world' } },
    });
    const read = await api.readNamespacedConfigMap({
      name: 'cfg',
      namespace: ns,
    });
    expect(read.data?.hello).toBe('world');
  });

  it('observes ADDED then DELETED via a watch stream', async () => {
    const events: string[] = [];
    const watch = new Watch(makeKubeConfig(server, token));
    const req = await watch.watch(
      `/api/v1/namespaces/${ns}/configmaps`,
      {},
      (type, obj: { metadata?: { name?: string } }) => {
        if (obj.metadata?.name === 'watched') {
          events.push(type);
        }
      },
      () => undefined,
    );

    await api.createNamespacedConfigMap({
      namespace: ns,
      body: { metadata: { name: 'watched' } },
    });
    await api.deleteNamespacedConfigMap({ name: 'watched', namespace: ns });

    await vi.waitFor(
      () => {
        expect(events).toContain('ADDED');
        expect(events).toContain('DELETED');
      },
      { timeout: 10_000, interval: 100 },
    );
    req.abort();
  });
});
