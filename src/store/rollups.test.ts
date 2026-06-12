import { describe, it, expect } from 'vitest';
import {
  rollupByNamespace,
  rollupByNode,
  rollupByWorkload,
} from './rollups.js';
import type { ResourceObject, StatusColor } from '../core/types.js';

function obj(
  name: string,
  namespace: string | null,
  color: StatusColor = 'green',
  extra: Partial<ResourceObject> = {},
): ResourceObject {
  return {
    uid: `${namespace ?? '~'}/${name}`,
    kind: 'Pod',
    apiVersion: 'v1',
    name,
    namespace,
    labels: {},
    annotations: {},
    creationTimestamp: '',
    resourceVersion: '1',
    status: { color, label: 'Running' },
    raw: {
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: { name, ...(namespace !== null ? { namespace } : {}) },
    },
    ...extra,
  };
}

function objOnNode(
  name: string,
  nodeName: string,
  color: StatusColor = 'green',
): ResourceObject {
  return {
    uid: `default/${name}`,
    kind: 'Pod',
    apiVersion: 'v1',
    name,
    namespace: 'default',
    labels: {},
    annotations: {},
    creationTimestamp: '',
    resourceVersion: '1',
    status: { color, label: 'Running' },
    raw: {
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: { name, namespace: 'default' },
      spec: { nodeName },
    },
  };
}

function objWithOwner(
  name: string,
  ownerKind: string,
  ownerName: string,
  color: StatusColor = 'green',
): ResourceObject {
  return {
    uid: `default/${name}`,
    kind: 'Pod',
    apiVersion: 'v1',
    name,
    namespace: 'default',
    labels: {},
    annotations: {},
    creationTimestamp: '',
    resourceVersion: '1',
    status: { color, label: 'Running' },
    raw: {
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: {
        name,
        namespace: 'default',
        ownerReferences: [
          {
            apiVersion: 'apps/v1',
            kind: ownerKind,
            name: ownerName,
            uid: 'u1',
            controller: true,
          },
        ],
      },
    },
  };
}

// ---------------------------------------------------------------------------
// rollupByNamespace
// ---------------------------------------------------------------------------

describe('rollupByNamespace', () => {
  it('returns an empty map for no resources', () => {
    expect(rollupByNamespace([])).toEqual(new Map());
  });

  it('counts resources per namespace', () => {
    const resources = [obj('a', 'ns1'), obj('b', 'ns1'), obj('c', 'ns2')];
    const map = rollupByNamespace(resources);
    expect(map.get('ns1')?.total).toBe(2);
    expect(map.get('ns2')?.total).toBe(1);
  });

  it('counts by status color', () => {
    const resources = [
      obj('a', 'ns1', 'green'),
      obj('b', 'ns1', 'red'),
      obj('c', 'ns1', 'yellow'),
      obj('d', 'ns1', 'grey'),
    ];
    const rollup = rollupByNamespace(resources).get('ns1');
    expect(rollup?.counts.green).toBe(1);
    expect(rollup?.counts.red).toBe(1);
    expect(rollup?.counts.yellow).toBe(1);
    expect(rollup?.counts.grey).toBe(1);
  });

  it('groups cluster-scoped resources under "~"', () => {
    const resources = [obj('node-1', null, 'green')];
    const map = rollupByNamespace(resources);
    expect(map.get('~')?.total).toBe(1);
  });

  it('namespace field on rollup matches the key', () => {
    const resources = [obj('a', 'prod')];
    const rollup = rollupByNamespace(resources).get('prod');
    expect(rollup?.namespace).toBe('prod');
  });
});

// ---------------------------------------------------------------------------
// rollupByNode
// ---------------------------------------------------------------------------

describe('rollupByNode', () => {
  it('returns an empty map for no resources', () => {
    expect(rollupByNode([])).toEqual(new Map());
  });

  it('skips resources with no spec.nodeName', () => {
    const resources = [obj('a', 'default')];
    expect(rollupByNode(resources)).toEqual(new Map());
  });

  it('groups by nodeName', () => {
    const resources = [
      objOnNode('pod-a', 'node-1'),
      objOnNode('pod-b', 'node-1'),
      objOnNode('pod-c', 'node-2'),
    ];
    const map = rollupByNode(resources);
    expect(map.get('node-1')?.total).toBe(2);
    expect(map.get('node-2')?.total).toBe(1);
  });

  it('counts by status color', () => {
    const resources = [
      objOnNode('a', 'node-1', 'green'),
      objOnNode('b', 'node-1', 'red'),
    ];
    const rollup = rollupByNode(resources).get('node-1');
    expect(rollup?.counts.green).toBe(1);
    expect(rollup?.counts.red).toBe(1);
    expect(rollup?.nodeName).toBe('node-1');
  });

  it('skips resources with empty nodeName string', () => {
    const resources: ResourceObject[] = [
      {
        uid: 'x',
        kind: 'Pod',
        apiVersion: 'v1',
        name: 'x',
        namespace: 'default',
        labels: {},
        annotations: {},
        creationTimestamp: '',
        resourceVersion: '1',
        status: { color: 'green', label: 'Running' },
        raw: { spec: { nodeName: '' } },
      },
    ];
    expect(rollupByNode(resources)).toEqual(new Map());
  });

  it('skips resources where spec.nodeName is not a string', () => {
    const resources: ResourceObject[] = [
      {
        uid: 'x',
        kind: 'Pod',
        apiVersion: 'v1',
        name: 'x',
        namespace: 'default',
        labels: {},
        annotations: {},
        creationTimestamp: '',
        resourceVersion: '1',
        status: { color: 'green', label: 'Running' },
        raw: { spec: { nodeName: 42 } },
      },
    ];
    expect(rollupByNode(resources)).toEqual(new Map());
  });

  it('skips resources with no spec', () => {
    const resources: ResourceObject[] = [obj('a', 'default')];
    expect(rollupByNode(resources)).toEqual(new Map());
  });
});

// ---------------------------------------------------------------------------
// rollupByWorkload
// ---------------------------------------------------------------------------

describe('rollupByWorkload', () => {
  it('returns an empty map for no resources', () => {
    expect(rollupByWorkload([])).toEqual(new Map());
  });

  it('groups pods by controller owner reference', () => {
    const resources = [
      objWithOwner('pod-a', 'ReplicaSet', 'my-rs'),
      objWithOwner('pod-b', 'ReplicaSet', 'my-rs'),
      objWithOwner('pod-c', 'ReplicaSet', 'other-rs'),
    ];
    const map = rollupByWorkload(resources);
    expect(map.get('ReplicaSet/default/my-rs')?.total).toBe(2);
    expect(map.get('ReplicaSet/default/other-rs')?.total).toBe(1);
  });

  it('places standalone resources under Standalone key', () => {
    const resources = [obj('standalone-pod', 'default')];
    const map = rollupByWorkload(resources);
    expect(map.get('Standalone/default/standalone-pod')?.ownerKind).toBe(
      'Standalone',
    );
  });

  it('counts by status color', () => {
    const resources = [
      objWithOwner('a', 'ReplicaSet', 'rs', 'green'),
      objWithOwner('b', 'ReplicaSet', 'rs', 'yellow'),
    ];
    const rollup = rollupByWorkload(resources).get('ReplicaSet/default/rs');
    expect(rollup?.counts.green).toBe(1);
    expect(rollup?.counts.yellow).toBe(1);
    expect(rollup?.total).toBe(2);
  });

  it('sets ownerName and namespace on rollup', () => {
    const resources = [objWithOwner('pod', 'Deployment', 'my-deploy')];
    const rollup = rollupByWorkload(resources).get(
      'Deployment/default/my-deploy',
    );
    expect(rollup?.ownerKind).toBe('Deployment');
    expect(rollup?.ownerName).toBe('my-deploy');
    expect(rollup?.namespace).toBe('default');
  });

  it('ignores non-controller owner references', () => {
    const resource: ResourceObject = {
      uid: 'x',
      kind: 'Pod',
      apiVersion: 'v1',
      name: 'pod',
      namespace: 'default',
      labels: {},
      annotations: {},
      creationTimestamp: '',
      resourceVersion: '1',
      status: { color: 'green', label: 'Running' },
      raw: {
        metadata: {
          name: 'pod',
          namespace: 'default',
          ownerReferences: [
            {
              apiVersion: 'apps/v1',
              kind: 'ReplicaSet',
              name: 'rs',
              uid: 'u1',
              // controller not set to true
            },
          ],
        },
      },
    };
    const map = rollupByWorkload([resource]);
    // No controller=true → treated as standalone
    expect(map.get('Standalone/default/pod')).toBeDefined();
    expect(map.get('ReplicaSet/default/rs')).toBeUndefined();
  });

  it('handles cluster-scoped resources (namespace null) as standalone', () => {
    const resources = [obj('cluster-role', null)];
    const map = rollupByWorkload(resources);
    expect(map.get('Standalone/~/cluster-role')).toBeDefined();
  });

  it('uses "~" for cluster-scoped resources with a controller owner', () => {
    const resource: ResourceObject = {
      uid: 'x',
      kind: 'ClusterRoleBinding',
      apiVersion: 'rbac.authorization.k8s.io/v1',
      name: 'binding',
      namespace: null,
      labels: {},
      annotations: {},
      creationTimestamp: '',
      resourceVersion: '1',
      status: { color: 'grey', label: 'Unknown' },
      raw: {
        metadata: {
          name: 'binding',
          ownerReferences: [
            {
              apiVersion: 'rbac.authorization.k8s.io/v1',
              kind: 'ClusterRole',
              name: 'my-role',
              uid: 'u2',
              controller: true,
            },
          ],
        },
      },
    };
    const map = rollupByWorkload([resource]);
    expect(map.get('ClusterRole/~/my-role')).toBeDefined();
    expect(map.get('ClusterRole/~/my-role')?.namespace).toBeNull();
  });
});
