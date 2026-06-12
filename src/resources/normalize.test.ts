import { describe, it, expect } from 'vitest';
import type { KubernetesObject } from '../core/types.js';
import { normalize } from './normalize.js';

describe('normalize', () => {
  it('extracts all metadata fields from a full object', () => {
    const raw: KubernetesObject = {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: 'my-deploy',
        namespace: 'default',
        uid: 'abc-123',
        resourceVersion: '999',
        creationTimestamp: '2024-01-01T00:00:00Z',
        labels: { app: 'web' },
        annotations: {
          'kubectl.kubernetes.io/last-applied-configuration': '{}',
        },
      },
      spec: { replicas: 3 },
      status: { replicas: 3, availableReplicas: 3 },
    };

    const obj = normalize(raw);

    expect(obj.uid).toBe('abc-123');
    expect(obj.kind).toBe('Deployment');
    expect(obj.apiVersion).toBe('apps/v1');
    expect(obj.name).toBe('my-deploy');
    expect(obj.namespace).toBe('default');
    expect(obj.labels).toEqual({ app: 'web' });
    expect(obj.annotations).toEqual({
      'kubectl.kubernetes.io/last-applied-configuration': '{}',
    });
    expect(obj.creationTimestamp).toBe('2024-01-01T00:00:00Z');
    expect(obj.resourceVersion).toBe('999');
    expect(obj.raw).toBe(raw); // exact same reference
  });

  it('sets namespace to null for cluster-scoped resources (no namespace in metadata)', () => {
    const raw: KubernetesObject = {
      apiVersion: 'v1',
      kind: 'Node',
      metadata: { name: 'node-1', uid: 'node-uid' },
      status: { conditions: [{ type: 'Ready', status: 'True' }] },
    };

    const obj = normalize(raw);
    expect(obj.namespace).toBeNull();
  });

  it('fills empty strings for missing metadata fields', () => {
    const raw: KubernetesObject = {};
    const obj = normalize(raw);

    expect(obj.uid).toBe('');
    expect(obj.kind).toBe('');
    expect(obj.apiVersion).toBe('');
    expect(obj.name).toBe('');
    expect(obj.namespace).toBeNull();
    expect(obj.labels).toEqual({});
    expect(obj.annotations).toEqual({});
    expect(obj.creationTimestamp).toBe('');
    expect(obj.resourceVersion).toBe('');
  });

  it('resolves status using the kind-specific resolver', () => {
    const raw: KubernetesObject = {
      kind: 'Namespace',
      metadata: { name: 'prod' },
      status: { phase: 'Active' },
    };

    const obj = normalize(raw);
    expect(obj.status.color).toBe('green');
    expect(obj.status.label).toBe('Active');
  });

  it('uses generic fallback for unknown kinds', () => {
    const raw: KubernetesObject = {
      kind: 'MyCustomCRD',
      metadata: { name: 'custom-1' },
      status: {},
    };

    const obj = normalize(raw);
    expect(obj.status.color).toBe('grey');
  });

  it('keeps raw reference unchanged', () => {
    const raw: KubernetesObject = {
      kind: 'Pod',
      metadata: { name: 'my-pod', namespace: 'test' },
      status: { phase: 'Running' },
      spec: { containers: [] },
    };

    const obj = normalize(raw);
    expect(obj.raw).toBe(raw);
  });
});
