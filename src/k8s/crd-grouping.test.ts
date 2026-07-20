import { describe, it, expect } from 'vitest';
import {
  groupCrds,
  descriptorsForGroups,
  crdFromObject,
} from './crd-grouping.js';
import type { CrdDefinition } from '../boundaries/kube-client.js';
import type { KubernetesObject } from '../core/types.js';

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
        established: true,
      },
      {
        group: 'kafka.strimzi.io',
        kind: 'KafkaTopic',
        plural: 'kafkatopics',
        namespaced: true,
        versions: ['v1beta2'],
        established: true,
      },
      {
        group: 'doppler.com',
        kind: 'DopplerSecret',
        plural: 'dopplersecrets',
        namespaced: true,
        versions: ['v1alpha1'],
        established: true,
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
        established: true,
      },
      {
        group: 'kafka.strimzi.io',
        kind: 'Kafka',
        plural: 'kafkas',
        namespaced: true,
        versions: ['v1beta2'],
        established: true,
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
        established: true,
      },
      {
        group: 'doppler.com',
        kind: 'DopplerSecret',
        plural: 'dopplersecrets',
        namespaced: true,
        versions: ['v1alpha1'],
        established: true,
      },
      {
        group: 'kafka.strimzi.io',
        kind: 'Kafka',
        plural: 'kafkas',
        namespaced: true,
        versions: ['v1beta2'],
        established: true,
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
        established: true,
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
        established: true,
      },
    ];
    const groups = groupCrds(crds);
    expect(groups[0]?.kinds[0]?.namespaced).toBe(false);
  });

  it('excludes CRDs that are not Established', () => {
    const crds: CrdDefinition[] = [
      {
        group: 'example.com',
        kind: 'Foo',
        plural: 'foos',
        namespaced: true,
        versions: ['v1'],
        established: true,
      },
      {
        group: 'example.com',
        kind: 'Bar',
        plural: 'bars',
        namespaced: true,
        versions: ['v1'],
        established: false,
      },
    ];
    const groups = groupCrds(crds);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.kinds.map((k) => k.kind)).toEqual(['Foo']);
  });

  it('omits a group entirely when none of its CRDs are established', () => {
    const crds: CrdDefinition[] = [
      {
        group: 'example.com',
        kind: 'Foo',
        plural: 'foos',
        namespaced: true,
        versions: ['v1'],
        established: false,
      },
    ];
    expect(groupCrds(crds)).toEqual([]);
  });
});

describe('descriptorsForGroups', () => {
  it('flattens groups into a kind → descriptor map', () => {
    const groups = groupCrds([
      {
        group: 'doppler.com',
        kind: 'DopplerSecret',
        plural: 'dopplersecrets',
        namespaced: true,
        versions: ['v1alpha1', 'v1'],
        established: true,
      },
    ]);
    const descriptors = descriptorsForGroups(groups);
    expect(descriptors.get('DopplerSecret')).toEqual({
      kind: 'DopplerSecret',
      group: 'doppler.com',
      version: 'v1alpha1',
      plural: 'dopplersecrets',
      namespaced: true,
    });
  });

  it('defaults version to empty string when a kind has none', () => {
    const groups = [
      {
        group: 'g',
        kinds: [{ kind: 'K', plural: 'ks', namespaced: true, versions: [] }],
      },
    ];
    const descriptors = descriptorsForGroups(groups);
    expect(descriptors.get('K')?.version).toBe('');
  });

  it('returns an empty map for no groups', () => {
    expect(descriptorsForGroups([])).toEqual(new Map());
  });
});

describe('crdFromObject', () => {
  const base: KubernetesObject = {
    apiVersion: 'apiextensions.k8s.io/v1',
    kind: 'CustomResourceDefinition',
    metadata: { name: 'dopplersecrets.doppler.com' },
    spec: {
      group: 'doppler.com',
      names: { kind: 'DopplerSecret', plural: 'dopplersecrets' },
      scope: 'Namespaced',
      versions: [
        { name: 'v1alpha1', served: true, storage: true },
        { name: 'v1beta1', served: true, storage: false },
        { name: 'v1old', served: false, storage: false },
      ],
    },
    status: {
      conditions: [{ type: 'Established', status: 'True' }],
    },
  };

  it('parses a well-formed CRD object into a CrdDefinition', () => {
    expect(crdFromObject(base)).toEqual({
      group: 'doppler.com',
      kind: 'DopplerSecret',
      plural: 'dopplersecrets',
      namespaced: true,
      versions: ['v1alpha1', 'v1beta1'],
      established: true,
    });
  });

  it('marks cluster-scoped CRDs as not namespaced', () => {
    const obj: KubernetesObject = {
      ...base,
      spec: { ...base.spec, scope: 'Cluster' },
    };
    expect(crdFromObject(obj)?.namespaced).toBe(false);
  });

  it('is not established when the condition is missing', () => {
    const obj: KubernetesObject = { ...base, status: {} };
    expect(crdFromObject(obj)?.established).toBe(false);
  });

  it('is not established when status is missing entirely', () => {
    const obj: KubernetesObject = { ...base };
    delete (obj as { status?: unknown }).status;
    expect(crdFromObject(obj)?.established).toBe(false);
  });

  it('returns undefined when spec is missing', () => {
    expect(crdFromObject({ kind: 'CustomResourceDefinition' })).toBeUndefined();
  });

  it('returns undefined when names are missing', () => {
    const obj: KubernetesObject = {
      ...base,
      spec: { group: 'doppler.com', scope: 'Namespaced' },
    };
    expect(crdFromObject(obj)).toBeUndefined();
  });

  it('returns undefined when scope is missing', () => {
    const obj: KubernetesObject = {
      ...base,
      spec: { ...base.spec, scope: undefined },
    };
    expect(crdFromObject(obj)).toBeUndefined();
  });

  it('defaults versions to an empty array when versions is absent', () => {
    const obj: KubernetesObject = {
      ...base,
      spec: {
        group: 'doppler.com',
        names: base.spec?.names,
        scope: 'Namespaced',
      },
    };
    expect(crdFromObject(obj)?.versions).toEqual([]);
  });
});
