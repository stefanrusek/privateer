/**
 * Step definitions for Spec 06 sparklines & charts BDD scenarios.
 * Uses distinct step text to avoid Cucumber ambiguity with other step files.
 */
import { Given, When, Then, Before } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { render } from 'ink-testing-library';
import React from 'react';
import type { PrivateerWorld } from '../support/world.js';
import {
  renderSparkline,
  renderSessionSparkline,
  computeSparklineColumns,
} from '../../src/charts/sparkline.js';
import type {
  SparklineResult,
  RenderedSparkline,
  SparklineColumn,
} from '../../src/charts/sparkline.js';
import {
  createRangeSelector,
  selectRange,
  ALL_RANGES,
} from '../../src/charts/range.js';
import type { RangeSelectorModel, RangeLabel } from '../../src/charts/range.js';
import {
  renderTimeseriesChart,
  computeTrendIndicator,
} from '../../src/charts/timeseries.js';
import type { TrendIndicator } from '../../src/charts/timeseries.js';
import { MetricsTab } from '../../src/ui/components/MetricsTab.js';
import type { ExporterCapabilities } from '../../src/metrics/exporters.js';
import type { MetricsTier } from '../../src/metrics/discovery.js';
import type { MetricSeries } from '../../src/boundaries/metrics-source.js';

// ---------------------------------------------------------------------------
// World augmentation
// ---------------------------------------------------------------------------

declare module '../support/world.js' {
  interface PrivateerWorld {
    chartSparklineValues: number[];
    chartSparklineMax: number;
    chartSparklineResult: SparklineResult | null;
    chartSessionSparklineResult: RenderedSparkline | null;
    chartSparklineColumns: SparklineColumn[];
    chartRangeModel: RangeSelectorModel | null;
    chartRangeOptions: string;
    chartTimeseriesLines: readonly string[];
    chartTrendIndicator: TrendIndicator | null;
    chartMetricsTier: MetricsTier;
    chartCapabilities: ExporterCapabilities;
    chartRenderedOutput: string;
    chartTimeseriesSeries: MetricSeries[];
    chartTimeseriesClockMs: number;
  }
}

// ---------------------------------------------------------------------------
// Reset per-scenario
// ---------------------------------------------------------------------------

const ALL_CAPS: ExporterCapabilities = {
  cadvisor: true,
  kubeStateMetrics: true,
  kafkaExporter: true,
  strimziJmx: true,
};

Before(function (this: PrivateerWorld) {
  this.chartSparklineValues = [];
  this.chartSparklineMax = 100;
  this.chartSparklineResult = null;
  this.chartSessionSparklineResult = null;
  this.chartSparklineColumns = [];
  this.chartRangeModel = null;
  this.chartRangeOptions = '';
  this.chartTimeseriesLines = [];
  this.chartTrendIndicator = null;
  this.chartMetricsTier = 'prometheus';
  this.chartCapabilities = ALL_CAPS;
  this.chartRenderedOutput = '';
  this.chartTimeseriesSeries = [];
  this.chartTimeseriesClockMs = 1_749_600_000_000;
});

// ---------------------------------------------------------------------------
// Given steps — sparkline input
// ---------------------------------------------------------------------------

Given(
  'a sparkline series with points {string}',
  function (this: PrivateerWorld, pointsStr: string) {
    // Parse JSON array string like "[0, 0, 0, ...]"
    const values = JSON.parse(pointsStr) as number[];
    this.chartSparklineValues = values;
  },
);

Given(
  'a sparkline series with no data points',
  function (this: PrivateerWorld) {
    this.chartSparklineValues = [];
  },
);

// Per-resource-type sparkline input Given steps

Given(
  'a pod sparkline resource with cpu usage {int} and memory usage {int}',
  function (this: PrivateerWorld, cpu: number, memory: number) {
    this.chartSparklineValues = [cpu];
    // Store both in a shared way; we'll use chartSparklineColumns after When
    // Store cpu in values, memory separately via a side effect
    this.chartSparklineColumns = computeSparklineColumns({
      resourceType: 'Pod',
      cpuValues: [cpu],
      memoryValues: [memory],
      maxCpu: 100,
      maxMemory: 100,
    });
  },
);

Given(
  'a node sparkline resource with cpu usage {int} and memory usage {int}',
  function (this: PrivateerWorld, cpu: number, memory: number) {
    this.chartSparklineColumns = computeSparklineColumns({
      resourceType: 'Node',
      cpuValues: [cpu],
      memoryValues: [memory],
      maxCpu: 100,
      maxMemory: 100,
    });
  },
);

Given(
  'a deployment sparkline resource with aggregate cpu {int} and memory {int}',
  function (this: PrivateerWorld, cpu: number, memory: number) {
    this.chartSparklineColumns = computeSparklineColumns({
      resourceType: 'Deployment',
      cpuValues: [cpu],
      memoryValues: [memory],
      maxCpu: 100,
      maxMemory: 100,
    });
  },
);

Given(
  'a statefulset sparkline resource with aggregate cpu {int} and memory {int}',
  function (this: PrivateerWorld, cpu: number, memory: number) {
    this.chartSparklineColumns = computeSparklineColumns({
      resourceType: 'StatefulSet',
      cpuValues: [cpu],
      memoryValues: [memory],
      maxCpu: 100,
      maxMemory: 100,
    });
  },
);

Given(
  'a kafkatopic sparkline resource with lag {int}',
  function (this: PrivateerWorld, lag: number) {
    this.chartSparklineColumns = computeSparklineColumns({
      resourceType: 'KafkaTopic',
      lagValues: [lag],
      maxLag: 10000,
    });
  },
);

Given(
  'a kafka sparkline resource with under-replicated partitions {int}',
  function (this: PrivateerWorld, urp: number) {
    this.chartSparklineColumns = computeSparklineColumns({
      resourceType: 'Kafka',
      underReplicatedValues: [urp],
      maxUnderReplicated: 10,
    });
  },
);

// ---------------------------------------------------------------------------
// Given steps — range selector
// ---------------------------------------------------------------------------

Given('a fresh range selector model', function (this: PrivateerWorld) {
  this.chartRangeModel = createRangeSelector();
});

// ---------------------------------------------------------------------------
// Given steps — timeseries chart
// ---------------------------------------------------------------------------

Given(
  'a timeseries chart with one series of values {string}',
  function (this: PrivateerWorld, valuesStr: string) {
    const values = JSON.parse(valuesStr) as number[];
    const STEP = 60_000;
    this.chartTimeseriesSeries = [
      {
        labels: {},
        points: values.map((v, i) => ({
          timestampMs: this.chartTimeseriesClockMs + i * STEP,
          value: v,
        })),
      },
    ];
  },
);

Given(
  'a timeseries chart with a clock set to epoch {int}',
  function (this: PrivateerWorld, epochMs: number) {
    this.chartTimeseriesClockMs = epochMs;
  },
);

Given(
  'a series of {int} points spaced {int} minutes apart',
  function (this: PrivateerWorld, count: number, spacingMinutes: number) {
    const points = Array.from({ length: count }, (_, i) => ({
      timestampMs: this.chartTimeseriesClockMs + i * spacingMinutes * 60_000,
      value: 50 + i * 5,
    }));
    this.chartTimeseriesSeries = [{ labels: {}, points }];
  },
);

// ---------------------------------------------------------------------------
// Given steps — Kafka lag trend
// ---------------------------------------------------------------------------

Given(
  'a kafka lag series trending upward with values {string}',
  function (this: PrivateerWorld, valuesStr: string) {
    const values = JSON.parse(valuesStr) as number[];
    this.chartTimeseriesSeries = [
      {
        labels: {},
        points: values.map((v, i) => ({ timestampMs: i * 1000, value: v })),
      },
    ];
  },
);

Given(
  'a kafka lag series trending downward with values {string}',
  function (this: PrivateerWorld, valuesStr: string) {
    const values = JSON.parse(valuesStr) as number[];
    this.chartTimeseriesSeries = [
      {
        labels: {},
        points: values.map((v, i) => ({ timestampMs: i * 1000, value: v })),
      },
    ];
  },
);

Given(
  'a kafka lag series that is stable with values {string}',
  function (this: PrivateerWorld, valuesStr: string) {
    const values = JSON.parse(valuesStr) as number[];
    this.chartTimeseriesSeries = [
      {
        labels: {},
        points: values.map((v, i) => ({ timestampMs: i * 1000, value: v })),
      },
    ];
  },
);

// ---------------------------------------------------------------------------
// Given steps — MetricsTab
// ---------------------------------------------------------------------------

Given(
  'a MetricsTab with metrics tier {string}',
  function (this: PrivateerWorld, tier: string) {
    this.chartMetricsTier = tier as MetricsTier;
  },
);

Given(
  'the cadvisor exporter capability is disabled',
  function (this: PrivateerWorld) {
    this.chartCapabilities = { ...this.chartCapabilities, cadvisor: false };
  },
);

Given(
  'the cadvisor exporter capability is enabled',
  function (this: PrivateerWorld) {
    this.chartCapabilities = { ...this.chartCapabilities, cadvisor: true };
  },
);

// ---------------------------------------------------------------------------
// When steps
// ---------------------------------------------------------------------------

When(
  'the sparkline is rendered with max {int}',
  function (this: PrivateerWorld, max: number) {
    this.chartSparklineMax = max;
    this.chartSparklineResult = renderSparkline(this.chartSparklineValues, max);
  },
);

When(
  'the session sparkline is rendered with max {int}',
  function (this: PrivateerWorld, max: number) {
    this.chartSessionSparklineResult = renderSessionSparkline(
      this.chartSparklineValues,
      max,
    );
  },
);

When(
  'the sparkline columns are computed for resource type {string}',
  function (this: PrivateerWorld, _resourceType: string) {
    // Columns already computed in Given steps above
    // Nothing extra to do here — the columns are in this.chartSparklineColumns
  },
);

When('I read the selected range', function (this: PrivateerWorld) {
  // No-op — the model is already set
});

When(
  'I select chart range {string}',
  function (this: PrivateerWorld, label: string) {
    assert.ok(
      this.chartRangeModel !== null,
      'range model is null — was Given "a fresh range selector model" executed?',
    );
    this.chartRangeModel = selectRange(
      this.chartRangeModel,
      label as RangeLabel,
    );
  },
);

When('I list all chart range options', function (this: PrivateerWorld) {
  this.chartRangeOptions = ALL_RANGES.join(',');
});

When(
  'the chart is rendered at width {int}',
  function (this: PrivateerWorld, width: number) {
    const clock = {
      now: () => this.chartTimeseriesClockMs,
      setTimeout: (_cb: () => void, _ms: number) => () => undefined,
      setInterval: (_cb: () => void, _ms: number) => () => undefined,
    };
    const chart = renderTimeseriesChart({
      series: this.chartTimeseriesSeries,
      width,
      clock,
    });
    this.chartTimeseriesLines = chart.lines;
  },
);

When('the trend indicator is computed', function (this: PrivateerWorld) {
  const firstSeries = this.chartTimeseriesSeries[0];
  assert.ok(firstSeries !== undefined, 'no series set');
  const values = firstSeries.points.map((p) => p.value);
  this.chartTrendIndicator = computeTrendIndicator(values);
});

When('the MetricsTab is rendered', function (this: PrivateerWorld) {
  const element = React.createElement(MetricsTab, {
    resourceKind: 'Pod',
    resourceName: 'test-pod',
    tier: this.chartMetricsTier,
    capabilities: this.chartCapabilities,
  });
  const { lastFrame } = render(element);
  this.chartRenderedOutput = lastFrame() ?? '';
});

// ---------------------------------------------------------------------------
// Then steps
// ---------------------------------------------------------------------------

Then(
  'the sparkline string is {string}',
  function (this: PrivateerWorld, expected: string) {
    const result = this.chartSparklineResult;
    assert.ok(result !== null, 'sparkline result is null');
    assert.equal(result.text, expected);
  },
);

Then(
  'the sparkline color is {string}',
  function (this: PrivateerWorld, expected: string) {
    // Check both regular and session sparkline results
    const result = this.chartSparklineResult;
    const sessionResult = this.chartSessionSparklineResult;

    if (result !== null) {
      assert.equal(result.color, expected);
    } else if (sessionResult !== null) {
      assert.equal(sessionResult.color, expected);
    } else {
      assert.fail('neither sparkline result nor session result is set');
    }
  },
);

Then(
  'the sparkline string starts with {string}',
  function (this: PrivateerWorld, prefix: string) {
    const result = this.chartSessionSparklineResult;
    assert.ok(result !== null, 'session sparkline result is null');
    assert.ok(
      result.text.startsWith(prefix),
      `expected text to start with "${prefix}", got "${result.text}"`,
    );
  },
);

Then(
  'the sparkline columns include {string} and {string}',
  function (this: PrivateerWorld, col1: string, col2: string) {
    const names = this.chartSparklineColumns.map((c) => c.name);
    assert.ok(
      names.includes(col1),
      `expected column "${col1}" in [${names.join(', ')}]`,
    );
    assert.ok(
      names.includes(col2),
      `expected column "${col2}" in [${names.join(', ')}]`,
    );
  },
);

Then(
  'the sparkline columns include {string}',
  function (this: PrivateerWorld, col: string) {
    const names = this.chartSparklineColumns.map((c) => c.name);
    assert.ok(
      names.includes(col),
      `expected column "${col}" in [${names.join(', ')}]`,
    );
  },
);

Then(
  'the selected range label is {string}',
  function (this: PrivateerWorld, expected: string) {
    assert.ok(this.chartRangeModel !== null, 'range model is null');
    assert.equal(this.chartRangeModel.selected, expected);
  },
);

Then(
  'the chart range options are {string}',
  function (this: PrivateerWorld, expected: string) {
    assert.equal(this.chartRangeOptions, expected);
  },
);

Then(
  'the chart has exactly {int} data rows',
  function (this: PrivateerWorld, expected: number) {
    // Lines = data rows (CHART_ROWS) + x-axis row = 9 total (or 10 with title)
    // The data rows are all but the last line (x-axis)
    const dataRows = this.chartTimeseriesLines.length - 1;
    assert.equal(dataRows, expected);
  },
);

Then(
  'the chart Y-axis has between {int} and {int} ticks',
  function (this: PrivateerWorld, minTicks: number, maxTicks: number) {
    // Count unique non-empty labels in the 8 data rows (all but last line)
    const dataLines = this.chartTimeseriesLines.slice(0, -1);
    const labels = dataLines
      .map((l) => l.slice(0, 6).trim())
      .filter((s) => s.length > 0);
    const uniqueLabels = new Set(labels);
    assert.ok(
      uniqueLabels.size >= minTicks,
      `expected at least ${String(minTicks)} Y ticks, got ${String(uniqueLabels.size)}`,
    );
    assert.ok(
      uniqueLabels.size <= maxTicks,
      `expected at most ${String(maxTicks)} Y ticks, got ${String(uniqueLabels.size)}`,
    );
  },
);

Then(
  'the chart output contains a time label line',
  function (this: PrivateerWorld) {
    const hasTimeLabel = this.chartTimeseriesLines.some((l) =>
      /\d{2}:\d{2}/.test(l),
    );
    assert.ok(hasTimeLabel, 'expected a time label (HH:MM) in chart output');
  },
);

Then(
  'the trend indicator is {string}',
  function (this: PrivateerWorld, expected: string) {
    assert.equal(this.chartTrendIndicator, expected);
  },
);

Then(
  'the rendered output contains {string}',
  function (this: PrivateerWorld, expected: string) {
    assert.ok(
      this.chartRenderedOutput.includes(expected),
      `expected output to contain "${expected}", got:\n${this.chartRenderedOutput}`,
    );
  },
);
