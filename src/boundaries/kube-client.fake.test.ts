import { describe, it, expect, vi } from 'vitest';
import { FakeKubeClient } from './kube-client.fake.js';
import type { KubernetesObject, ResourceEvent } from '../core/types.js';

function pod(
  name: string,
  namespace: string,
  resourceVersion = '1',
): KubernetesObject {
  return {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name, namespace, resourceVersion, uid: `${namespace}/${name}` },
  };
}

describe('FakeKubeClient', () => {
  it('exposes default and configured contexts', () => {
    expect(new FakeKubeClient().currentContext()).toBe('fake');
    const c = new FakeKubeClient({
      contexts: [{ name: 'prod', cluster: 'c', user: 'u' }],
      currentContext: 'prod',
    });
    expect(c.currentContext()).toBe('prod');
    expect(c.listContexts()).toHaveLength(1);
  });

  it('falls back to the first context name when none is given', () => {
    const c = new FakeKubeClient({
      contexts: [{ name: 'only', cluster: 'c', user: 'u' }],
    });
    expect(c.currentContext()).toBe('only');
  });

  it('uses the literal fallback when contexts is empty', () => {
    const c = new FakeKubeClient({ contexts: [] });
    expect(c.currentContext()).toBe('fake');
  });

  it('lists seeded resources filtered by namespace', async () => {
    const c = new FakeKubeClient();
    c.seed(pod('a', 'default'));
    c.seed(pod('b', 'other'));
    const all = await c.list('Pod', {});
    expect(all.ok && all.value.items).toHaveLength(2);
    const scoped = await c.list('Pod', { namespace: 'default' });
    expect(scoped.ok && scoped.value.items).toHaveLength(1);
  });

  it('gets a seeded resource and reports notFound otherwise', async () => {
    const c = new FakeKubeClient();
    c.seed(pod('a', 'default'));
    const hit = await c.get('Pod', 'a', 'default');
    expect(hit.ok).toBe(true);
    const miss = await c.get('Pod', 'nope', 'default');
    expect(miss.ok).toBe(false);
    expect(!miss.ok && miss.error.kind).toBe('notFound');
  });

  it('surfaces forbidden kinds as 403 on get and list', async () => {
    const c = new FakeKubeClient();
    c.forbid('Secret');
    const g = await c.get('Secret', 's', 'default');
    const l = await c.list('Secret', {});
    expect(!g.ok && g.error.statusCode).toBe(403);
    expect(!l.ok && l.error.kind).toBe('forbidden');
  });

  it('replaces on matching resourceVersion and bumps it', async () => {
    const c = new FakeKubeClient();
    c.seed(pod('a', 'default', '5'));
    const res = await c.replace(pod('a', 'default', '5'));
    expect(res.ok && res.value.metadata?.resourceVersion).toBe('6');
  });

  it('returns conflict on a stale resourceVersion', async () => {
    const c = new FakeKubeClient();
    c.seed(pod('a', 'default', '7'));
    const res = await c.replace(pod('a', 'default', '5'));
    expect(!res.ok && res.error.kind).toBe('conflict');
  });

  it('returns notFound when replacing a missing resource', async () => {
    const c = new FakeKubeClient();
    const res = await c.replace(pod('ghost', 'default'));
    expect(!res.ok && res.error.kind).toBe('notFound');
  });

  it('handles cluster-scoped resources with no namespace', async () => {
    const c = new FakeKubeClient();
    const clusterRole: KubernetesObject = {
      apiVersion: 'rbac.authorization.k8s.io/v1',
      kind: 'ClusterRole',
      metadata: { name: 'admin', resourceVersion: '1' },
    };
    c.seed(clusterRole);
    const got = await c.get('ClusterRole', 'admin', null);
    expect(got.ok).toBe(true);
    const replaced = await c.replace(clusterRole);
    expect(replaced.ok && replaced.value.metadata?.resourceVersion).toBe('2');
  });

  it('seeds, retrieves and replaces a bare object with no metadata', async () => {
    const c = new FakeKubeClient();
    c.seed({});
    const got = await c.get('', '', null);
    expect(got.ok).toBe(true);
    // Both stored and incoming resourceVersion are undefined → they match.
    const replaced = await c.replace({});
    expect(replaced.ok).toBe(true);
  });

  it('deletes a resource and reports notFound on a second delete', async () => {
    const c = new FakeKubeClient();
    c.seed(pod('a', 'default'));
    expect((await c.delete('Pod', 'a', 'default')).ok).toBe(true);
    expect((await c.delete('Pod', 'a', 'default')).ok).toBe(false);
  });

  it('returns discovered CRDs', async () => {
    const crd = {
      group: 'kafka.strimzi.io',
      kind: 'Kafka',
      plural: 'kafkas',
      namespaced: true,
      versions: ['v1beta2'],
    };
    const res = await new FakeKubeClient({ crds: [crd] }).discoverCrds();
    expect(res.ok && res.value).toEqual([crd]);
  });

  it('lists events filtered by involved object and type', async () => {
    const c = new FakeKubeClient({
      events: [
        { kind: 'Event', type: 'Warning', involvedObject: { name: 'a' } },
        { kind: 'Event', type: 'Normal', involvedObject: { name: 'a' } },
        { kind: 'Event', type: 'Warning', involvedObject: { name: 'b' } },
      ],
    });
    const warningsForA = await c.listEvents({
      involvedObjectName: 'a',
      type: 'Warning',
    });
    expect(warningsForA.ok && warningsForA.value).toHaveLength(1);
    const allForA = await c.listEvents({ involvedObjectName: 'a' });
    expect(allForA.ok && allForA.value).toHaveLength(2);
  });

  it('treats an event with no involvedObject as non-matching by name', async () => {
    const c = new FakeKubeClient({
      events: [{ kind: 'Event', type: 'Warning' }],
    });
    const byName = await c.listEvents({ involvedObjectName: 'a' });
    expect(byName.ok && byName.value).toHaveLength(0);
    const unfiltered = await c.listEvents({});
    expect(unfiltered.ok && unfiltered.value).toHaveLength(1);
  });

  it('dispatches watch events to matching open watches and stamps receipt', () => {
    const c = new FakeKubeClient({ clock: () => 1234 });
    const handler = vi.fn<(event: ResourceEvent) => void>();
    c.watch('Pod', {}, handler);
    c.emit({
      type: 'ADDED',
      apiVersion: 'v1',
      kind: 'Pod',
      namespace: 'default',
      name: 'a',
      object: pod('a', 'default'),
    });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]?.[0].receivedAt).toBe(1234);
  });

  it('respects namespace scoping and kind on watch dispatch', () => {
    const c = new FakeKubeClient();
    const scoped = vi.fn();
    c.watch('Pod', { namespace: 'default' }, scoped);
    c.emit({
      type: 'ADDED',
      apiVersion: 'v1',
      kind: 'Pod',
      namespace: 'other',
      name: 'x',
      object: pod('x', 'other'),
    });
    c.emit({
      type: 'ADDED',
      apiVersion: 'v1',
      kind: 'Deployment',
      namespace: 'default',
      name: 'd',
      object: { kind: 'Deployment' },
    });
    expect(scoped).not.toHaveBeenCalled();
  });

  it('does not dispatch to closed watches and tracks open count', () => {
    const c = new FakeKubeClient();
    const handler = vi.fn();
    const sub = c.watch('Pod', {}, handler);
    expect(c.openWatchCount()).toBe(1);
    sub.close();
    expect(c.openWatchCount()).toBe(0);
    c.emit({
      type: 'ADDED',
      apiVersion: 'v1',
      kind: 'Pod',
      namespace: 'default',
      name: 'a',
      object: pod('a', 'default'),
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it('delivers stream errors to the matching watch error handlers', () => {
    const c = new FakeKubeClient();
    const onError = vi.fn();
    const sub = c.watch('Pod', {}, vi.fn());
    sub.onError(onError);
    c.emitError('Pod', { kind: 'streamDropped', message: 'drop' });
    expect(onError).toHaveBeenCalledTimes(1);
    c.emitError('Deployment', { kind: 'streamDropped', message: 'x' });
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('does not deliver errors to a closed watch', () => {
    const c = new FakeKubeClient();
    const onError = vi.fn();
    const sub = c.watch('Pod', {}, vi.fn());
    sub.onError(onError);
    sub.close();
    c.emitError('Pod', { kind: 'streamDropped', message: 'drop' });
    expect(onError).not.toHaveBeenCalled();
  });
});
