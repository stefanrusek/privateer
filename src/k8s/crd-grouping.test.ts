import { describe, it, expect } from 'vitest';
import { groupCrds } from './crd-grouping.js';
import type { CrdDefinition } from '../boundaries/kube-client.js';

describe('groupCrds', () => {
  it('returns empty array for no CRDs', () => {
    expect(groupCrds([])).toEqual([]);
  });

  it('groups CRDs by API group', () => {
    const crds: CrdDefinition[] = [
      {
        group: 'kafka.strimzi.io',
        kind: 'Kafka',
        plural: 'kafkas',
        namespaced: true,
        versions: ['v1beta2'],
      },
      {
        group: 'kafka.strimzi.io',
        kind: 'KafkaTopic',
        plural: 'kafkatopics',
        namespaced: true,
        versions: ['v1beta2'],
      },
      {
        group: 'doppler.com',
        kind: 'DopplerSecret',
        plural: 'dopplersecrets',
        namespaced: true,
        versions: ['v1alpha1'],
      },
    ];
    const groups = groupCrds(crds);
    const groupNames = groups.map((g) => g.group);
    expect(groupNames).toContain('kafka.strimzi.io');
    expect(groupNames).toContain('doppler.com');
    const kafka = groups.find((g) => g.group === 'kafka.strimzi.io');
    expect(kafka?.kinds.map((k) => k.kind)).toEqual(['Kafka', 'KafkaTopic']);
  });

  it('sorts kinds within a group alphabetically', () => {
    const crds: CrdDefinition[] = [
      {
        group: 'kafka.strimzi.io',
        kind: 'KafkaTopic',
        plural: 'kafkatopics',
        namespaced: true,
        versions: ['v1beta2'],
      },
      {
        group: 'kafka.strimzi.io',
        kind: 'Kafka',
        plural: 'kafkas',
        namespaced: true,
        versions: ['v1beta2'],
      },
    ];
    const groups = groupCrds(crds);
    const kinds = groups[0]?.kinds.map((k) => k.kind);
    expect(kinds).toEqual(['Kafka', 'KafkaTopic']);
  });

  it('sorts groups by group name', () => {
    const crds: CrdDefinition[] = [
      {
        group: 'monitoring.coreos.com',
        kind: 'PrometheusRule',
        plural: 'prometheusrules',
        namespaced: true,
        versions: ['v1'],
      },
      {
        group: 'doppler.com',
        kind: 'DopplerSecret',
        plural: 'dopplersecrets',
        namespaced: true,
        versions: ['v1alpha1'],
      },
      {
        group: 'kafka.strimzi.io',
        kind: 'Kafka',
        plural: 'kafkas',
        namespaced: true,
        versions: ['v1beta2'],
      },
    ];
    const groups = groupCrds(crds);
    expect(groups.map((g) => g.group)).toEqual([
      'doppler.com',
      'kafka.strimzi.io',
      'monitoring.coreos.com',
    ]);
  });

  it('preserves versions array', () => {
    const crds: CrdDefinition[] = [
      {
        group: 'example.com',
        kind: 'Foo',
        plural: 'foos',
        namespaced: false,
        versions: ['v1', 'v2'],
      },
    ];
    const groups = groupCrds(crds);
    expect(groups[0]?.kinds[0]?.versions).toEqual(['v1', 'v2']);
  });

  it('preserves namespaced flag', () => {
    const crds: CrdDefinition[] = [
      {
        group: 'example.com',
        kind: 'ClusterFoo',
        plural: 'clusterfoos',
        namespaced: false,
        versions: ['v1'],
      },
    ];
    const groups = groupCrds(crds);
    expect(groups[0]?.kinds[0]?.namespaced).toBe(false);
  });
});
