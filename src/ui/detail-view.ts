/**
 * detail-view.ts — pure projection of each read-only detail tab's content into
 * the generic `ViewLine[]` the scroll viewport (chunk 03) windows over.
 *
 * Spec: `specs/002-navigation-overhaul/03-detail-scroll-viewport.md` ("Content as
 * visual lines"). Every in-scope tab (Overview, YAML read mode, Events, Metrics)
 * flattens its structured rows / chart lines into **one `ViewLine` per visual
 * row**, already truncated to the detail pane's inner width so the viewport never
 * re-wraps and nothing spills past the pane. The projection is the only place
 * with real decisions (section building, column packing, truncation), so it
 * lives here, pure and 100% covered; the components stay thin renderers over the
 * resulting lines and the controller only holds the offset.
 *
 * Styling is carried per line in {@link ViewLine} (color/bold/dim) so the
 * windowed slice still renders highlighted.
 */

import type { ResourceObject } from '../core/types.js';
import type { MetricSeries } from '../boundaries/metrics-source.js';
import type { ExporterCapabilities } from '../metrics/exporters.js';
import type { MetricsTier } from '../metrics/discovery.js';
import type { ViewLine } from './scroll-viewport.js';
import type { EventRow } from './components/EventsTab.js';
import { formatAge } from '../resources/age.js';
import { formatMemoryQuantity } from '../resources/quantity.js';
import { tokenizeLine } from '../yaml/highlight.js';
import { redactSecret } from '../yaml/redact.js';
import { renderTimeseriesChart } from '../charts/timeseries.js';
import { computeTrendIndicator } from '../charts/timeseries.js';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Clip a string to `width` cells (no wrap). A non-positive width clips to empty. */
export function clipLine(text: string, width: number): string {
  if (width <= 0) {
    return '';
  }
  return text.length > width ? text.slice(0, width) : text;
}

/** A plain (unstyled) clipped line. */
function plain(text: string, width: number): ViewLine {
  return { text: clipLine(text, width) };
}

// ---------------------------------------------------------------------------
// Overview projection (Spec 04 §5)
// ---------------------------------------------------------------------------

/** A key/value overview row. */
export interface KvRow {
  readonly key: string;
  readonly value: string;
}

/** A titled overview section. */
export interface OverviewSection {
  readonly title: string;
  readonly rows: readonly KvRow[];
}

function str(v: unknown): string {
  if (v === null || v === undefined) {
    return '';
  }
  if (typeof v === 'string') {
    return v;
  }
  if (typeof v === 'number' || typeof v === 'boolean') {
    return String(v);
  }
  return JSON.stringify(v);
}

function labelsToString(labels: Record<string, string>): string {
  return Object.entries(labels)
    .map(([k, v]) => `${k}=${v}`)
    .join('  ');
}

function statusRows(status: Record<string, unknown>): KvRow[] {
  return Object.entries(status)
    .filter(([, v]) => typeof v !== 'object' || v === null)
    .map(([k, v]) => ({ key: k, value: str(v) }));
}

function metadataSection(
  resource: ResourceObject,
  nowMs: number,
  extraRows: KvRow[] = [],
): OverviewSection {
  const rows: KvRow[] = [{ key: 'Name', value: resource.name }];
  if (resource.namespace !== null) {
    rows.push({ key: 'Namespace', value: resource.namespace });
  }
  rows.push({
    key: 'Created',
    value: `${formatAge(resource.creationTimestamp, nowMs)} ago (${resource.creationTimestamp})`,
  });
  rows.push(...extraRows);
  rows.push({ key: 'Labels', value: labelsToString(resource.labels) });
  rows.push({
    key: 'Annotations',
    value: String(Object.keys(resource.annotations).length) + ' annotations',
  });
  return { title: 'METADATA', rows };
}

function buildPodSections(
  resource: ResourceObject,
  nowMs: number,
): OverviewSection[] {
  const raw = resource.raw;
  const spec: Record<string, unknown> = raw.spec ?? {};
  const status: Record<string, unknown> = raw.status ?? {};
  const meta = resource.raw.metadata ?? {};

  const nodeRow: KvRow[] =
    typeof meta.name === 'string'
      ? [{ key: 'Node', value: str(spec.nodeName ?? '') }]
      : [];

  const metaSec = metadataSection(resource, nowMs, nodeRow);

  const podIP = str(status.podIP ?? '');
  const hostIP = str(status.hostIP ?? '');
  const qosClass = str(status.qosClass ?? '');
  const phase = str(status.phase ?? '');
  const containerStatuses = status.containerStatuses;
  const totalContainers = Array.isArray(containerStatuses)
    ? containerStatuses.length
    : 0;
  const readyContainers = Array.isArray(containerStatuses)
    ? containerStatuses.filter(
        (c) => (c as Record<string, unknown>).ready === true,
      ).length
    : 0;
  const restarts = Array.isArray(containerStatuses)
    ? containerStatuses.reduce((acc: number, c) => {
        const r = (c as Record<string, unknown>).restartCount;
        return acc + (typeof r === 'number' ? r : 0);
      }, 0)
    : 0;

  const statusSec: OverviewSection = {
    title: 'STATUS',
    rows: [
      { key: 'Phase', value: phase },
      {
        key: 'Ready',
        value: `${String(readyContainers)}/${String(totalContainers)}`,
      },
      { key: 'Restarts', value: String(restarts) },
      { key: 'Pod IP', value: podIP },
      { key: 'Host IP', value: hostIP },
      { key: 'QoS Class', value: qosClass },
    ].filter((r) => r.value !== ''),
  };

  const containers = Array.isArray(spec.containers) ? spec.containers : [];
  const containerRows: KvRow[] = containers.map((c) => {
    const co = c as Record<string, unknown>;
    return { key: str(co.name ?? ''), value: str(co.image ?? '') };
  });
  const containerSec: OverviewSection = {
    title: 'CONTAINERS',
    rows: containerRows,
  };

  const volumes = Array.isArray(spec.volumes) ? spec.volumes : [];
  const volumeRows: KvRow[] = volumes.map((v) => {
    const vo = v as Record<string, unknown>;
    return { key: str(vo.name ?? ''), value: '' };
  });
  const volumeSec: OverviewSection = { title: 'VOLUMES', rows: volumeRows };

  return [metaSec, statusSec, containerSec, volumeSec].filter(
    (s) => s.rows.length > 0,
  );
}

function buildDeploymentSections(
  resource: ResourceObject,
  nowMs: number,
): OverviewSection[] {
  const raw = resource.raw;
  const spec: Record<string, unknown> = raw.spec ?? {};
  const status: Record<string, unknown> = raw.status ?? {};

  const metaSec = metadataSection(resource, nowMs);

  const replicas = str(status.replicas ?? '');
  const readyReplicas = str(status.readyReplicas ?? '');
  const updatedReplicas = str(status.updatedReplicas ?? '');
  const availableReplicas = str(status.availableReplicas ?? '');
  const strategy = (() => {
    const s = (spec.strategy ?? {}) as Record<string, unknown>;
    return str(s.type ?? '');
  })();

  const statusSec: OverviewSection = {
    title: 'STATUS',
    rows: [
      { key: 'Ready Replicas', value: `${readyReplicas}/${replicas}` },
      { key: 'Up-to-date', value: updatedReplicas },
      { key: 'Available', value: availableReplicas },
      { key: 'Strategy', value: strategy },
    ].filter((r) => r.value !== '' && r.value !== '/'),
  };

  const selector = (spec.selector ?? {}) as Record<string, unknown>;
  const matchLabels = (selector.matchLabels ?? {}) as Record<string, string>;
  const selectorSec: OverviewSection = {
    title: 'SELECTOR',
    rows: Object.entries(matchLabels).map(([k, v]) => ({ key: k, value: v })),
  };

  const template = (spec.template ?? {}) as Record<string, unknown>;
  const templateMeta = (template.metadata ?? {}) as Record<string, unknown>;
  const templateLabels = (templateMeta.labels ?? {}) as Record<string, string>;
  const templateSpec = (template.spec ?? {}) as Record<string, unknown>;
  const containers = Array.isArray(templateSpec.containers)
    ? templateSpec.containers
    : [];
  const containerRows: KvRow[] = containers.map((c) => {
    const co = c as Record<string, unknown>;
    return { key: str(co.name ?? ''), value: str(co.image ?? '') };
  });

  const templateSec: OverviewSection = {
    title: 'TEMPLATE',
    rows: [
      ...Object.entries(templateLabels).map(([k, v]) => ({ key: k, value: v })),
      ...containerRows,
    ],
  };

  return [metaSec, statusSec, selectorSec, templateSec].filter(
    (s) => s.rows.length > 0,
  );
}

function buildNodeSections(
  resource: ResourceObject,
  nowMs: number,
): OverviewSection[] {
  const raw = resource.raw;
  const status: Record<string, unknown> = raw.status ?? {};

  const nodeInfo = (status.nodeInfo ?? {}) as Record<string, unknown>;
  const addresses = Array.isArray(status.addresses) ? status.addresses : [];
  const conditions = Array.isArray(status.conditions) ? status.conditions : [];

  const metaSec: OverviewSection = {
    title: 'METADATA',
    rows: [
      { key: 'Name', value: resource.name },
      {
        key: 'Created',
        value: `${formatAge(resource.creationTimestamp, nowMs)} ago (${resource.creationTimestamp})`,
      },
      { key: 'Labels', value: labelsToString(resource.labels) },
      {
        key: 'Annotations',
        value:
          String(Object.keys(resource.annotations).length) + ' annotations',
      },
    ].filter((r) => r.value !== ''),
  };

  const readyCond = conditions.find(
    (c) => (c as Record<string, unknown>).type === 'Ready',
  ) as Record<string, unknown> | undefined;
  // Ready is rendered first, explicitly, then every other (pressure)
  // condition once each — the raw conditions array already includes Ready,
  // so it must be excluded here to avoid a duplicate "Ready" row.
  const condRows: KvRow[] = conditions
    .filter((c) => (c as Record<string, unknown>).type !== 'Ready')
    .map((c) => {
      const co = c as Record<string, unknown>;
      return { key: str(co.type ?? ''), value: str(co.status ?? '') };
    });
  const statusSec: OverviewSection = {
    title: 'STATUS',
    rows: [
      {
        key: 'Ready',
        value:
          readyCond !== undefined ? str(readyCond.status ?? '') : 'Unknown',
      },
      ...condRows,
    ],
  };

  const capacity = (status.capacity ?? {}) as Record<string, unknown>;
  const allocatable = (status.allocatable ?? {}) as Record<string, unknown>;
  const capacitySec: OverviewSection = {
    title: 'CAPACITY',
    rows: [
      {
        key: 'CPU',
        value: `${str(allocatable.cpu ?? '')} allocatable / ${str(capacity.cpu ?? '')} capacity`,
      },
      {
        key: 'Memory',
        value: `${formatMemoryQuantity(str(allocatable.memory ?? ''))} allocatable / ${formatMemoryQuantity(str(capacity.memory ?? ''))} capacity`,
      },
      {
        key: 'Pods',
        value: `${str(allocatable.pods ?? '')} allocatable / ${str(capacity.pods ?? '')} capacity`,
      },
    ].filter((r) => r.value !== ' allocatable /  capacity'),
  };

  const systemSec: OverviewSection = {
    title: 'SYSTEM',
    rows: [
      { key: 'OS', value: str(nodeInfo.osImage ?? '') },
      { key: 'Kernel', value: str(nodeInfo.kernelVersion ?? '') },
      {
        key: 'Container Runtime',
        value: str(nodeInfo.containerRuntimeVersion ?? ''),
      },
      { key: 'Kubelet Version', value: str(nodeInfo.kubeletVersion ?? '') },
    ].filter((r) => r.value !== ''),
  };

  const addrSec: OverviewSection = {
    title: 'ADDRESSES',
    rows: addresses.map((a) => {
      const ao = a as Record<string, unknown>;
      return { key: str(ao.type ?? ''), value: str(ao.address ?? '') };
    }),
  };

  return [metaSec, statusSec, capacitySec, systemSec, addrSec].filter(
    (s) => s.rows.length > 0,
  );
}

function buildKafkaTopicSections(
  resource: ResourceObject,
  nowMs: number,
): OverviewSection[] {
  const raw = resource.raw;
  const spec: Record<string, unknown> = raw.spec ?? {};
  const status: Record<string, unknown> = raw.status ?? {};

  const metaSec: OverviewSection = {
    title: 'METADATA',
    rows: [
      { key: 'Name', value: resource.name },
      { key: 'Namespace', value: resource.namespace ?? '' },
      {
        key: 'Created',
        value: `${formatAge(resource.creationTimestamp, nowMs)} ago (${resource.creationTimestamp})`,
      },
      { key: 'Labels', value: labelsToString(resource.labels) },
    ].filter((r) => r.value !== ''),
  };

  const specSec: OverviewSection = {
    title: 'SPEC',
    rows: [
      { key: 'Partitions', value: str(spec.partitions ?? '') },
      { key: 'Replication Factor', value: str(spec.replicas ?? '') },
      { key: 'Retention Bytes', value: str(spec.retentionBytes ?? '') },
      { key: 'Retention Ms', value: str(spec.retentionMs ?? '') },
      { key: 'Cleanup Policy', value: str(spec.cleanupPolicy ?? '') },
    ].filter((r) => r.value !== ''),
  };

  const conditions = Array.isArray(status.conditions) ? status.conditions : [];
  const readyCond = conditions.find(
    (c) => (c as Record<string, unknown>).type === 'Ready',
  ) as Record<string, unknown> | undefined;

  const statusSec: OverviewSection = {
    title: 'STATUS',
    rows: [
      {
        key: 'Ready',
        value:
          readyCond !== undefined ? str(readyCond.status ?? '') : 'Unknown',
      },
      {
        key: 'Observed Generation',
        value: str(status.observedGeneration ?? ''),
      },
    ].filter((r) => r.value !== ''),
  };

  return [metaSec, specSec, statusSec].filter((s) => s.rows.length > 0);
}

function buildDopplerSecretSections(
  resource: ResourceObject,
  nowMs: number,
): OverviewSection[] {
  const raw = resource.raw;
  const spec: Record<string, unknown> = raw.spec ?? {};
  const status: Record<string, unknown> = raw.status ?? {};

  const metaSec: OverviewSection = {
    title: 'METADATA',
    rows: [
      { key: 'Name', value: resource.name },
      { key: 'Namespace', value: resource.namespace ?? '' },
      {
        key: 'Created',
        value: `${formatAge(resource.creationTimestamp, nowMs)} ago (${resource.creationTimestamp})`,
      },
    ].filter((r) => r.value !== ''),
  };

  const specSec: OverviewSection = {
    title: 'SPEC',
    rows: [
      { key: 'Project', value: str(spec.project ?? '') },
      { key: 'Config', value: str(spec.config ?? '') },
      { key: 'Managed Secret Name', value: str(spec.secretName ?? '') },
      {
        key: 'Secret Namespace',
        value: str(spec.secretNamespace ?? resource.namespace ?? ''),
      },
    ].filter((r) => r.value !== ''),
  };

  const conditions = Array.isArray(status.conditions) ? status.conditions : [];
  const readyCond = conditions.find(
    (c) =>
      (c as Record<string, unknown>).type ===
        'secrets.doppler.com/secretsGenerated' ||
      (c as Record<string, unknown>).type === 'ConditionReady',
  ) as Record<string, unknown> | undefined;

  const statusSec: OverviewSection = {
    title: 'STATUS',
    rows: [
      {
        key: 'Sync Condition',
        value:
          readyCond !== undefined ? str(readyCond.status ?? '') : 'Unknown',
      },
      { key: 'Last Synced', value: str(status.lastSyncTime ?? '') },
    ].filter((r) => r.value !== ''),
  };

  return [metaSec, specSec, statusSec].filter((s) => s.rows.length > 0);
}

function buildGenericSections(
  resource: ResourceObject,
  nowMs: number,
): OverviewSection[] {
  const raw = resource.raw;
  const status: Record<string, unknown> | undefined = raw.status;

  const metaSec = metadataSection(resource, nowMs);

  if (status === undefined || Object.keys(status).length === 0) {
    return [metaSec];
  }

  const statusSec: OverviewSection = {
    title: 'STATUS',
    rows: statusRows(status),
  };
  return [metaSec, statusSec].filter((s) => s.rows.length > 0);
}

/** Build the per-kind overview sections (Spec 04 §5.2). */
export function buildOverviewSections(
  resource: ResourceObject,
  nowMs: number,
): OverviewSection[] {
  switch (resource.kind) {
    case 'Pod':
      return buildPodSections(resource, nowMs);
    case 'Deployment':
      return buildDeploymentSections(resource, nowMs);
    case 'Node':
      return buildNodeSections(resource, nowMs);
    case 'KafkaTopic':
      return buildKafkaTopicSections(resource, nowMs);
    case 'DopplerSecret':
      return buildDopplerSecretSections(resource, nowMs);
    default:
      return buildGenericSections(resource, nowMs);
  }
}

const KEY_WIDTH = 22;

function padKey(k: string): string {
  if (k.length >= KEY_WIDTH) {
    return k.slice(0, KEY_WIDTH);
  }
  return k + ' '.repeat(KEY_WIDTH - k.length);
}

/**
 * Project the overview into `ViewLine[]`: a bold title per section, one
 * `key  value` row per entry (annotations rendered as a count), and a blank
 * spacer between sections. Long lines clip to `width`.
 */
export function projectOverviewLines(
  resource: ResourceObject,
  nowMs: number,
  width: number,
): ViewLine[] {
  const sections = buildOverviewSections(resource, nowMs);
  const lines: ViewLine[] = [];
  sections.forEach((section, i) => {
    if (i > 0) {
      lines.push(plain('', width));
    }
    lines.push({ text: clipLine(section.title, width), bold: true });
    for (const row of section.rows) {
      lines.push(plain(padKey(row.key) + row.value, width));
    }
  });
  return lines;
}

// ---------------------------------------------------------------------------
// Events projection (Spec 04 §8)
// ---------------------------------------------------------------------------

const COL_TYPE = 8;
const COL_REASON = 20;
const COL_AGE = 10;
const COL_COUNT = 6;

function padRight(s: string, w: number): string {
  return s.length >= w ? s.slice(0, w) : s + ' '.repeat(w - s.length);
}

function padLeft(s: string, w: number): string {
  return s.length >= w ? s.slice(0, w) : ' '.repeat(w - s.length) + s;
}

/**
 * Project the events table into `ViewLine[]`: the toggle bar, header, divider,
 * then one row per event (Warning rows coloured yellow). Empty states collapse
 * to a short message. Long lines clip to `width`.
 */
export function projectEventsLines(
  events: readonly EventRow[],
  warningCount: number,
  showAll: boolean,
  nowMs: number,
  width: number,
): ViewLine[] {
  const lines: ViewLine[] = [];
  const toggle = showAll
    ? `[Warning]  [All ✓]${warningCount > 0 ? `  ${String(warningCount)} warnings` : ''}`
    : `[Warning ✓]  [All]  ${String(events.length)} events (${String(warningCount)} warnings)`;
  lines.push(plain(toggle, width));

  if (events.length === 0) {
    lines.push(plain(showAll ? 'No events' : 'No warning events', width));
    return lines;
  }

  lines.push({
    text: clipLine(
      padRight('Type', COL_TYPE) +
        padRight('Reason', COL_REASON) +
        padRight('Age', COL_AGE) +
        padLeft('Count', COL_COUNT) +
        ' Message',
      width,
    ),
    bold: true,
  });
  lines.push({
    text: clipLine(
      '─'.repeat(COL_TYPE + COL_REASON + COL_AGE + COL_COUNT + 20),
      width,
    ),
    dim: true,
  });
  for (const row of events) {
    const age =
      row.lastTimestamp === '' ? '' : formatAge(row.lastTimestamp, nowMs);
    const text =
      padRight(row.type, COL_TYPE) +
      padRight(row.reason, COL_REASON) +
      padRight(age, COL_AGE) +
      padLeft(String(row.count), COL_COUNT) +
      ' ' +
      row.message;
    const projected: ViewLine =
      row.type === 'Warning'
        ? { text: clipLine(text, width), color: 'yellow' }
        : plain(text, width);
    lines.push(projected);
  }
  return lines;
}

// ---------------------------------------------------------------------------
// YAML read-mode projection (Spec 04 §6 / chunk 07)
// ---------------------------------------------------------------------------

/**
 * Project read-mode YAML into `ViewLine[]`: an action bar, then one
 * line-numbered line per source line (redacted unless `revealed` for Secrets).
 * Highlighting collapses to a single colour per line (the dominant token kind is
 * not preserved through the flat slice; the line text is line-numbered and
 * clipped to `width`, never wrapped).
 */
export function projectYamlReadLines(
  yaml: string,
  kind: string,
  revealed: boolean,
  width: number,
): ViewLine[] {
  const display = revealed ? yaml : redactSecret(yaml);
  const isSecret = kind === 'Secret';
  const lines: ViewLine[] = [];
  lines.push({
    text: clipLine(
      isSecret && !revealed ? '[Edit]  [reveal]' : '[Edit]',
      width,
    ),
    color: 'cyan',
  });
  display.split('\n').forEach((line, i) => {
    const lineNum = String(i + 1).padStart(4, ' ');
    // tokenizeLine drives the read-mode highlight; we keep the call so the
    // projection matches the component's tokenization (and to surface a single
    // representative colour for keys when present).
    const tokens = tokenizeLine(line);
    const firstKey = tokens.find((t) => t.type === 'key');
    const projected: ViewLine =
      firstKey !== undefined
        ? { text: clipLine(`${lineNum} ${line}`, width), color: 'blue' }
        : plain(`${lineNum} ${line}`, width);
    lines.push(projected);
  });
  return lines;
}

// ---------------------------------------------------------------------------
// Metrics projection (Spec 06 §4)
// ---------------------------------------------------------------------------

/** Inputs for the metrics projection (mirrors the in-scope MetricsTab props). */
export interface MetricsProjectionInput {
  readonly resourceKind: string;
  readonly resourceName: string;
  readonly tier: MetricsTier;
  readonly capabilities: ExporterCapabilities;
  readonly chartWidth: number;
  readonly cpuSeries: readonly MetricSeries[];
  readonly memorySeries: readonly MetricSeries[];
  readonly networkInSeries: readonly MetricSeries[];
  readonly networkOutSeries: readonly MetricSeries[];
  readonly restartSeries: readonly MetricSeries[];
  readonly replicaSeries: readonly MetricSeries[];
  readonly lagSeries: readonly MetricSeries[];
  readonly rangeOptions: readonly string[];
  readonly rangeSelected: string;
}

function chartBlock(
  title: string,
  series: readonly MetricSeries[],
  chartWidth: number,
  width: number,
): ViewLine[] {
  const lines: ViewLine[] = [{ text: clipLine(title, width), bold: true }];
  const first = series[0];
  const pointCount = first !== undefined ? first.points.length : 0;
  if (series.length === 0 || pointCount === 0) {
    lines.push({ text: clipLine('No data', width), dim: true });
    return lines;
  }
  const chart = renderTimeseriesChart({ series, width: chartWidth });
  for (const line of chart.lines) {
    lines.push({ text: clipLine(line, width), color: 'green' });
  }
  return lines;
}

function missingNote(
  exporterName: string,
  chartName: string,
  width: number,
): ViewLine {
  return {
    text: clipLine(
      `${chartName} unavailable — ${exporterName} exporter not detected`,
      width,
    ),
    dim: true,
  };
}

function projectMetricsCharts(
  input: MetricsProjectionInput,
  width: number,
): ViewLine[] {
  const { capabilities: caps, chartWidth } = input;
  const block = (title: string, series: readonly MetricSeries[]): ViewLine[] =>
    chartBlock(title, series, chartWidth, width);
  switch (input.resourceKind) {
    case 'Pod':
      return [
        ...(caps.cadvisor
          ? [
              ...block('CPU Usage', input.cpuSeries),
              ...block('Memory Usage', input.memorySeries),
              ...block('Network I/O', [
                ...input.networkInSeries,
                ...input.networkOutSeries,
              ]),
            ]
          : [missingNote('cAdvisor', 'CPU/Memory/Network charts', width)]),
        ...(caps.kubeStateMetrics
          ? block('Restart Count', input.restartSeries)
          : [missingNote('kube-state-metrics', 'Restart count chart', width)]),
      ];
    case 'Node':
      return caps.cadvisor
        ? [
            ...block('CPU Usage % of Allocatable', input.cpuSeries),
            ...block('Memory Usage % of Allocatable', input.memorySeries),
          ]
        : [missingNote('cAdvisor', 'CPU/Memory charts', width)];
    case 'Deployment':
    case 'StatefulSet':
      return [
        ...(caps.cadvisor
          ? [
              ...block('Aggregate CPU', input.cpuSeries),
              ...block('Aggregate Memory', input.memorySeries),
            ]
          : [missingNote('cAdvisor', 'CPU/Memory charts', width)]),
        ...(caps.kubeStateMetrics
          ? block('Replica Count', input.replicaSeries)
          : [missingNote('kube-state-metrics', 'Replica count chart', width)]),
      ];
    case 'KafkaTopic':
      return caps.kafkaExporter
        ? projectKafkaTopicLag(input, width)
        : [missingNote('kafka-exporter', 'Consumer lag chart', width)];
    default:
      return [
        {
          text: clipLine(`No charts defined for ${input.resourceKind}`, width),
          dim: true,
        },
      ];
  }
}

function projectKafkaTopicLag(
  input: MetricsProjectionInput,
  width: number,
): ViewLine[] {
  const lines: ViewLine[] = [
    { text: clipLine('Consumer Lag per Group', width), bold: true },
  ];
  if (input.lagSeries.length === 0) {
    lines.push({ text: clipLine('No data', width), dim: true });
    return lines;
  }
  input.lagSeries.forEach((s, i) => {
    const groupLabel =
      s.labels.consumer_group ?? s.labels.group ?? `group-${String(i)}`;
    const lastPt = s.points[s.points.length - 1];
    const currentLag = lastPt !== undefined ? lastPt.value : 0;
    const trend = computeTrendIndicator(s.points.map((p) => p.value));
    lines.push(
      plain(`── ${groupLabel} (${String(currentLag)}) ${trend}`, width),
    );
  });
  return lines;
}

/**
 * Project the metrics tab into `ViewLine[]`: a title, optional session banner,
 * the range selector, then the per-kind chart blocks (or the no-metrics state).
 */
export function projectMetricsLines(
  input: MetricsProjectionInput,
  width: number,
): ViewLine[] {
  if (input.tier === 'none') {
    return [
      { text: clipLine('No metrics available', width), bold: true },
      plain('Privateer could not find a Prometheus instance or', width),
      plain('metrics-server in this cluster.', width),
    ];
  }
  const lines: ViewLine[] = [
    { text: clipLine(`Metrics — ${input.resourceName}`, width), bold: true },
  ];
  if (input.tier === 'metrics-server') {
    lines.push({
      text: clipLine(
        'ℹ Prometheus not found — showing current values only.',
        width,
      ),
      color: 'cyan',
    });
  }
  lines.push(
    plain(
      input.rangeOptions
        .map((o) => (o === input.rangeSelected ? `[${o}]*` : `[${o}]`))
        .join(' '),
      width,
    ),
  );
  lines.push(...projectMetricsCharts(input, width));
  return lines;
}
