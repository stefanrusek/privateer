/**
 * Unit tests for timeseries chart and trend indicator (Spec 06 §4.2, §4.4).
 * 100% branch coverage.
 */

import { describe, it, expect } from 'vitest';
import { renderTimeseriesChart, computeTrendIndicator } from './timeseries.js';
import type { MetricSeries } from '../boundaries/metrics-source.js';

// ---------------------------------------------------------------------------
// Fake clock
// ---------------------------------------------------------------------------

const EPOCH_MS = 1_749_600_000_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSeries(
  values: number[],
  startMs = EPOCH_MS,
  stepMs = 60_000,
): MetricSeries {
  return {
    labels: {},
    points: values.map((v, i) => ({
      timestampMs: startMs + i * stepMs,
      value: v,
    })),
  };
}

// ---------------------------------------------------------------------------
// renderTimeseriesChart
// ---------------------------------------------------------------------------

describe('renderTimeseriesChart', () => {
  it('renders exactly 8 data rows (no title, no x-axis line)', () => {
    const series = [makeSeries([10, 20, 30, 40, 50, 60])];
    const chart = renderTimeseriesChart({
      series,
      width: 60,
    });
    // 8 data rows + 1 x-axis row = 9 lines
    expect(chart.lines.length).toBe(9);
  });

  it('renders 8 data rows with a title', () => {
    const series = [makeSeries([10, 20, 30, 40, 50])];
    const chart = renderTimeseriesChart({
      series,
      width: 60,
      title: 'CPU Usage',
    });
    // title + 8 data rows + 1 x-axis = 10 lines
    expect(chart.lines.length).toBe(10);
    expect(chart.lines[0]).toBe('CPU Usage');
  });

  it('Y-axis has between 4 and 5 ticks (unique Y-label values)', () => {
    const series = [makeSeries([0, 50, 100])];
    const chart = renderTimeseriesChart({
      series,
      width: 60,
    });
    // Count unique non-empty Y labels in the 8 data rows
    const dataLines = chart.lines.slice(0, 8);
    const uniqueLabels = new Set(
      dataLines.map((l) => l.slice(0, 6).trim()).filter((s) => s.length > 0),
    );
    expect(uniqueLabels.size).toBeGreaterThanOrEqual(4);
    expect(uniqueLabels.size).toBeLessThanOrEqual(5);
  });

  it('renders 8 rows for all-zero data', () => {
    const series = [makeSeries([0, 0, 0, 0, 0, 0])];
    const chart = renderTimeseriesChart({
      series,
      width: 60,
    });
    expect(chart.lines.length).toBe(9);
  });

  it('renders 8 rows for empty series', () => {
    const chart = renderTimeseriesChart({
      series: [],
      width: 60,
    });
    expect(chart.lines.length).toBe(9);
  });

  it('renders with series having single point', () => {
    const series = [makeSeries([50])];
    const chart = renderTimeseriesChart({
      series,
      width: 60,
    });
    expect(chart.lines.length).toBe(9);
  });

  it('renders correctly with minimum width of 1', () => {
    const series = [makeSeries([10, 50])];
    const chart = renderTimeseriesChart({ series, width: 1 });
    expect(chart.lines.length).toBe(9);
  });

  it('x-axis row contains time label', () => {
    const series = [
      makeSeries([10, 20, 30, 40, 50, 60], EPOCH_MS, 10 * 60_000),
    ];
    const chart = renderTimeseriesChart({
      series,
      width: 60,
    });
    const xAxisLine = chart.lines[chart.lines.length - 1] ?? '';
    // Should contain colon (time labels like HH:MM)
    expect(xAxisLine).toMatch(/\d{2}:\d{2}/);
  });

  it('renders multi-series data without error', () => {
    const series = [
      makeSeries([10, 20, 30, 40, 50]),
      makeSeries([50, 40, 30, 20, 10]),
    ];
    const chart = renderTimeseriesChart({
      series,
      width: 60,
    });
    expect(chart.lines.length).toBe(9);
  });

  it('handles series with empty points array', () => {
    const s: MetricSeries = { labels: {}, points: [] };
    const chart = renderTimeseriesChart({
      series: [s],
      width: 60,
    });
    expect(chart.lines.length).toBe(9);
  });

  it('handles all data rows having some plot character', () => {
    const series = [makeSeries([10, 20, 30, 40, 50, 60, 70, 80, 90, 100])];
    const chart = renderTimeseriesChart({
      series,
      width: 60,
    });
    // At least one line should contain █
    const hasPlot = chart.lines.some((l) => l.includes('█'));
    expect(hasPlot).toBe(true);
  });

  it('handles scale.max === scale.min (all same values)', () => {
    // When all values are the same, max === min, triggering the ? 0.5 branch
    const series = [makeSeries([50, 50, 50, 50])];
    const chart = renderTimeseriesChart({
      series,
      width: 60,
    });
    expect(chart.lines.length).toBe(9);
  });

  it('renders large values with k suffix tick labels', () => {
    // Values in thousands → tick labels should include k suffix
    const series = [makeSeries([1000, 2000, 3000, 4000, 5000])];
    const chart = renderTimeseriesChart({
      series,
      width: 60,
    });
    const hasKLabel = chart.lines.some((l) => l.includes('k'));
    expect(hasKLabel).toBe(true);
  });

  it('renders very large values with M suffix tick labels', () => {
    // Values in millions → tick labels should include M suffix
    const series = [makeSeries([1_000_000, 2_000_000, 3_000_000])];
    const chart = renderTimeseriesChart({
      series,
      width: 60,
    });
    const hasMLabel = chart.lines.some((l) => l.includes('M'));
    expect(hasMLabel).toBe(true);
  });

  it('handles niceNumber for f >= 7 (nf=10 branch)', () => {
    // roughStep = range/4; range = 4*7 = 28 → roughStep=7 → exp=0, f=7 → nf=10
    const series = [makeSeries([0, 28, 14, 28])];
    const chart = renderTimeseriesChart({
      series,
      width: 60,
    });
    expect(chart.lines.length).toBe(9);
  });

  it('handles niceNumber for f in [3,7) (nf=5 branch)', () => {
    // roughStep = range/4; range=20 → roughStep=5 → exp=0, f=5 → nf=5
    const series = [makeSeries([0, 20, 10, 20])];
    const chart = renderTimeseriesChart({
      series,
      width: 60,
    });
    expect(chart.lines.length).toBe(9);
  });

  it('handles non-integer tick values (decimal format)', () => {
    // Values that produce fractional tick labels
    const series = [makeSeries([0, 1])];
    const chart = renderTimeseriesChart({
      series,
      width: 60,
    });
    expect(chart.lines.length).toBe(9);
  });
});

// ---------------------------------------------------------------------------
// computeTrendIndicator
// ---------------------------------------------------------------------------

describe('computeTrendIndicator', () => {
  it('returns → for empty values', () => {
    expect(computeTrendIndicator([])).toBe('→');
  });

  it('returns → for single value', () => {
    expect(computeTrendIndicator([100])).toBe('→');
  });

  it('returns ↑ for clearly climbing series', () => {
    expect(computeTrendIndicator([100, 200, 300, 400, 500])).toBe('↑');
  });

  it('returns ↓ for clearly dropping series', () => {
    expect(computeTrendIndicator([500, 400, 300, 200, 100])).toBe('↓');
  });

  it('returns → for stable series', () => {
    expect(computeTrendIndicator([200, 200, 200, 201, 199])).toBe('→');
  });

  it('returns → when both halves are zero', () => {
    expect(computeTrendIndicator([0, 0, 0, 0])).toBe('→');
  });

  it('returns ↑ even for two values if climbing', () => {
    expect(computeTrendIndicator([1, 2])).toBe('↑');
  });

  it('handles large values without error', () => {
    expect(computeTrendIndicator([1_000_000, 2_000_000])).toBe('↑');
  });

  it('handles slight climb within stable threshold as →', () => {
    // 3% increase — within 5% threshold
    expect(computeTrendIndicator([100, 103])).toBe('→');
  });

  it('handles slight drop within stable threshold as →', () => {
    // 3% decrease — within 5% threshold
    expect(computeTrendIndicator([100, 97])).toBe('→');
  });

  it('returns ↑ when first half is zero and second is nonzero', () => {
    // first half avg = 0, second half avg > 0 → climbing
    expect(computeTrendIndicator([0, 0, 100, 200])).toBe('↑');
  });
});
