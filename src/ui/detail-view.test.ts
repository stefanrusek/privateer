import { describe, it, expect } from 'vitest';
import {
  clipLine,
  buildOverviewSections,
  projectOverviewLines,
  projectEventsLines,
  projectYamlReadLines,
  projectMetricsLines,
  type MetricsProjectionInput,
} from './detail-view.js';
import type { ResourceObject } from '../core/types.js';
import type { MetricSeries } from '../boundaries/metrics-source.js';
import type { ExporterCapabilities } from '../metrics/exporters.js';
import type { EventRow } from './components/EventsTab.js';

const NOW_MS = new Date('2026-06-10T13:00:00Z').getTime();

function makeResource(
  overrides: Partial<ResourceObject> & { kind: string },
): ResourceObject {
  return {
    uid: 'uid-1',
    kind: overrides.kind,
    apiVersion: 'v1',
    name: overrides.name ?? 'res',
    namespace: overrides.namespace !== undefined ? overrides.namespace : 'ns',
    labels: overrides.labels ?? {},
    annotations: overrides.annotations ?? {},
    creationTimestamp: overrides.creationTimestamp ?? '2026-06-10T11:00:00Z',
    resourceVersion: '1',
    status: overrides.status ?? { color: 'green', label: 'Ready' },
    raw: overrides.raw ?? { metadata: { name: overrides.name ?? 'res' } },
  };
}

const ALL_CAPS: ExporterCapabilities = {
  cadvisor: true,
  kubeStateMetrics: true,
  kafkaExporter: true,
  strimziJmx: true,
};
const NO_CAPS: ExporterCapabilities = {
  cadvisor: false,
  kubeStateMetrics: false,
  kafkaExporter: false,
  strimziJmx: false,
};

function series(
  values: number[],
  labels: Record<string, string> = {},
): MetricSeries {
  return {
    labels,
    points: values.map((v, i) => ({ timestampMs: i * 1000, value: v })),
  };
}

function metricsInput(
  overrides: Partial<MetricsProjectionInput>,
): MetricsProjectionInput {
  return {
    resourceKind: 'Pod',
    resourceName: 'p1',
    tier: 'prometheus',
    capabilities: ALL_CAPS,
    chartWidth: 40,
    cpuSeries: [],
    memorySeries: [],
    networkInSeries: [],
    networkOutSeries: [],
    restartSeries: [],
    replicaSeries: [],
    lagSeries: [],
    rangeOptions: ['1h', '6h'],
    rangeSelected: '1h',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// clipLine
// ---------------------------------------------------------------------------

describe('clipLine', () => {
  it('clips to width', () => {
    expect(clipLine('abcdef', 3)).toBe('abc');
  });
  it('returns short strings unchanged', () => {
    expect(clipLine('ab', 5)).toBe('ab');
  });
  it('clips to empty for non-positive width', () => {
    expect(clipLine('abc', 0)).toBe('');
    expect(clipLine('abc', -2)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Overview sections per kind
// ---------------------------------------------------------------------------

describe('buildOverviewSections', () => {
  it('Pod: metadata/status/containers/volumes', () => {
    const r = makeResource({
      kind: 'Pod',
      name: 'pod-a',
      raw: {
        metadata: { name: 'pod-a' },
        spec: {
          nodeName: 'node-1',
          containers: [{ name: 'app', image: 'nginx' }],
          volumes: [{ name: 'data' }],
        },
        status: {
          phase: 'Running',
          podIP: '10.0.0.1',
          hostIP: '10.0.0.2',
          qosClass: 'Burstable',
          containerStatuses: [{ ready: true, restartCount: 2 }],
        },
      },
    });
    const secs = buildOverviewSections(r, NOW_MS);
    const titles = secs.map((s) => s.title);
    expect(titles).toEqual(['METADATA', 'STATUS', 'CONTAINERS', 'VOLUMES']);
  });

  it('Pod: tolerates missing specs/001-initial-features/status', () => {
    const r = makeResource({ kind: 'Pod', raw: {} });
    const secs = buildOverviewSections(r, NOW_MS);
    expect(secs[0]?.title).toBe('METADATA');
  });

  it('Deployment', () => {
    const r = makeResource({
      kind: 'Deployment',
      raw: {
        metadata: { name: 'd' },
        spec: {
          strategy: { type: 'RollingUpdate' },
          selector: { matchLabels: { app: 'd' } },
          template: {
            metadata: { labels: { tier: 'web' } },
            spec: { containers: [{ name: 'c', image: 'img' }] },
          },
        },
        status: {
          replicas: 3,
          readyReplicas: 3,
          updatedReplicas: 3,
          availableReplicas: 3,
        },
      },
    });
    const titles = buildOverviewSections(r, NOW_MS).map((s) => s.title);
    expect(titles).toContain('STATUS');
    expect(titles).toContain('SELECTOR');
    expect(titles).toContain('TEMPLATE');
  });

  it('Node', () => {
    const r = makeResource({
      kind: 'Node',
      namespace: null,
      labels: { role: 'worker' },
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
    const titles = buildOverviewSections(r, NOW_MS).map((s) => s.title);
    expect(titles).toEqual([
      'METADATA',
      'STATUS',
      'CAPACITY',
      'SYSTEM',
      'ADDRESSES',
    ]);
  });

  it('Node without Ready condition shows Unknown', () => {
    const r = makeResource({
      kind: 'Node',
      namespace: null,
      raw: { metadata: { name: 'n' }, status: { conditions: [] } },
    });
    const status = buildOverviewSections(r, NOW_MS).find(
      (s) => s.title === 'STATUS',
    );
    expect(status?.rows[0]?.value).toBe('Unknown');
  });

  it('KafkaTopic', () => {
    const r = makeResource({
      kind: 'KafkaTopic',
      raw: {
        metadata: { name: 'kt' },
        spec: { partitions: 3, replicas: 2, cleanupPolicy: 'delete' },
        status: {
          conditions: [{ type: 'Ready', status: 'True' }],
          observedGeneration: 1,
        },
      },
    });
    const titles = buildOverviewSections(r, NOW_MS).map((s) => s.title);
    expect(titles).toEqual(['METADATA', 'SPEC', 'STATUS']);
  });

  it('KafkaTopic without Ready condition shows Unknown', () => {
    const r = makeResource({
      kind: 'KafkaTopic',
      raw: { metadata: { name: 'kt' }, spec: {}, status: {} },
    });
    const status = buildOverviewSections(r, NOW_MS).find(
      (s) => s.title === 'STATUS',
    );
    expect(status?.rows[0]?.value).toBe('Unknown');
  });

  it('DopplerSecret with ready condition', () => {
    const r = makeResource({
      kind: 'DopplerSecret',
      raw: {
        metadata: { name: 'ds' },
        spec: {
          project: 'proj',
          config: 'prd',
          secretName: 'managed',
          secretNamespace: 'ns2',
        },
        status: {
          conditions: [{ type: 'ConditionReady', status: 'True' }],
          lastSyncTime: '2026-06-10T12:00:00Z',
        },
      },
    });
    const titles = buildOverviewSections(r, NOW_MS).map((s) => s.title);
    expect(titles).toEqual(['METADATA', 'SPEC', 'STATUS']);
  });

  it('DopplerSecret without ready condition shows Unknown', () => {
    const r = makeResource({
      kind: 'DopplerSecret',
      raw: { metadata: { name: 'ds' }, spec: {}, status: {} },
    });
    const status = buildOverviewSections(r, NOW_MS).find(
      (s) => s.title === 'STATUS',
    );
    expect(status?.rows[0]?.value).toBe('Unknown');
  });

  it('Generic kind without status returns just metadata', () => {
    const r = makeResource({ kind: 'ConfigMap', raw: { metadata: {} } });
    const secs = buildOverviewSections(r, NOW_MS);
    expect(secs).toHaveLength(1);
    expect(secs[0]?.title).toBe('METADATA');
  });

  it('Generic kind with status returns status rows', () => {
    const r = makeResource({
      kind: 'Service',
      raw: { metadata: {}, status: { loadBalancer: {}, ready: true } },
    });
    const secs = buildOverviewSections(r, NOW_MS);
    expect(secs.map((s) => s.title)).toEqual(['METADATA', 'STATUS']);
  });

  it('Generic status with a null scalar renders empty value', () => {
    const r = makeResource({
      kind: 'Service',
      raw: { metadata: {}, status: { phase: null, ok: true } },
    });
    const status = buildOverviewSections(r, NOW_MS).find(
      (s) => s.title === 'STATUS',
    );
    expect(status?.rows.find((row) => row.key === 'phase')?.value).toBe('');
  });

  it('serializes object-valued scalars (nodeName / image) via JSON', () => {
    const pod = makeResource({
      kind: 'Pod',
      raw: {
        metadata: { name: 'p' },
        spec: { nodeName: { complex: true } },
        status: {},
      },
    });
    const meta = buildOverviewSections(pod, NOW_MS)[0];
    expect(meta?.rows.find((row) => row.key === 'Node')?.value).toContain(
      'complex',
    );

    const dep = makeResource({
      kind: 'Deployment',
      raw: {
        metadata: {},
        spec: { template: { spec: { containers: [{ image: { a: 1 } }] } } },
        status: {},
      },
    });
    const tpl = buildOverviewSections(dep, NOW_MS).find(
      (s) => s.title === 'TEMPLATE',
    );
    expect(tpl?.rows.some((row) => row.value.includes('"a"'))).toBe(true);
  });

  it('Pod with empty status values drops those rows', () => {
    const r = makeResource({
      kind: 'Pod',
      raw: { metadata: { name: 'p' }, spec: {}, status: {} },
    });
    const status = buildOverviewSections(r, NOW_MS).find(
      (s) => s.title === 'STATUS',
    );
    // Phase/IP/QoS empty → filtered; only Ready (0/0) and Restarts (0) remain.
    expect(status?.rows.some((row) => row.key === 'Pod IP')).toBe(false);
  });

  it('Deployment with empty status filters placeholder rows', () => {
    const r = makeResource({
      kind: 'Deployment',
      raw: {
        metadata: {},
        spec: { selector: { matchLabels: {} }, template: {} },
        status: {},
      },
    });
    const titles = buildOverviewSections(r, NOW_MS).map((s) => s.title);
    // STATUS all-empty → dropped; SELECTOR/TEMPLATE empty → dropped.
    expect(titles).toEqual(['METADATA']);
  });

  it('Node with empty capacity/system/addresses filters them out', () => {
    const r = makeResource({
      kind: 'Node',
      namespace: null,
      raw: {
        metadata: {},
        status: {
          conditions: [{ type: 'Ready', status: 'True' }],
          capacity: {},
          allocatable: {},
          nodeInfo: {},
          addresses: [],
        },
      },
    });
    const titles = buildOverviewSections(r, NOW_MS).map((s) => s.title);
    expect(titles).toEqual(['METADATA', 'STATUS']);
  });

  it('KafkaTopic/DopplerSecret with empty status fields drop rows', () => {
    const kt = makeResource({
      kind: 'KafkaTopic',
      raw: {
        metadata: {},
        spec: {},
        status: { conditions: [{ type: 'Ready', status: 'True' }] },
      },
    });
    const ktTitles = buildOverviewSections(kt, NOW_MS).map((s) => s.title);
    expect(ktTitles).not.toContain('SPEC');

    const ds = makeResource({
      kind: 'DopplerSecret',
      namespace: null,
      raw: {
        metadata: {},
        spec: {},
        status: { conditions: [{ type: 'ConditionReady', status: 'True' }] },
      },
    });
    const dsTitles = buildOverviewSections(ds, NOW_MS).map((s) => s.title);
    expect(dsTitles).not.toContain('SPEC');
  });

  it('tolerates raw with no specs/001-initial-features/status object at all', () => {
    for (const kind of ['Deployment', 'Node', 'KafkaTopic', 'DopplerSecret']) {
      const r = makeResource({
        kind,
        namespace: null,
        raw: { metadata: {} },
      });
      expect(buildOverviewSections(r, NOW_MS).length).toBeGreaterThan(0);
    }
  });

  it('Pod ignores non-numeric restartCount', () => {
    const r = makeResource({
      kind: 'Pod',
      raw: {
        metadata: { name: 'p' },
        spec: {},
        status: {
          phase: 'Running',
          containerStatuses: [{ ready: false, restartCount: 'x' }],
        },
      },
    });
    const status = buildOverviewSections(r, NOW_MS).find(
      (s) => s.title === 'STATUS',
    );
    expect(status?.rows.find((row) => row.key === 'Restarts')?.value).toBe('0');
  });

  it('Ready condition present with missing status renders empty', () => {
    const kt = makeResource({
      kind: 'KafkaTopic',
      raw: {
        metadata: {},
        spec: { partitions: 1 },
        status: { conditions: [{ type: 'Ready' }], observedGeneration: 4 },
      },
    });
    // The empty Ready value is filtered out of the STATUS rows, but the
    // `str(readyCond.status ?? '')` branch still runs to produce it.
    const ktStatus = buildOverviewSections(kt, NOW_MS).find(
      (s) => s.title === 'STATUS',
    );
    expect(ktStatus?.rows.some((r) => r.key === 'Ready')).toBe(false);

    const ds = makeResource({
      kind: 'DopplerSecret',
      raw: {
        metadata: {},
        spec: { project: 'p' },
        status: {
          conditions: [{ type: 'ConditionReady' }],
          lastSyncTime: '2026-06-10T12:00:00Z',
        },
      },
    });
    const dsStatus = buildOverviewSections(ds, NOW_MS).find(
      (s) => s.title === 'STATUS',
    );
    expect(dsStatus?.rows.some((r) => r.key === 'Sync Condition')).toBe(false);

    const node = makeResource({
      kind: 'Node',
      namespace: null,
      raw: {
        metadata: {},
        status: { conditions: [{ type: 'Ready' }] },
      },
    });
    const nodeStatus = buildOverviewSections(node, NOW_MS).find(
      (s) => s.title === 'STATUS',
    );
    // Node STATUS isn't value-filtered, so the empty Ready row stays.
    expect(nodeStatus?.rows.find((r) => r.key === 'Ready')?.value).toBe('');
  });

  it('metadata includes namespace only when set, and serializes object labels', () => {
    const r = makeResource({
      kind: 'ConfigMap',
      namespace: null,
      labels: { a: 'b' },
      annotations: { x: 'y', z: 'w' },
      raw: { metadata: {} },
    });
    const meta = buildOverviewSections(r, NOW_MS)[0];
    expect(meta?.rows.some((row) => row.key === 'Namespace')).toBe(false);
    expect(meta?.rows.find((row) => row.key === 'Annotations')?.value).toBe(
      '2 annotations',
    );
  });
});

// ---------------------------------------------------------------------------
// CR overview sections (ticket P9R-0018 story 3)
// ---------------------------------------------------------------------------

describe('buildOverviewSections — custom resources', () => {
  const CR_DESCRIPTOR = {
    kind: 'CustomKind',
    group: 'example.io',
    version: 'v1alpha1',
    plural: 'customkinds',
    namespaced: true,
    printerColumns: [
      { name: 'Project', jsonPath: '.spec.project', priority: 0 },
      { name: 'Config', jsonPath: '.spec.config', priority: 0 },
      { name: 'Missing', jsonPath: '.spec.nope', priority: 0 },
    ],
  };

  it('falls back to generic sections when no descriptor is supplied', () => {
    const r = makeResource({
      kind: 'CustomKind',
      raw: { metadata: {}, spec: { project: 'p' }, status: { phase: 'Ready' } },
    });
    const titles = buildOverviewSections(r, NOW_MS).map((s) => s.title);
    expect(titles).toEqual(['METADATA', 'STATUS']);
  });

  it('renders printer-column values and conditions when a descriptor is given', () => {
    const r = makeResource({
      kind: 'CustomKind',
      raw: {
        metadata: {},
        spec: { project: 'proj-1', config: 'prd' },
        status: {
          conditions: [
            { type: 'Ready', status: 'True' },
            { type: 'Synced', status: 'False' },
          ],
        },
      },
    });
    const sections = buildOverviewSections(r, NOW_MS, CR_DESCRIPTOR);
    const titles = sections.map((s) => s.title);
    expect(titles).toEqual(['METADATA', 'PRINTER COLUMNS', 'CONDITIONS']);

    const columns = sections.find((s) => s.title === 'PRINTER COLUMNS');
    expect(columns?.rows).toEqual([
      { key: 'Project', value: 'proj-1' },
      { key: 'Config', value: 'prd' },
      { key: 'Missing', value: '—' },
    ]);

    const conditions = sections.find((s) => s.title === 'CONDITIONS');
    expect(conditions?.rows).toEqual([
      { key: 'Ready', value: 'True' },
      { key: 'Synced', value: 'False' },
    ]);
  });

  it('omits the CONDITIONS section when status.conditions is absent', () => {
    const r = makeResource({
      kind: 'CustomKind',
      raw: { metadata: {}, spec: {} },
    });
    const descriptor = { ...CR_DESCRIPTOR, printerColumns: [] };
    const titles = buildOverviewSections(r, NOW_MS, descriptor).map(
      (s) => s.title,
    );
    expect(titles).toEqual(['METADATA']);
  });

  it('skips malformed condition entries without crashing', () => {
    const r = makeResource({
      kind: 'CustomKind',
      raw: {
        metadata: {},
        status: {
          conditions: [
            null,
            'oops',
            { status: 'True' },
            { type: 'Synced' },
            { type: 'Ready', status: 'True' },
          ],
        },
      },
    });
    const descriptor = { ...CR_DESCRIPTOR, printerColumns: [] };
    const conditions = buildOverviewSections(r, NOW_MS, descriptor).find(
      (s) => s.title === 'CONDITIONS',
    );
    expect(conditions?.rows).toEqual([
      { key: 'Synced', value: '' },
      { key: 'Ready', value: 'True' },
    ]);
  });
});

describe('projectOverviewLines', () => {
  it('emits a bold title, padded rows, and a blank spacer between sections', () => {
    const r = makeResource({
      kind: 'Service',
      raw: { metadata: {}, status: { ready: true } },
    });
    const lines = projectOverviewLines(r, NOW_MS, 80);
    expect(lines[0]).toMatchObject({ text: 'METADATA', bold: true });
    // a blank spacer precedes the second section
    expect(lines.some((l) => l.text === '')).toBe(true);
  });

  it('pads a long key by truncating it to the key column', () => {
    const r = makeResource({
      kind: 'Service',
      raw: {
        metadata: {},
        status: { aVeryLongStatusKeyNameExceedingTheKeyWidth: 'v' },
      },
    });
    const lines = projectOverviewLines(r, NOW_MS, 80);
    expect(lines.some((l) => l.text.includes('aVeryLongStatusKeyNam'))).toBe(
      true,
    );
  });

  it('tolerates containers/volumes/addresses missing fields', () => {
    const pod = makeResource({
      kind: 'Pod',
      raw: {
        metadata: { name: 'p' },
        spec: { containers: [{}], volumes: [{}] },
        status: {},
      },
    });
    expect(projectOverviewLines(pod, NOW_MS, 80).length).toBeGreaterThan(0);

    const dep = makeResource({
      kind: 'Deployment',
      raw: {
        metadata: {},
        spec: { template: { spec: { containers: [{}] } } },
        status: {},
      },
    });
    expect(projectOverviewLines(dep, NOW_MS, 80).length).toBeGreaterThan(0);

    const depNoContainers = makeResource({
      kind: 'Deployment',
      raw: { metadata: {}, spec: { template: { spec: {} } }, status: {} },
    });
    expect(
      projectOverviewLines(depNoContainers, NOW_MS, 80).length,
    ).toBeGreaterThan(0);

    const node = makeResource({
      kind: 'Node',
      namespace: null,
      raw: {
        metadata: {},
        status: { addresses: [{}], conditions: [{}] },
      },
    });
    expect(projectOverviewLines(node, NOW_MS, 80).length).toBeGreaterThan(0);
  });

  it('clips long values to width', () => {
    const r = makeResource({
      kind: 'ConfigMap',
      name: 'x'.repeat(100),
      raw: { metadata: {} },
    });
    const lines = projectOverviewLines(r, NOW_MS, 30);
    expect(lines.every((l) => l.text.length <= 30)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

function evt(over: Partial<EventRow>): EventRow {
  return {
    type: over.type ?? 'Normal',
    reason: over.reason ?? 'Started',
    lastTimestamp: over.lastTimestamp ?? '2026-06-10T12:59:00Z',
    count: over.count ?? 1,
    message: over.message ?? 'msg',
  };
}

describe('projectEventsLines', () => {
  it('empty + warnings filter shows "No warning events"', () => {
    const lines = projectEventsLines([], false, NOW_MS, 80);
    expect(lines.map((l) => l.text).join('\n')).toContain('No warning events');
  });

  it('empty + showAll shows "No events"', () => {
    const lines = projectEventsLines([], true, NOW_MS, 80);
    expect(lines.map((l) => l.text).join('\n')).toContain('No events');
  });

  it('renders header, divider, and warning rows in yellow', () => {
    const lines = projectEventsLines(
      [evt({ type: 'Warning', reason: 'BackOff', count: 5 }), evt({})],
      false,
      NOW_MS,
      120,
    );
    const text = lines.map((l) => l.text).join('\n');
    expect(text).toContain('Type');
    expect(text).toContain('Message');
    const warningRow = lines.find((l) => l.text.includes('BackOff'));
    expect(warningRow?.color).toBe('yellow');
    // normal row has no color
    const normalRow = lines.find((l) => l.text.includes('Started'));
    expect(normalRow?.color).toBeUndefined();
  });

  it('handles events with no timestamp (empty age)', () => {
    const lines = projectEventsLines(
      [evt({ lastTimestamp: '' })],
      true,
      NOW_MS,
      120,
    );
    expect(lines.length).toBeGreaterThan(2);
  });

  it('truncates over-wide type/reason columns', () => {
    const lines = projectEventsLines(
      [
        evt({
          type: 'SuperLongEventType',
          reason: 'AnExtremelyLongReasonStringValue',
          count: 99999999,
        }),
      ],
      true,
      NOW_MS,
      200,
    );
    expect(lines.length).toBeGreaterThan(2);
  });
});

// ---------------------------------------------------------------------------
// YAML read mode
// ---------------------------------------------------------------------------

describe('projectYamlReadLines', () => {
  it('shows [Edit]/[reveal] for unrevealed Secrets and masks values', () => {
    const yaml = 'apiVersion: v1\nkind: Secret\ndata:\n  password: c2VjcmV0';
    const lines = projectYamlReadLines(yaml, 'Secret', false, 80);
    expect(lines[0]?.text).toContain('[reveal]');
    // line-numbered body
    expect(lines[1]?.text).toContain('1 ');
    const body = lines.map((l) => l.text).join('\n');
    expect(body).toContain('••••••••');
    expect(body).not.toContain('c2VjcmV0');
  });

  it('reveals decoded Secret plaintext when revealed and swaps [reveal] for [hide]', () => {
    const yaml = 'kind: Secret\ndata:\n  k: dGVzdA==';
    const lines = projectYamlReadLines(yaml, 'Secret', true, 80);
    expect(lines[0]?.text).toBe('[Edit]  [hide]');
    const body = lines.map((l) => l.text).join('\n');
    // dGVzdA== base64-decodes to "test".
    expect(body).toContain('test');
  });

  it('hides managedFields by default with a [managed] chip, and shows them when managedVisible', () => {
    const yaml =
      'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: cfg\n  managedFields:\n    - manager: kubectl\ndata:\n  key: value';
    const hidden = projectYamlReadLines(yaml, 'ConfigMap', false, 80, false);
    expect(hidden[0]?.text).toBe('[Edit]  [managed]');
    expect(hidden.map((l) => l.text).join('\n')).not.toContain('managedFields');

    const shown = projectYamlReadLines(yaml, 'ConfigMap', false, 80, true);
    expect(shown[0]?.text).toBe('[Edit]  [hide managed]');
    expect(shown.map((l) => l.text).join('\n')).toContain('managedFields');
  });

  it('omits the [managed] chip when the resource has no managedFields', () => {
    const yaml =
      'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: cfg\ndata:\n  key: value';
    const lines = projectYamlReadLines(yaml, 'ConfigMap', false, 80);
    expect(lines[0]?.text).toBe('[Edit]');
  });

  it('non-Secret keys are coloured blue, value-only lines plain', () => {
    const lines = projectYamlReadLines(
      'key: value\n  plain',
      'ConfigMap',
      false,
      80,
    );
    const keyLine = lines.find((l) => l.text.includes('key:'));
    expect(keyLine?.color).toBe('blue');
    const plainLine = lines.find((l) => l.text.trimStart().startsWith('plain'));
    expect(plainLine?.color).toBeUndefined();
  });

  it('clips long lines to width', () => {
    const lines = projectYamlReadLines(
      'a: ' + 'z'.repeat(100),
      'ConfigMap',
      false,
      20,
    );
    expect(lines.every((l) => l.text.length <= 20)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

describe('projectMetricsLines', () => {
  it('tier none shows the no-metrics state', () => {
    const lines = projectMetricsLines(metricsInput({ tier: 'none' }), 80);
    expect(lines[0]?.text).toContain('No metrics available');
  });

  it('metrics-server tier shows the session banner and range selector', () => {
    const lines = projectMetricsLines(
      metricsInput({ tier: 'metrics-server' }),
      80,
    );
    const text = lines.map((l) => l.text).join('\n');
    expect(text).toContain('current values only');
    expect(text).toContain('[1h]*');
  });

  it('Pod with caps renders CPU/Memory/Network/Restart blocks', () => {
    const lines = projectMetricsLines(
      metricsInput({
        cpuSeries: [series([1, 2, 3])],
        memorySeries: [series([4, 5])],
        networkInSeries: [series([1])],
        restartSeries: [series([0, 1])],
      }),
      80,
    );
    const text = lines.map((l) => l.text).join('\n');
    expect(text).toContain('CPU Usage');
    expect(text).toContain('Restart Count');
  });

  it('Pod no-data series render "No data"', () => {
    const lines = projectMetricsLines(metricsInput({}), 80);
    expect(lines.some((l) => l.text === 'No data')).toBe(true);
  });

  it('Pod without caps shows missing-exporter notes', () => {
    const lines = projectMetricsLines(
      metricsInput({ capabilities: NO_CAPS }),
      80,
    );
    const text = lines.map((l) => l.text).join('\n');
    expect(text).toContain('cAdvisor exporter not detected');
    expect(text).toContain('kube-state-metrics exporter not detected');
  });

  it('Node with and without caps', () => {
    const withCaps = projectMetricsLines(
      metricsInput({
        resourceKind: 'Node',
        cpuSeries: [series([1])],
        memorySeries: [series([2])],
      }),
      80,
    );
    expect(withCaps.some((l) => l.text.includes('CPU Usage'))).toBe(true);
    const withoutCaps = projectMetricsLines(
      metricsInput({ resourceKind: 'Node', capabilities: NO_CAPS }),
      80,
    );
    expect(withoutCaps.some((l) => l.text.includes('CPU/Memory charts'))).toBe(
      true,
    );
  });

  it('Deployment/StatefulSet with and without caps', () => {
    const dep = projectMetricsLines(
      metricsInput({
        resourceKind: 'Deployment',
        cpuSeries: [series([1])],
        replicaSeries: [series([3])],
      }),
      80,
    );
    expect(dep.some((l) => l.text.includes('Replica Count'))).toBe(true);
    const ss = projectMetricsLines(
      metricsInput({ resourceKind: 'StatefulSet', capabilities: NO_CAPS }),
      80,
    );
    expect(ss.some((l) => l.text.includes('Replica count chart'))).toBe(true);
  });

  it('KafkaTopic lag with groups, no-data, and missing exporter', () => {
    const withLag = projectMetricsLines(
      metricsInput({
        resourceKind: 'KafkaTopic',
        lagSeries: [
          series([10, 20], { consumer_group: 'g1' }),
          series([5], { group: 'g2' }),
          series([1]),
        ],
      }),
      80,
    );
    const text = withLag.map((l) => l.text).join('\n');
    expect(text).toContain('g1');
    expect(text).toContain('group-2');

    const noLag = projectMetricsLines(
      metricsInput({ resourceKind: 'KafkaTopic', lagSeries: [] }),
      80,
    );
    expect(noLag.some((l) => l.text === 'No data')).toBe(true);

    const emptyPoints = projectMetricsLines(
      metricsInput({
        resourceKind: 'KafkaTopic',
        lagSeries: [series([], { consumer_group: 'g0' })],
      }),
      80,
    );
    // empty points → currentLag 0
    expect(emptyPoints.some((l) => l.text.includes('g0 (0)'))).toBe(true);

    const noExporter = projectMetricsLines(
      metricsInput({ resourceKind: 'KafkaTopic', capabilities: NO_CAPS }),
      80,
    );
    expect(noExporter.some((l) => l.text.includes('Consumer lag chart'))).toBe(
      true,
    );
  });

  it('unknown kind shows a placeholder', () => {
    const lines = projectMetricsLines(
      metricsInput({ resourceKind: 'Mystery' }),
      80,
    );
    expect(lines.some((l) => l.text.includes('No charts defined'))).toBe(true);
  });
});
