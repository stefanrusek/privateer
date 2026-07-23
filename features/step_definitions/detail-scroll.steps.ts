import { Given, When, Then, Before } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import type { ResourceObject } from '../../src/core/types.js';
import type { MetricSeries } from '../../src/boundaries/metrics-source.js';
import type { EventRow } from '../../src/ui/components/EventsTab.js';
import {
  scrollBy,
  pageBy,
  toTop,
  toBottom,
  visibleSlice,
  scrollbar,
  maxOffset,
  type ScrollState,
  type ViewLine,
} from '../../src/ui/scroll-viewport.js';
import {
  projectOverviewLines,
  projectEventsLines,
  projectYamlReadLines,
  projectMetricsLines,
} from '../../src/ui/detail-view.js';

// ---------------------------------------------------------------------------
// Per-scenario state
// ---------------------------------------------------------------------------

interface DetailScrollState {
  lines: ViewLine[];
  offset: ScrollState;
  viewportHeight: number;
  width: number;
}

let ds: DetailScrollState;

const NOW_MS = new Date('2026-06-10T13:00:00Z').getTime();
const WIDTH = 80;
const VIEWPORT = 8;

function tallOverviewLines(): ViewLine[] {
  const labels: Record<string, string> = {};
  for (let i = 0; i < 40; i++) {
    labels[`label-${String(i)}`] = `value-${String(i)}`;
  }
  const resource: ResourceObject = {
    uid: 'uid-tall',
    kind: 'Pod',
    apiVersion: 'v1',
    name: 'tall-pod',
    namespace: 'default',
    labels,
    annotations: {},
    creationTimestamp: '2026-06-10T11:00:00Z',
    resourceVersion: '1',
    status: { color: 'green', label: 'Ready' },
    raw: {
      metadata: { name: 'tall-pod' },
      spec: {
        containers: Array.from({ length: 30 }, (_, i) => ({
          name: `c-${String(i)}`,
          image: `img-${String(i)}`,
        })),
      },
      status: { phase: 'Running' },
    },
  };
  return projectOverviewLines(resource, NOW_MS, WIDTH);
}

function tallYamlLines(): ViewLine[] {
  const yaml = Array.from(
    { length: 50 },
    (_, i) => `key${String(i)}: value-${String(i)}`,
  ).join('\n');
  return projectYamlReadLines(yaml, 'ConfigMap', false, WIDTH);
}

function tallEventsLines(): ViewLine[] {
  const events: EventRow[] = Array.from({ length: 40 }, (_, i) => ({
    type: i % 5 === 0 ? 'Warning' : 'Normal',
    reason: `Reason${String(i)}`,
    lastTimestamp: '2026-06-10T12:59:00Z',
    count: i,
    message: `event-message-${String(i)}`,
  }));
  return projectEventsLines(events, true, NOW_MS, WIDTH);
}

function tallMetricsLines(): ViewLine[] {
  const series: MetricSeries[] = [
    {
      labels: { metric: 'cpu' },
      points: Array.from({ length: 20 }, (_, i) => ({
        timestampMs: i * 1000,
        value: i,
      })),
    },
  ];
  return projectMetricsLines(
    {
      resourceKind: 'Pod',
      resourceName: 'tall-pod',
      tier: 'prometheus',
      capabilities: {
        cadvisor: true,
        kubeStateMetrics: true,
        kafkaExporter: true,
        strimziJmx: true,
      },
      chartWidth: 60,
      cpuSeries: series,
      memorySeries: series,
      networkInSeries: series,
      networkOutSeries: series,
      restartSeries: series,
      replicaSeries: [],
      lagSeries: [],
      rangeOptions: ['1h', '6h'],
      rangeSelected: '1h',
    },
    WIDTH,
  );
}

function linesForTab(tab: string): ViewLine[] {
  switch (tab) {
    case 'overview':
      return tallOverviewLines();
    case 'yaml':
      return tallYamlLines();
    case 'events':
      return tallEventsLines();
    case 'metrics':
      return tallMetricsLines();
    default:
      throw new Error(`unknown tab: ${tab}`);
  }
}

function total(): number {
  return ds.lines.length;
}

Before(function () {
  ds = {
    lines: tallOverviewLines(),
    offset: { offset: 0 },
    viewportHeight: VIEWPORT,
    width: WIDTH,
  };
});

// ---------------------------------------------------------------------------
// Givens
// ---------------------------------------------------------------------------

Given('a tall detail tab whose content exceeds the viewport', function () {
  ds.lines = tallOverviewLines();
  ds.offset = { offset: 0 };
  assert.ok(
    ds.lines.length > ds.viewportHeight,
    'fixture must be taller than the viewport',
  );
});

Given('a tall {string} tab', function (tab: string) {
  ds.lines = linesForTab(tab);
  ds.offset = { offset: 0 };
  assert.ok(
    ds.lines.length > ds.viewportHeight,
    `the ${tab} fixture must be taller than the viewport`,
  );
});

Given('a short detail tab whose content fits the viewport', function () {
  ds.lines = [{ text: 'one' }, { text: 'two' }, { text: 'three' }];
  ds.offset = { offset: 0 };
  assert.ok(ds.lines.length <= ds.viewportHeight);
});

// ---------------------------------------------------------------------------
// Whens
// ---------------------------------------------------------------------------

When('I scroll the detail viewport down by one line', function () {
  ds.offset = scrollBy(ds.offset, 1, total(), ds.viewportHeight);
});

When('I page the detail viewport down', function () {
  ds.offset = pageBy(ds.offset, 'down', total(), ds.viewportHeight);
});

When('I scroll the detail viewport to the bottom', function () {
  ds.offset = toBottom(total(), ds.viewportHeight);
});

When('I scroll the detail viewport to the top', function () {
  ds.offset = toTop();
});

// ---------------------------------------------------------------------------
// Thens
// ---------------------------------------------------------------------------

Then('the first visible line has moved down by one', function () {
  assert.equal(ds.offset.offset, 1);
});

Then('no line beyond the viewport offset is shown', function () {
  const visible = visibleSlice(ds.lines, ds.offset.offset, ds.viewportHeight);
  assert.equal(visible.length, ds.viewportHeight);
  // The first visible row is the offset row — nothing above it leaks in.
  assert.deepEqual(visible[0], ds.lines[ds.offset.offset]);
});

Then('the first visible line has advanced by about one page', function () {
  assert.ok(
    ds.offset.offset >= ds.viewportHeight - 2 &&
      ds.offset.offset <= ds.viewportHeight,
    `expected ~one page (${String(ds.viewportHeight)}), got ${String(
      ds.offset.offset,
    )}`,
  );
});

Then('the last line of the content is visible', function () {
  const visible = visibleSlice(ds.lines, ds.offset.offset, ds.viewportHeight);
  assert.deepEqual(visible[visible.length - 1], ds.lines[ds.lines.length - 1]);
});

Then('the viewport is pinned to the bottom', function () {
  assert.equal(ds.offset.offset, maxOffset(total(), ds.viewportHeight));
});

Then('the first line of the content is visible', function () {
  assert.equal(ds.offset.offset, 0);
  const visible = visibleSlice(ds.lines, ds.offset.offset, ds.viewportHeight);
  assert.deepEqual(visible[0], ds.lines[0]);
});

Then('no scroll indicator is shown', function () {
  assert.equal(scrollbar(ds.offset.offset, total(), ds.viewportHeight), null);
});

Then('every content line is visible', function () {
  const visible = visibleSlice(ds.lines, ds.offset.offset, ds.viewportHeight);
  assert.equal(visible.length, ds.lines.length);
});
