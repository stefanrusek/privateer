import { describe, it, expect } from 'vitest';
import { FakeKubeClient } from '../boundaries/kube-client.fake.js';
import { buildDeleteConfirmMessage, executeDelete } from './delete.js';

describe('buildDeleteConfirmMessage', () => {
  it('Deployment includes cascade note with "pods"', () => {
    const msg = buildDeleteConfirmMessage('Deployment', 'order-api', 'default');
    expect(msg).toContain('pods');
    expect(msg).toContain('order-api');
    expect(msg).toContain('default');
    expect(msg).toContain('deployment');
  });

  it('StatefulSet includes cascade note with "pods"', () => {
    const msg = buildDeleteConfirmMessage('StatefulSet', 'my-db', 'prod');
    expect(msg).toContain('pods');
    expect(msg).toContain('my-db');
    expect(msg).toContain('prod');
    expect(msg).toContain('statefulset');
  });

  it('Pod has simple message without cascade note', () => {
    const msg = buildDeleteConfirmMessage('Pod', 'my-pod', 'default');
    expect(msg).not.toContain('pods');
    expect(msg).toContain('my-pod');
    expect(msg).toContain('default');
  });

  it('Service has simple message without cascade note', () => {
    const msg = buildDeleteConfirmMessage('Service', 'my-svc', 'staging');
    expect(msg).not.toContain('pods');
    expect(msg).toContain('my-svc');
    expect(msg).toContain('staging');
  });

  it('DaemonSet has simple message without cascade note', () => {
    const msg = buildDeleteConfirmMessage('DaemonSet', 'fluentd', 'logging');
    expect(msg).not.toContain('pods');
    expect(msg).toContain('fluentd');
    expect(msg).toContain('logging');
  });

  it('ConfigMap has simple message', () => {
    const msg = buildDeleteConfirmMessage('ConfigMap', 'my-config', 'default');
    expect(msg).not.toContain('pods');
    expect(msg).toContain('my-config');
    expect(msg).toContain('default');
  });
});

describe('executeDelete', () => {
  it('returns ok when resource exists', async () => {
    const client = new FakeKubeClient();
    client.seed({
      kind: 'Pod',
      metadata: { name: 'target-pod', namespace: 'default' },
    });
    const result = await executeDelete(client, 'Pod', 'target-pod', 'default');
    expect(result.ok).toBe(true);
  });

  it('returns err when resource not found', async () => {
    const client = new FakeKubeClient();
    const result = await executeDelete(client, 'Pod', 'missing-pod', 'default');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('missing-pod');
    }
  });

  it('removes the resource from the store after deletion', async () => {
    const client = new FakeKubeClient();
    client.seed({
      kind: 'Deployment',
      metadata: { name: 'my-deploy', namespace: 'prod' },
    });
    const result = await executeDelete(
      client,
      'Deployment',
      'my-deploy',
      'prod',
    );
    expect(result.ok).toBe(true);
    // Verify it's gone by trying to delete again
    const second = await executeDelete(
      client,
      'Deployment',
      'my-deploy',
      'prod',
    );
    expect(second.ok).toBe(false);
  });

  it('returns err containing the error message on failure', async () => {
    const client = new FakeKubeClient();
    const result = await executeDelete(
      client,
      'Service',
      'gone-svc',
      'default',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.error).toBe('string');
      expect(result.error.length).toBeGreaterThan(0);
    }
  });
});
