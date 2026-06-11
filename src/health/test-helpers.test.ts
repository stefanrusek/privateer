/**
 * Tests for test-helpers.ts — ensures all helper code paths are covered
 * so the overall coverage gate passes.
 */
import { describe, it, expect } from 'vitest';
import {
  makeStore,
  seedResource,
  makePodRaw,
  TEST_CONTEXT,
} from './test-helpers.js';
import type { ResourceEvent } from '../core/types.js';

describe('makeStore', () => {
  it('creates an empty store when no seed provided', () => {
    const store = makeStore();
    expect(store.all(TEST_CONTEXT)).toHaveLength(0);
  });

  it('mapper handles object with no metadata (uid/name fallback)', () => {
    const store = makeStore();
    // Seed a resource with no metadata uid or name
    seedResource(store, TEST_CONTEXT, 'ConfigMap', 'cm', 'default', {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      // No metadata.uid — will use the fallback
      metadata: { name: 'cm', namespace: 'default' },
      data: {},
    });
    const objs = store.list(TEST_CONTEXT, 'ConfigMap');
    expect(objs).toHaveLength(1);
    expect(objs[0]?.name).toBe('cm');
  });

  it('mapper uses meta.uid when provided', () => {
    const store = makeStore();
    seedResource(store, TEST_CONTEXT, 'ConfigMap', 'cm', 'default', {
      metadata: { uid: 'explicit-uid', name: 'cm' },
    });
    const objs = store.list(TEST_CONTEXT, 'ConfigMap');
    expect(objs[0]?.uid).toBe('explicit-uid');
  });

  it('mapper namespace fallback when meta.namespace is absent', () => {
    const store = makeStore();
    // Cluster-scoped resource: namespace is null
    seedResource(store, TEST_CONTEXT, 'ClusterRole', 'admin', null, {
      metadata: { name: 'admin' },
    });
    const objs = store.list(TEST_CONTEXT, 'ClusterRole');
    expect(objs[0]?.namespace).toBeNull();
  });

  it('mapper uses meta.name when provided', () => {
    const store = makeStore();
    seedResource(store, TEST_CONTEXT, 'Pod', 'my-pod', 'default', {
      metadata: { name: 'my-pod' },
    });
    expect(store.list(TEST_CONTEXT, 'Pod')[0]?.name).toBe('my-pod');
  });

  it('mapper handles event with no metadata (meta ?? {} fallback)', () => {
    // Directly call applyEvent with no metadata to cover the `??{}` fallback on line 18
    const store = makeStore();
    const event: ResourceEvent = {
      type: 'ADDED',
      apiVersion: 'v1',
      kind: 'Pod',
      namespace: 'default',
      name: 'raw-pod',
      object: { kind: 'Pod' }, // No metadata field
      receivedAt: 0,
    };
    store.applyEvent(TEST_CONTEXT, event);
    const objs = store.list(TEST_CONTEXT, 'Pod');
    expect(objs).toHaveLength(1);
    expect(objs[0]?.name).toBe(''); // meta.name ?? ''
  });
});

describe('makePodRaw', () => {
  it('uses default container when no containers provided', () => {
    const raw = makePodRaw({ name: 'api' });
    const spec = raw.spec!;
    const containers = spec.containers as Record<string, unknown>[];
    expect(containers).toHaveLength(1);
    expect(containers[0]?.name).toBe('main');
  });

  it('uses provided containers', () => {
    const raw = makePodRaw({
      name: 'api',
      containers: [{ name: 'app', image: 'nginx' }, { name: 'sidecar' }],
    });
    const spec = raw.spec!;
    const containers = spec.containers as Record<string, unknown>[];
    expect(containers).toHaveLength(2);
    expect(containers[0]?.name).toBe('app');
  });

  it('uses default namespace when not provided', () => {
    const raw = makePodRaw({ name: 'api' });
    expect(raw.metadata?.namespace).toBe('default');
  });

  it('uses provided namespace', () => {
    const raw = makePodRaw({ name: 'api', namespace: 'prod' });
    expect(raw.metadata?.namespace).toBe('prod');
  });

  it('uses default annotations when not provided', () => {
    const raw = makePodRaw({ name: 'api' });
    expect(raw.metadata?.annotations).toEqual({});
  });

  it('uses provided annotations', () => {
    const raw = makePodRaw({ name: 'api', annotations: { foo: 'bar' } });
    expect(raw.metadata?.annotations?.foo).toBe('bar');
  });
});
