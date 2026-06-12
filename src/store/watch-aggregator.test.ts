import { describe, it, expect, vi } from 'vitest';
import { WatchAggregator } from './watch-aggregator.js';
import { FakeKubeClient } from '../boundaries/kube-client.fake.js';
import type { ResourceEvent, KubernetesObject } from '../core/types.js';

function podEvent(
  type: ResourceEvent['type'],
  name: string,
  namespace = 'default',
): Omit<ResourceEvent, 'receivedAt'> {
  const obj: KubernetesObject = {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name, namespace, uid: `${namespace}/${name}` },
  };
  return { type, apiVersion: 'v1', kind: 'Pod', namespace, name, object: obj };
}

describe('WatchAggregator', () => {
  it('fans ADDED events out to a registered handler', () => {
    const agg = new WatchAggregator();
    const client = new FakeKubeClient();
    const handler = vi.fn<(e: ResourceEvent) => void>();
    agg.subscribe(handler);
    agg.watch(client, 'Pod', {});

    client.emit(podEvent('ADDED', 'web-1'));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]?.[0].name).toBe('web-1');
  });

  it('fans events to multiple handlers', () => {
    const agg = new WatchAggregator();
    const client = new FakeKubeClient();
    const h1 = vi.fn<(e: ResourceEvent) => void>();
    const h2 = vi.fn<(e: ResourceEvent) => void>();
    agg.subscribe(h1);
    agg.subscribe(h2);
    agg.watch(client, 'Pod', {});

    client.emit(podEvent('ADDED', 'a'));

    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
  });

  it('does not call unsubscribed handlers', () => {
    const agg = new WatchAggregator();
    const client = new FakeKubeClient();
    const handler = vi.fn<(e: ResourceEvent) => void>();
    const sub = agg.subscribe(handler);
    agg.watch(client, 'Pod', {});
    sub.unsubscribe();

    client.emit(podEvent('ADDED', 'late'));

    expect(handler).not.toHaveBeenCalled();
  });

  it('closing the watch stops delivery to handlers', () => {
    const agg = new WatchAggregator();
    const client = new FakeKubeClient();
    const handler = vi.fn<(e: ResourceEvent) => void>();
    agg.subscribe(handler);
    const w = agg.watch(client, 'Pod', {});
    w.close();

    client.emit(podEvent('ADDED', 'late'));

    expect(handler).not.toHaveBeenCalled();
    expect(client.openWatchCount()).toBe(0);
  });

  it('forwards MODIFIED and DELETED event types', () => {
    const agg = new WatchAggregator();
    const client = new FakeKubeClient();
    const types: ResourceEvent['type'][] = [];
    agg.subscribe((e) => {
      types.push(e.type);
    });
    agg.watch(client, 'Pod', {});

    client.emit(podEvent('ADDED', 'x'));
    client.emit(podEvent('MODIFIED', 'x'));
    client.emit(podEvent('DELETED', 'x'));

    expect(types).toEqual(['ADDED', 'MODIFIED', 'DELETED']);
  });

  it('respects namespace filtering in WatchOptions', () => {
    const agg = new WatchAggregator();
    const client = new FakeKubeClient();
    const handler = vi.fn<(e: ResourceEvent) => void>();
    agg.subscribe(handler);
    agg.watch(client, 'Pod', { namespace: 'prod' });

    client.emit(podEvent('ADDED', 'a', 'dev'));
    client.emit(podEvent('ADDED', 'b', 'prod'));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]?.[0].namespace).toBe('prod');
  });

  it('can open multiple watches and fans from all', () => {
    const agg = new WatchAggregator();
    const client = new FakeKubeClient();
    const handler = vi.fn<(e: ResourceEvent) => void>();
    agg.subscribe(handler);
    agg.watch(client, 'Pod', {});
    agg.watch(client, 'Pod', { namespace: 'kube-system' });

    // The 'kube-system' watch will match events in that namespace,
    // the unscoped one matches all namespaces.
    client.emit(podEvent('ADDED', 'p', 'kube-system'));

    // Both watches match, so the handler fires twice
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('unsubscribe is idempotent', () => {
    const agg = new WatchAggregator();
    const client = new FakeKubeClient();
    const handler = vi.fn<(e: ResourceEvent) => void>();
    const sub = agg.subscribe(handler);
    sub.unsubscribe();
    sub.unsubscribe(); // should not throw

    agg.watch(client, 'Pod', {});
    client.emit(podEvent('ADDED', 'z'));

    expect(handler).not.toHaveBeenCalled();
  });

  it('close is idempotent', () => {
    const agg = new WatchAggregator();
    const client = new FakeKubeClient();
    const w = agg.watch(client, 'Pod', {});
    w.close();
    w.close(); // should not throw
    expect(client.openWatchCount()).toBe(0);
  });
});
