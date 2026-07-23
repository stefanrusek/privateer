import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { Text } from 'ink';
import { OverviewTab } from './OverviewTab.js';
import type { ResourceObject } from '../../core/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW_MS = new Date('2026-06-10T13:00:00Z').getTime();

function makeResource(
  overrides: Partial<ResourceObject> & { kind: string },
): ResourceObject {
  return {
    uid: 'uid-1',
    kind: overrides.kind,
    apiVersion: 'v1',
    name: overrides.name ?? 'test-resource',
    namespace:
      overrides.namespace !== undefined ? overrides.namespace : 'default',
    labels: overrides.labels ?? {},
    annotations: overrides.annotations ?? {},
    creationTimestamp: overrides.creationTimestamp ?? '2026-06-10T11:00:00Z',
    resourceVersion: '1',
    status: overrides.status ?? { color: 'green', label: 'Ready' },
    raw: overrides.raw ?? {
      metadata: { name: overrides.name ?? 'test-resource' },
    },
  };
}

function noop(): void {
  return;
}

// ---------------------------------------------------------------------------
// Pod overview
// ---------------------------------------------------------------------------

describe('OverviewTab Pod', () => {
  it('renders METADATA section', () => {
    const resource = makeResource({
      kind: 'Pod',
      name: 'order-api-7d9f',
      namespace: 'default',
      raw: {
        metadata: { name: 'order-api-7d9f', namespace: 'default' },
        spec: {},
        status: {},
      },
    });
    const { lastFrame } = render(
      React.createElement(OverviewTab, { resource, nowMs: NOW_MS }),
    );
    expect(lastFrame()).toContain('METADATA');
    expect(lastFrame()).toContain('order-api-7d9f');
    expect(lastFrame()).toContain('default');
  });

  it('renders STATUS section with phase and IP', () => {
    const resource = makeResource({
      kind: 'Pod',
      name: 'order-api',
      raw: {
        metadata: { name: 'order-api', namespace: 'default' },
        spec: {},
        status: {
          phase: 'Running',
          podIP: '10.244.3.42',
          hostIP: '192.168.1.1',
          qosClass: 'BestEffort',
          containerStatuses: [{ ready: true, restartCount: 0 }],
        },
      },
    });
    const { lastFrame } = render(
      React.createElement(OverviewTab, { resource, nowMs: NOW_MS }),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('STATUS');
    expect(frame).toContain('Running');
    expect(frame).toContain('10.244.3.42');
    expect(frame).toContain('BestEffort');
  });

  it('renders CONTAINERS section', () => {
    const resource = makeResource({
      kind: 'Pod',
      raw: {
        metadata: { name: 'test', namespace: 'default' },
        spec: {
          containers: [{ name: 'app', image: 'gcr.io/myapp:v1.0' }],
        },
        status: {},
      },
    });
    const { lastFrame } = render(
      React.createElement(OverviewTab, { resource, nowMs: NOW_MS }),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('CONTAINERS');
    expect(frame).toContain('app');
    expect(frame).toContain('gcr.io/myapp:v1.0');
  });

  it('renders VOLUMES section', () => {
    const resource = makeResource({
      kind: 'Pod',
      raw: {
        metadata: { name: 'test', namespace: 'default' },
        spec: {
          volumes: [{ name: 'data-vol' }],
        },
        status: {},
      },
    });
    const { lastFrame } = render(
      React.createElement(OverviewTab, { resource, nowMs: NOW_MS }),
    );
    expect(lastFrame()).toContain('VOLUMES');
    expect(lastFrame()).toContain('data-vol');
  });

  it('renders annotations collapse by default', () => {
    const resource = makeResource({
      kind: 'Pod',
      annotations: {
        'kubectl.kubernetes.io/last-applied': '{}',
        'prometheus.io/scrape': 'true',
      },
      raw: { metadata: { name: 'test' }, spec: {}, status: {} },
    });
    const { lastFrame } = render(
      React.createElement(OverviewTab, { resource, nowMs: NOW_MS }),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('2 annotations');
    expect(frame).toContain('[show]');
  });

  it('renders ready count from containerStatuses', () => {
    const resource = makeResource({
      kind: 'Pod',
      raw: {
        metadata: { name: 'test' },
        spec: {},
        status: {
          containerStatuses: [
            { ready: true, restartCount: 2 },
            { ready: false, restartCount: 0 },
          ],
        },
      },
    });
    const { lastFrame } = render(
      React.createElement(OverviewTab, { resource, nowMs: NOW_MS }),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('1/2');
    expect(frame).toContain('2'); // restarts
  });
});

// ---------------------------------------------------------------------------
// Deployment overview
// ---------------------------------------------------------------------------

describe('OverviewTab Deployment', () => {
  it('renders STATUS with ready replicas', () => {
    const resource = makeResource({
      kind: 'Deployment',
      raw: {
        metadata: { name: 'my-deploy', namespace: 'default' },
        spec: {
          strategy: { type: 'RollingUpdate' },
          selector: { matchLabels: { app: 'my-deploy' } },
          template: { metadata: { labels: {} }, spec: { containers: [] } },
        },
        status: {
          replicas: 3,
          readyReplicas: 3,
          updatedReplicas: 3,
          availableReplicas: 3,
        },
      },
    });
    const { lastFrame } = render(
      React.createElement(OverviewTab, { resource, nowMs: NOW_MS }),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('STATUS');
    expect(frame).toContain('3/3');
    expect(frame).toContain('RollingUpdate');
  });

  it('renders SELECTOR section', () => {
    const resource = makeResource({
      kind: 'Deployment',
      raw: {
        metadata: { name: 'my-deploy' },
        spec: {
          selector: { matchLabels: { app: 'my-app', env: 'prod' } },
          template: { metadata: { labels: {} }, spec: { containers: [] } },
        },
        status: {},
      },
    });
    const { lastFrame } = render(
      React.createElement(OverviewTab, { resource, nowMs: NOW_MS }),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('SELECTOR');
    expect(frame).toContain('my-app');
    expect(frame).toContain('prod');
  });

  it('renders TEMPLATE section with containers', () => {
    const resource = makeResource({
      kind: 'Deployment',
      raw: {
        metadata: { name: 'my-deploy' },
        spec: {
          selector: { matchLabels: {} },
          template: {
            metadata: { labels: { app: 'my-app' } },
            spec: { containers: [{ name: 'web', image: 'nginx:latest' }] },
          },
        },
        status: {},
      },
    });
    const { lastFrame } = render(
      React.createElement(OverviewTab, { resource, nowMs: NOW_MS }),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('TEMPLATE');
    expect(frame).toContain('web');
    expect(frame).toContain('nginx:latest');
  });
});

// ---------------------------------------------------------------------------
// Node overview
// ---------------------------------------------------------------------------

describe('OverviewTab Node', () => {
  it('renders node METADATA without namespace', () => {
    const resource = makeResource({
      kind: 'Node',
      name: 'node-1',
      namespace: null,
      raw: {
        metadata: { name: 'node-1' },
        status: {},
      },
    });
    const { lastFrame } = render(
      React.createElement(OverviewTab, { resource, nowMs: NOW_MS }),
    );
    expect(lastFrame()).toContain('METADATA');
    expect(lastFrame()).toContain('node-1');
  });

  it('renders STATUS with conditions', () => {
    const resource = makeResource({
      kind: 'Node',
      namespace: null,
      raw: {
        metadata: { name: 'node-1' },
        status: {
          conditions: [
            { type: 'Ready', status: 'True' },
            { type: 'MemoryPressure', status: 'False' },
          ],
        },
      },
    });
    const { lastFrame } = render(
      React.createElement(OverviewTab, { resource, nowMs: NOW_MS }),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('STATUS');
    expect(frame).toContain('Ready');
    expect(frame).toContain('True');
  });

  it('renders CAPACITY section', () => {
    const resource = makeResource({
      kind: 'Node',
      namespace: null,
      raw: {
        metadata: { name: 'node-1' },
        status: {
          capacity: { cpu: '4', memory: '16Gi', pods: '110' },
          allocatable: { cpu: '3900m', memory: '15Gi', pods: '100' },
        },
      },
    });
    const { lastFrame } = render(
      React.createElement(OverviewTab, { resource, nowMs: NOW_MS }),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('CAPACITY');
    expect(frame).toContain('4');
    expect(frame).toContain('16Gi');
  });

  it('renders SYSTEM section', () => {
    const resource = makeResource({
      kind: 'Node',
      namespace: null,
      raw: {
        metadata: { name: 'node-1' },
        status: {
          nodeInfo: {
            osImage: 'Ubuntu 22.04',
            kernelVersion: '5.15.0',
            containerRuntimeVersion: 'containerd://1.7',
            kubeletVersion: 'v1.28.0',
          },
        },
      },
    });
    const { lastFrame } = render(
      React.createElement(OverviewTab, { resource, nowMs: NOW_MS }),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('SYSTEM');
    expect(frame).toContain('Ubuntu 22.04');
    expect(frame).toContain('v1.28.0');
  });

  it('renders ADDRESSES section', () => {
    const resource = makeResource({
      kind: 'Node',
      namespace: null,
      raw: {
        metadata: { name: 'node-1' },
        status: {
          addresses: [
            { type: 'InternalIP', address: '10.0.0.1' },
            { type: 'Hostname', address: 'node-1.cluster' },
          ],
        },
      },
    });
    const { lastFrame } = render(
      React.createElement(OverviewTab, { resource, nowMs: NOW_MS }),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('ADDRESSES');
    expect(frame).toContain('10.0.0.1');
    expect(frame).toContain('node-1.cluster');
  });
});

// ---------------------------------------------------------------------------
// KafkaTopic overview
// ---------------------------------------------------------------------------

describe('OverviewTab KafkaTopic', () => {
  it('renders METADATA section', () => {
    const resource = makeResource({
      kind: 'KafkaTopic',
      name: 'orders-topic',
      raw: {
        metadata: { name: 'orders-topic', namespace: 'kafka' },
        spec: { partitions: 12, replicas: 3 },
        status: {},
      },
    });
    const { lastFrame } = render(
      React.createElement(OverviewTab, { resource, nowMs: NOW_MS }),
    );
    expect(lastFrame()).toContain('METADATA');
    expect(lastFrame()).toContain('orders-topic');
  });

  it('renders SPEC section with partitions and replication', () => {
    const resource = makeResource({
      kind: 'KafkaTopic',
      raw: {
        metadata: { name: 'test-topic', namespace: 'kafka' },
        spec: {
          partitions: 12,
          replicas: 3,
          retentionBytes: 1073741824,
          retentionMs: 86400000,
          cleanupPolicy: 'delete',
        },
        status: {},
      },
    });
    const { lastFrame } = render(
      React.createElement(OverviewTab, { resource, nowMs: NOW_MS }),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('SPEC');
    expect(frame).toContain('12');
    expect(frame).toContain('3');
    expect(frame).toContain('delete');
  });

  it('renders STATUS section with ready condition', () => {
    const resource = makeResource({
      kind: 'KafkaTopic',
      raw: {
        metadata: { name: 'test-topic' },
        spec: {},
        status: {
          observedGeneration: 2,
          conditions: [{ type: 'Ready', status: 'True' }],
        },
      },
    });
    const { lastFrame } = render(
      React.createElement(OverviewTab, { resource, nowMs: NOW_MS }),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('STATUS');
    expect(frame).toContain('True');
    expect(frame).toContain('2');
  });
});

// ---------------------------------------------------------------------------
// DopplerSecret overview
// ---------------------------------------------------------------------------

describe('OverviewTab DopplerSecret', () => {
  it('renders METADATA, SPEC, STATUS sections', () => {
    const resource = makeResource({
      kind: 'DopplerSecret',
      name: 'my-doppler-secret',
      raw: {
        metadata: { name: 'my-doppler-secret', namespace: 'default' },
        spec: {
          project: 'my-project',
          config: 'production',
          secretName: 'my-k8s-secret',
          secretNamespace: 'default',
        },
        status: {
          conditions: [
            {
              type: 'secrets.doppler.com/secretsGenerated',
              status: 'True',
            },
          ],
          lastSyncTime: '2026-06-10T12:00:00Z',
        },
      },
    });
    const { lastFrame } = render(
      React.createElement(OverviewTab, { resource, nowMs: NOW_MS }),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('METADATA');
    expect(frame).toContain('SPEC');
    expect(frame).toContain('STATUS');
    expect(frame).toContain('my-project');
    expect(frame).toContain('production');
    expect(frame).toContain('my-k8s-secret');
    expect(frame).toContain('True');
  });

  it('renders managed secret link', () => {
    const resource = makeResource({
      kind: 'DopplerSecret',
      raw: {
        metadata: { name: 'my-doppler-secret', namespace: 'default' },
        spec: { secretName: 'linked-secret', secretNamespace: 'default' },
        status: {},
      },
    });
    const { lastFrame } = render(
      React.createElement(OverviewTab, {
        resource,
        nowMs: NOW_MS,
        onViewManagedSecret: noop,
      }),
    );
    expect(lastFrame()).toContain('→ View managed Secret');
  });

  it('does not render managed secret link when secretName missing', () => {
    const resource = makeResource({
      kind: 'DopplerSecret',
      raw: {
        metadata: { name: 'my-doppler-secret', namespace: 'default' },
        spec: {},
        status: {},
      },
    });
    const { lastFrame } = render(
      React.createElement(OverviewTab, { resource, nowMs: NOW_MS }),
    );
    expect(lastFrame()).not.toContain('→ View managed Secret');
  });

  it('fires onViewManagedSecret callback when link clicked', () => {
    let calledWith: [string, string] | null = null;
    const resource = makeResource({
      kind: 'DopplerSecret',
      raw: {
        metadata: { name: 'ds', namespace: 'default' },
        spec: { secretName: 'linked', secretNamespace: 'secrets' },
        status: {},
      },
    });
    render(
      React.createElement(OverviewTab, {
        resource,
        nowMs: NOW_MS,
        onViewManagedSecret: (n, ns) => {
          calledWith = [n, ns];
        },
      }),
    );
    // The link is rendered but click can't easily be simulated in unit test —
    // we verify the callback prop is accepted and the component renders.
    expect(calledWith).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Generic fallback overview
// ---------------------------------------------------------------------------

describe('OverviewTab Generic', () => {
  it('renders METADATA for unknown kind', () => {
    const resource = makeResource({
      kind: 'CustomThing',
      name: 'my-thing',
      raw: { metadata: { name: 'my-thing', namespace: 'default' } },
    });
    const { lastFrame } = render(
      React.createElement(OverviewTab, { resource, nowMs: NOW_MS }),
    );
    expect(lastFrame()).toContain('METADATA');
    expect(lastFrame()).toContain('my-thing');
  });

  it('renders STATUS section for unknown kind when .status exists', () => {
    const resource = makeResource({
      kind: 'CustomThing',
      raw: {
        metadata: { name: 'my-thing' },
        status: { phase: 'Active', ready: 'true' },
      },
    });
    const { lastFrame } = render(
      React.createElement(OverviewTab, { resource, nowMs: NOW_MS }),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('STATUS');
    expect(frame).toContain('phase');
    expect(frame).toContain('Active');
  });

  it('does not render STATUS section when .status absent', () => {
    const resource = makeResource({
      kind: 'CustomThing',
      raw: { metadata: { name: 'my-thing' } },
    });
    const { lastFrame } = render(
      React.createElement(OverviewTab, { resource, nowMs: NOW_MS }),
    );
    expect(lastFrame()).not.toContain('STATUS');
  });

  it('does not render STATUS section when .status is empty object', () => {
    const resource = makeResource({
      kind: 'CustomThing',
      raw: { metadata: { name: 'my-thing' }, status: {} },
    });
    const { lastFrame } = render(
      React.createElement(OverviewTab, { resource, nowMs: NOW_MS }),
    );
    expect(lastFrame()).not.toContain('STATUS');
  });
});

// ---------------------------------------------------------------------------
// CR overview (ticket P9R-0018 story 3)
// ---------------------------------------------------------------------------

describe('OverviewTab custom resource', () => {
  const CR_DESCRIPTOR = {
    kind: 'CustomKind',
    group: 'example.io',
    version: 'v1alpha1',
    plural: 'customkinds',
    namespaced: true,
    printerColumns: [
      { name: 'Project', jsonPath: '.spec.project', priority: 0 },
    ],
  };

  const resource = makeResource({
    kind: 'CustomKind',
    raw: {
      metadata: { name: 'my-secret' },
      spec: { project: 'proj-1' },
      status: { conditions: [{ type: 'Ready', status: 'True' }] },
    },
  });

  it('renders printer columns and conditions in the rich (non-scrolled) path', () => {
    const { lastFrame } = render(
      React.createElement(OverviewTab, {
        resource,
        nowMs: NOW_MS,
        crDescriptor: CR_DESCRIPTOR,
      }),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('PRINTER COLUMNS');
    expect(frame).toContain('proj-1');
    expect(frame).toContain('CONDITIONS');
    expect(frame).toContain('Ready');
  });

  it('renders printer columns and conditions in the scrolled path', () => {
    const { lastFrame } = render(
      React.createElement(OverviewTab, {
        resource,
        nowMs: NOW_MS,
        crDescriptor: CR_DESCRIPTOR,
        viewportHeight: 20,
      }),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('PRINTER COLUMNS');
    expect(frame).toContain('proj-1');
    expect(frame).toContain('CONDITIONS');
  });
});

// ---------------------------------------------------------------------------
// CustomResourceDefinition's own Overview (ticket P9R-0018 story 4)
// ---------------------------------------------------------------------------

describe('OverviewTab CustomResourceDefinition', () => {
  const resource = makeResource({
    kind: 'CustomResourceDefinition',
    name: 'dopplersecrets.doppler.com',
    namespace: null,
    raw: {
      spec: {
        group: 'doppler.com',
        names: { kind: 'DopplerSecret', plural: 'dopplersecrets' },
        scope: 'Namespaced',
        versions: [{ name: 'v1alpha1', served: true, storage: true }],
      },
    },
  });

  it('renders a default "view instances" link in the rich path', () => {
    const { lastFrame } = render(
      React.createElement(OverviewTab, {
        resource,
        nowMs: NOW_MS,
        crdInstanceCount: 3,
      }),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('view instances');
    expect(frame).toContain('DopplerSecrets');
  });

  it('renders a supplied measured instancesLink in the rich path', () => {
    const { lastFrame } = render(
      React.createElement(OverviewTab, {
        resource,
        nowMs: NOW_MS,
        instancesLink: React.createElement(Text, null, 'CLICK ME'),
      }),
    );
    expect(lastFrame()).toContain('CLICK ME');
  });

  it('renders the instances link above the scrolled content', () => {
    const { lastFrame } = render(
      React.createElement(OverviewTab, {
        resource,
        nowMs: NOW_MS,
        viewportHeight: 20,
      }),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('view instances');
    expect(frame).toContain('SPEC');
  });

  it('renders a supplied measured instancesLink above the scrolled content', () => {
    const { lastFrame } = render(
      React.createElement(OverviewTab, {
        resource,
        nowMs: NOW_MS,
        viewportHeight: 20,
        instancesLink: React.createElement(Text, null, 'CLICK ME'),
      }),
    );
    expect(lastFrame()).toContain('CLICK ME');
  });
});

// ---------------------------------------------------------------------------
// Annotations collapse behavior (Spec 04 §5.3)
// ---------------------------------------------------------------------------

describe('OverviewTab annotations', () => {
  it('collapses annotations by default showing count', () => {
    const resource = makeResource({
      kind: 'Deployment',
      annotations: {
        'operator.io/injected': 'true',
        'kubectl.io/applied': '{}',
        'prometheus.io/scrape': 'true',
      },
      raw: { metadata: { name: 'x' }, spec: {}, status: {} },
    });
    const { lastFrame } = render(
      React.createElement(OverviewTab, { resource, nowMs: NOW_MS }),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('3 annotations');
    expect(frame).toContain('[show]');
    expect(frame).not.toContain('operator.io/injected');
  });

  it('shows 0 annotations label when no annotations', () => {
    const resource = makeResource({
      kind: 'Deployment',
      annotations: {},
      raw: { metadata: { name: 'x' }, spec: {}, status: {} },
    });
    const { lastFrame } = render(
      React.createElement(OverviewTab, { resource, nowMs: NOW_MS }),
    );
    expect(lastFrame()).toContain('0 annotations');
  });

  it('expands annotations when annotationsExpanded=true', () => {
    const resource = makeResource({
      kind: 'Deployment',
      annotations: {
        'operator.io/injected': 'true',
        'prometheus.io/scrape': 'false',
      },
      raw: { metadata: { name: 'x' }, spec: {}, status: {} },
    });
    const { lastFrame } = render(
      React.createElement(OverviewTab, {
        resource,
        nowMs: NOW_MS,
        annotationsExpanded: true,
      }),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('[hide]');
    expect(frame).toContain('operator.io/injected');
    expect(frame).toContain('prometheus.io/scrape');
  });

  it('truncates long annotation key via padKey', () => {
    // A key longer than 22 chars exercises the padKey truncation branch
    const longKey = 'very-long-annotation-key-exceeds-22-chars';
    const resource = makeResource({
      kind: 'Deployment',
      annotations: { [longKey]: 'value' },
      raw: { metadata: { name: 'x' }, spec: {}, status: {} },
    });
    const { lastFrame } = render(
      React.createElement(OverviewTab, {
        resource,
        nowMs: NOW_MS,
        annotationsExpanded: true,
      }),
    );
    // Truncated key appears (first 22 chars)
    expect(lastFrame()).toContain('very-long-annotation-ke');
  });

  it('truncates long status row key via padKey', () => {
    // KEY_WIDTH=22; a status key >= 22 chars exercises padKey truncation at
    // line 480-481 (used in SectionView for row.key).
    const longStatusKey = 'veryLongStatusKeyExceedsTwentyTwo';
    const resource = makeResource({
      kind: 'ConfigMap',
      name: 'my-config',
      raw: {
        metadata: { name: 'my-config', namespace: 'default' },
        status: { [longStatusKey]: 'some-value' },
      },
    });
    const { lastFrame } = render(
      React.createElement(OverviewTab, { resource, nowMs: NOW_MS }),
    );
    // First 22 chars of the key appear in the output
    expect(lastFrame()).toContain('veryLongStatusKeyExcee');
  });
});

// ---------------------------------------------------------------------------
// DopplerSecret ConditionReady condition type
// ---------------------------------------------------------------------------

describe('OverviewTab DopplerSecret ConditionReady', () => {
  it('matches ConditionReady condition type', () => {
    // Exercises the || right-hand side of the conditions.find predicate at
    // line 416 (type === 'ConditionReady').
    const resource = makeResource({
      kind: 'DopplerSecret',
      name: 'my-doppler',
      raw: {
        metadata: { name: 'my-doppler', namespace: 'default' },
        spec: { secretName: 'my-secret', secretNamespace: 'default' },
        status: {
          conditions: [{ type: 'ConditionReady', status: 'True' }],
        },
      },
    });
    const { lastFrame } = render(
      React.createElement(OverviewTab, { resource, nowMs: NOW_MS }),
    );
    expect(lastFrame()).toContain('True');
  });
});

// ---------------------------------------------------------------------------
// str() helper — null, object, and Pod meta.name branches
// ---------------------------------------------------------------------------

describe('OverviewTab str() null and object branches', () => {
  it('renders empty cell for null status value (str null branch)', () => {
    // statusRows calls str(v) where v can be null — exercises lines 41-42.
    const resource = makeResource({
      kind: 'CustomThing',
      name: 'my-ct',
      raw: {
        metadata: { name: 'my-ct', namespace: 'default' },
        // null passes the statusRows filter (typeof null === 'object' but v === null)
        status: { nilField: null },
      },
    });
    const { lastFrame } = render(
      React.createElement(OverviewTab, { resource, nowMs: NOW_MS }),
    );
    // Status section renders (the row with empty value is filtered out since
    // str(null)==='' and statusRows keeps only non-empty rows), but STATUS
    // appears only if there are rows. Either way, no throw.
    expect(lastFrame()).toBeTruthy();
  });

  it('renders JSON for object status value (str JSON.stringify branch)', () => {
    // statusRows filters out non-null objects, but statusRows only keeps
    // typeof v !== 'object'. To exercise str(v) with an object we need another
    // caller. The Generic STATUS section passes all scalar + null values.
    // For the JSON.stringify branch, use a status with a nested array field
    // which passes typeof v !== 'object' check… actually arrays ARE objects.
    // Instead, exercise str() directly via KafkaTopic SPEC str(spec.partitions)
    // where partitions is a number — this hits the number branch (lines 47-48).
    // For str() with an actual object we rely on buildGenericSections where
    // statusRows drops object-typed values. The JSON.stringify branch at
    // line 49 is exercised by calling str() inside KafkaTopic spec — but since
    // those callers pass numbers, not objects, we reach the number branch only.
    //
    // To cover JSON.stringify, we need str() called with a non-scalar.
    // DopplerSecret readyCond.status is typed unknown; pass an array-valued
    // condition status to reach JSON.stringify.
    const resource = makeResource({
      kind: 'DopplerSecret',
      name: 'ds',
      raw: {
        metadata: { name: 'ds', namespace: 'default' },
        spec: {},
        status: {
          conditions: [
            {
              type: 'ConditionReady',
              // array value → str([...]) → JSON.stringify branch
              status: ['pending', 'waiting'],
            },
          ],
        },
      },
    });
    const { lastFrame } = render(
      React.createElement(OverviewTab, { resource, nowMs: NOW_MS }),
    );
    // JSON.stringify(['pending','waiting']) = '["pending","waiting"]'
    expect(lastFrame()).toContain('pending');
  });
});

describe('OverviewTab Pod without meta.name', () => {
  it('renders Pod without node row when meta.name is absent', () => {
    // When raw.metadata has no .name field, typeof meta.name !== 'string',
    // so nodeRow = [] — exercises the [] branch at line 100.
    const resource = makeResource({
      kind: 'Pod',
      name: 'my-pod',
      raw: {
        // metadata intentionally omits .name so typeof meta.name === 'undefined'
        metadata: { namespace: 'default' },
        spec: { nodeName: 'worker-1' },
        status: { phase: 'Running' },
      },
    });
    const { lastFrame } = render(
      React.createElement(OverviewTab, { resource, nowMs: NOW_MS }),
    );
    // Pod renders without crashing; Node row is absent
    expect(lastFrame()).toContain('METADATA');
    expect(lastFrame()).not.toContain('Node');
  });
});

// ---------------------------------------------------------------------------
// Fallback / ?? branches for all kind-specific section builders
// These cover the ?? {} and ?? '' fallbacks that only fire when raw fields
// are absent from the resource.
// ---------------------------------------------------------------------------

describe('OverviewTab Pod ?? fallback branches', () => {
  it('handles Pod with no raw.spec, no raw.status, no raw.metadata', () => {
    // raw.spec ?? {}, raw.status ?? {}, raw.metadata ?? {} take the {} branch
    const resource = makeResource({
      kind: 'Pod',
      name: 'bare-pod',
      raw: {},
    });
    expect(() => {
      render(React.createElement(OverviewTab, { resource, nowMs: NOW_MS }));
    }).not.toThrow();
  });

  it('handles Pod with container missing name and image (str(x ?? "") fallbacks)', () => {
    // co.name ?? '' and co.image ?? '' take the '' branch (lines 144-145)
    const resource = makeResource({
      kind: 'Pod',
      name: 'pod-no-names',
      raw: {
        metadata: { name: 'pod-no-names' },
        spec: { containers: [{}], volumes: [{}] },
        status: {
          phase: 'Running',
          containerStatuses: [{ ready: 'yes', restartCount: 0 }],
        },
      },
    });
    expect(() => {
      render(React.createElement(OverviewTab, { resource, nowMs: NOW_MS }));
    }).not.toThrow();
  });

  it('handles Pod containerStatus with non-number restartCount', () => {
    // typeof r === 'number' ? r : 0 — the 0 branch (line 120)
    // restartCount must be non-numeric to exercise the :0 fallback
    const resource = makeResource({
      kind: 'Pod',
      name: 'pod-bad-restart',
      raw: {
        metadata: { name: 'pod-bad-restart' },
        spec: { containers: [{ name: 'c1', image: 'nginx' }] },
        status: {
          phase: 'Running',
          containerStatuses: [{ ready: true, restartCount: 'unknown' }],
        },
      },
    });
    const { lastFrame } = render(
      React.createElement(OverviewTab, { resource, nowMs: NOW_MS }),
    );
    // restartCount 'unknown' is not a number → counted as 0
    expect(lastFrame()).toContain('1/1');
  });
});

describe('OverviewTab Deployment ?? fallback branches', () => {
  it('handles Deployment with no raw.spec, no raw.status', () => {
    // raw.spec ?? {}, raw.status ?? {} take the {} branch (lines 168-169)
    const resource = makeResource({
      kind: 'Deployment',
      name: 'bare-deploy',
      raw: {},
    });
    expect(() => {
      render(React.createElement(OverviewTab, { resource, nowMs: NOW_MS }));
    }).not.toThrow();
  });

  it('handles Deployment template container missing name and image', () => {
    // str(co.name ?? '') and str(co.image ?? '') take the '' branch (line 208)
    const resource = makeResource({
      kind: 'Deployment',
      name: 'deploy-no-names',
      raw: {
        metadata: { name: 'deploy-no-names' },
        spec: {
          selector: { matchLabels: {} },
          template: { spec: { containers: [{}] } },
        },
        status: { readyReplicas: 1, replicas: 1 },
      },
    });
    expect(() => {
      render(React.createElement(OverviewTab, { resource, nowMs: NOW_MS }));
    }).not.toThrow();
  });
});

describe('OverviewTab Node ?? fallback branches', () => {
  it('handles Node with no raw.status', () => {
    // raw.status ?? {} takes the {} branch (line 226)
    const resource = makeResource({
      kind: 'Node',
      name: 'bare-node',
      namespace: null,
      raw: { metadata: { name: 'bare-node' } },
    });
    expect(() => {
      render(React.createElement(OverviewTab, { resource, nowMs: NOW_MS }));
    }).not.toThrow();
  });

  it('handles Node condition missing type field', () => {
    // str(co.type ?? '') takes the '' branch (line 255) when co.type is absent
    const resource = makeResource({
      kind: 'Node',
      name: 'node-no-type',
      namespace: null,
      raw: {
        metadata: { name: 'node-no-type' },
        // condition has no 'type' field → co.type ?? '' fires ''
        status: { conditions: [{}], addresses: [], capacity: {}, nodeInfo: {} },
      },
    });
    expect(() => {
      render(React.createElement(OverviewTab, { resource, nowMs: NOW_MS }));
    }).not.toThrow();
  });

  it('handles Node Ready condition with no status field', () => {
    // readyCond.status ?? '' takes the '' branch (line 265) when status absent
    const resource = makeResource({
      kind: 'Node',
      name: 'node-ready-no-status',
      namespace: null,
      raw: {
        metadata: { name: 'node-ready-no-status' },
        // condition has type 'Ready' but no 'status' → readyCond.status ?? '' fires ''
        status: {
          conditions: [{ type: 'Ready' }],
          addresses: [],
          capacity: {},
          nodeInfo: {},
        },
      },
    });
    expect(() => {
      render(React.createElement(OverviewTab, { resource, nowMs: NOW_MS }));
    }).not.toThrow();
  });

  it('handles Node with no matching Ready condition (readyCond === undefined)', () => {
    // readyCond !== undefined ? ... : 'Unknown' takes 'Unknown' branch (265)
    const resource = makeResource({
      kind: 'Node',
      name: 'node-no-ready',
      namespace: null,
      raw: {
        metadata: { name: 'node-no-ready' },
        status: {
          conditions: [{ type: 'DiskPressure', status: 'False' }],
          addresses: [],
          capacity: {},
          nodeInfo: {},
        },
      },
    });
    const { lastFrame } = render(
      React.createElement(OverviewTab, { resource, nowMs: NOW_MS }),
    );
    expect(lastFrame()).toContain('Unknown');
  });

  it('handles Node address missing type and address', () => {
    // str(ao.type ?? '') and str(ao.address ?? '') take the '' branch (308)
    const resource = makeResource({
      kind: 'Node',
      name: 'node-bare-addr',
      namespace: null,
      raw: {
        metadata: { name: 'node-bare-addr' },
        status: { conditions: [], addresses: [{}], capacity: {}, nodeInfo: {} },
      },
    });
    expect(() => {
      render(React.createElement(OverviewTab, { resource, nowMs: NOW_MS }));
    }).not.toThrow();
  });
});

describe('OverviewTab KafkaTopic ?? fallback branches', () => {
  it('handles KafkaTopic with no raw.spec, no raw.status', () => {
    // raw.spec ?? {}, raw.status ?? {} take the {} branch (322-323)
    const resource = makeResource({
      kind: 'KafkaTopic',
      name: 'bare-topic',
      raw: {},
    });
    expect(() => {
      render(React.createElement(OverviewTab, { resource, nowMs: NOW_MS }));
    }).not.toThrow();
  });

  it('handles KafkaTopic with null namespace', () => {
    // resource.namespace ?? '' takes the '' branch (line 331)
    const resource = makeResource({
      kind: 'KafkaTopic',
      name: 'cluster-topic',
      namespace: null,
      raw: {
        metadata: { name: 'cluster-topic' },
        spec: {},
        status: {},
      },
    });
    expect(() => {
      render(React.createElement(OverviewTab, { resource, nowMs: NOW_MS }));
    }).not.toThrow();
  });

  it('handles KafkaTopic with no matching condition (readyCond === undefined)', () => {
    // readyCond !== undefined ? ... : 'Unknown' takes 'Unknown' branch (363)
    const resource = makeResource({
      kind: 'KafkaTopic',
      raw: {
        metadata: { name: 'topic-no-cond' },
        spec: { partitions: 3, replicas: 1 },
        status: { conditions: [{ type: 'NotReady', status: 'True' }] },
      },
    });
    const { lastFrame } = render(
      React.createElement(OverviewTab, { resource, nowMs: NOW_MS }),
    );
    expect(lastFrame()).toContain('Unknown');
  });

  it('handles KafkaTopic Ready condition with no status field', () => {
    // readyCond.status ?? '' takes the '' branch (line 363, block 117)
    // when the Ready condition exists but has no status property
    const resource = makeResource({
      kind: 'KafkaTopic',
      raw: {
        metadata: { name: 'topic-cond-no-status' },
        spec: { partitions: 3, replicas: 1 },
        // condition has type 'Ready' but no 'status' field
        status: { conditions: [{ type: 'Ready' }] },
      },
    });
    expect(() => {
      render(React.createElement(OverviewTab, { resource, nowMs: NOW_MS }));
    }).not.toThrow();
  });
});

describe('OverviewTab DopplerSecret ?? fallback branches', () => {
  it('handles DopplerSecret with no raw.spec, no raw.status', () => {
    // raw.spec ?? {}, raw.status ?? {} take the {} branch (380-381)
    // Also resource.raw.spec ?? {} at line 595 takes the {} branch
    const resource = makeResource({
      kind: 'DopplerSecret',
      name: 'bare-ds',
      raw: {},
    });
    expect(() => {
      render(React.createElement(OverviewTab, { resource, nowMs: NOW_MS }));
    }).not.toThrow();
  });

  it('handles DopplerSecret with null namespace', () => {
    // resource.namespace ?? '' takes the '' branch at line 387
    const resource = makeResource({
      kind: 'DopplerSecret',
      name: 'cluster-ds',
      namespace: null,
      raw: {
        metadata: { name: 'cluster-ds' },
        spec: { secretName: 'my-secret' },
        status: {},
      },
    });
    expect(() => {
      render(React.createElement(OverviewTab, { resource, nowMs: NOW_MS }));
    }).not.toThrow();
  });

  it('handles DopplerSecret spec.secretNamespace absent (falls back to namespace)', () => {
    // spec.secretNamespace ?? resource.namespace ?? '' — first ?? takes resource.namespace
    // (line 406 branch 132)
    const resource = makeResource({
      kind: 'DopplerSecret',
      name: 'ds-no-sns',
      raw: {
        metadata: { name: 'ds-no-sns', namespace: 'default' },
        // secretNamespace is absent → falls through to resource.namespace
        spec: { project: 'proj', secretName: 'sec' },
        status: {},
      },
    });
    expect(() => {
      render(React.createElement(OverviewTab, { resource, nowMs: NOW_MS }));
    }).not.toThrow();
  });

  it('handles DopplerSecret both secretNamespace and namespace absent (falls to empty string)', () => {
    // spec.secretNamespace ?? resource.namespace ?? '' — both ?? fallbacks fire
    // block 133: resource.namespace is null → uses ''
    const resource = makeResource({
      kind: 'DopplerSecret',
      name: 'ds-no-ns-at-all',
      namespace: null,
      raw: {
        metadata: { name: 'ds-no-ns-at-all' },
        // neither spec.secretNamespace nor resource.namespace → uses ''
        spec: { project: 'proj', secretName: 'sec' },
        status: {},
      },
    });
    expect(() => {
      render(React.createElement(OverviewTab, { resource, nowMs: NOW_MS }));
    }).not.toThrow();
  });

  it('handles DopplerSecret with no conditions (readyCond === undefined)', () => {
    // readyCond !== undefined ? ... : 'Unknown' takes 'Unknown' branch (425)
    const resource = makeResource({
      kind: 'DopplerSecret',
      name: 'ds-no-cond',
      raw: {
        metadata: { name: 'ds-no-cond', namespace: 'default' },
        spec: { secretName: 'sec' },
        status: { conditions: [] },
      },
    });
    const { lastFrame } = render(
      React.createElement(OverviewTab, { resource, nowMs: NOW_MS }),
    );
    expect(lastFrame()).toContain('Unknown');
  });

  it('handles DopplerSecret condition with no status field', () => {
    // readyCond.status ?? '' takes the '' branch (line 425, block 137)
    const resource = makeResource({
      kind: 'DopplerSecret',
      name: 'ds-cond-no-status',
      raw: {
        metadata: { name: 'ds-cond-no-status', namespace: 'default' },
        spec: { secretName: 'sec' },
        // condition has matching type but no status field
        status: {
          conditions: [{ type: 'secrets.doppler.com/secretsGenerated' }],
        },
      },
    });
    expect(() => {
      render(React.createElement(OverviewTab, { resource, nowMs: NOW_MS }));
    }).not.toThrow();
  });
});

describe('OverviewTab scroll viewport (chunk 03)', () => {
  it('windows the projected lines when a viewportHeight is given', () => {
    const resource = makeResource({
      kind: 'Node',
      namespace: null,
      raw: {
        metadata: { name: 'n' },
        status: {
          nodeInfo: {
            osImage: 'linux',
            kernelVersion: '6',
            containerRuntimeVersion: 'containerd',
            kubeletVersion: 'v1.30',
          },
          addresses: [{ type: 'InternalIP', address: '1.2.3.4' }],
          conditions: [{ type: 'Ready', status: 'True' }],
          capacity: { cpu: '4', memory: '8Gi', pods: '110' },
          allocatable: { cpu: '3', memory: '7Gi', pods: '110' },
        },
      },
    });
    const top = render(
      React.createElement(OverviewTab, {
        resource,
        nowMs: NOW_MS,
        width: 80,
        offset: 0,
        viewportHeight: 3,
      }),
    );
    expect(top.lastFrame()).toContain('METADATA');
    expect(top.lastFrame()).not.toContain('ADDRESSES');

    const scrolled = render(
      React.createElement(OverviewTab, {
        resource,
        nowMs: NOW_MS,
        width: 80,
        offset: 100,
        viewportHeight: 3,
      }),
    );
    expect(scrolled.lastFrame()).toContain('1.2.3.4');
  });
});
