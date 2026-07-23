/**
 * ASCII time-series chart renderer (Spec 06 §4.2).
 *
 * - Auto Y-scale with 4-5 labeled ticks
 * - X-axis time labels at reasonable intervals
 * - Fixed 8 data rows
 * - Multi-series support
 * - Uses Clock interface (never Date.now)
 *
 * Pure functions over MetricSeries[].
 */

import type { MetricSeries } from '../boundaries/metrics-source.js';

/** A rendered time-series chart broken into lines. */
export interface TimeseriesChart {
  /** All lines of the chart, top to bottom. */
  readonly lines: readonly string[];
}

/** Options for rendering a time-series chart. */
export interface TimeseriesChartOptions {
  /** Series to render. */
  readonly series: readonly MetricSeries[];
  /** Chart width in characters. */
  readonly width: number;
  /** Title shown above the chart. */
  readonly title?: string;
}

/** Number of data rows (fixed per spec §4.2). */
const CHART_ROWS = 8;

/** Number of Y-axis ticks (4–5 per spec §4.2). */
const Y_TICK_COUNT = 5;

/** Width of the Y-axis label column. */
const Y_LABEL_WIDTH = 6;

// ---------------------------------------------------------------------------
// Y-axis scaling
// ---------------------------------------------------------------------------

interface YScale {
  min: number;
  max: number;
  ticks: number[];
  tickLabels: string[];
}

/** Compute a "nice" Y scale for the given data range. */
function computeYScale(allValues: readonly number[]): YScale {
  const dataMin = allValues.length > 0 ? Math.min(...allValues) : 0;
  const dataMax = allValues.length > 0 ? Math.max(...allValues) : 1;

  // Ensure we have a nonzero range
  const rawMax = dataMax <= 0 ? 1 : dataMax;
  const rawMin = Math.min(0, dataMin);

  const range = rawMax - rawMin;
  // Compute a nice step for 4-5 ticks
  const roughStep = range / (Y_TICK_COUNT - 1);
  const niceStep = niceNumber(roughStep);
  const niceMin = Math.floor(rawMin / niceStep) * niceStep;
  const niceMax = Math.ceil(rawMax / niceStep) * niceStep;

  const ticks: number[] = [];
  let t = niceMin;
  // Cap at Y_TICK_COUNT (5) to avoid infinite loops and stay within spec §4.2
  while (t <= niceMax + niceStep * 0.001 && ticks.length < Y_TICK_COUNT) {
    ticks.push(Number(t.toFixed(10)));
    t += niceStep;
  }

  const tickLabels = ticks.map((v) => formatTickLabel(v));

  return { min: niceMin, max: niceMax, ticks, tickLabels };
}

/** Round to a "nice" number for axis labels. Assumes value > 0. */
function niceNumber(value: number): number {
  const exp = Math.floor(Math.log10(value));
  const f = value / Math.pow(10, exp);
  let nf: number;
  if (f < 1.5) nf = 1;
  else if (f < 3) nf = 2;
  else if (f < 7) nf = 5;
  else nf = 10;
  return nf * Math.pow(10, exp);
}

/** Format a tick label compactly. */
function formatTickLabel(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(0)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(0)}k`;
  }
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value.toFixed(1);
}

// ---------------------------------------------------------------------------
// X-axis time labels
// ---------------------------------------------------------------------------

/** Format an epoch ms timestamp as HH:MM. */
function formatTime(epochMs: number): string {
  const d = new Date(epochMs);
  const h = String(d.getUTCHours()).padStart(2, '0');
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/** Build an X-axis time label row. */
function buildXAxisRow(
  series: readonly MetricSeries[],
  plotWidth: number,
  yLabelWidth: number,
): string {
  const firstSeries = series[0];
  const points = firstSeries?.points ?? [];
  const firstPt = points.length > 0 ? points[0] : undefined;
  const lastPt = points.length > 0 ? points[points.length - 1] : undefined;
  if (firstPt === undefined || lastPt === undefined) {
    return ' '.repeat(yLabelWidth + plotWidth);
  }

  const startMs = firstPt.timestampMs;
  const endMs = lastPt.timestampMs;
  const midMs = (startMs + endMs) / 2;

  // Build a blank row, then place time labels at 3 positions
  const row = Array<string>(yLabelWidth + plotWidth).fill(' ');

  // The end label right-aligns to the last column (its start col is pulled
  // left by its own length) so it renders in full instead of being clipped to
  // a single character at the pane's edge — the last-label truncation
  // (P9R-0006) previously left only e.g. `1` of `14:32` visible.
  const endLabel = formatTime(endMs);
  const labelPositions = [
    { col: yLabelWidth + 0, ts: startMs },
    { col: yLabelWidth + Math.floor(plotWidth / 2), ts: midMs },
    {
      col: Math.max(yLabelWidth, yLabelWidth + plotWidth - endLabel.length),
      ts: endMs,
    },
  ];

  for (const { col: startCol, ts } of labelPositions) {
    formatTime(ts)
      .split('')
      .forEach((ch, j) => {
        const col = startCol + j;
        if (col >= 0 && col < row.length) {
          row[col] = ch;
        }
      });
  }

  return row.join('');
}

// ---------------------------------------------------------------------------
// Plot rendering
// ---------------------------------------------------------------------------

/** Map a value to a row index (0 = top, CHART_ROWS-1 = bottom). */
function valueToRow(value: number, scale: YScale): number {
  // scale.max is always > scale.min because computeYScale ensures rawMax > rawMin via niceStep
  const fraction = (value - scale.min) / (scale.max - scale.min);
  const row = CHART_ROWS - 1 - Math.round(fraction * (CHART_ROWS - 1));
  return Math.max(0, Math.min(CHART_ROWS - 1, row));
}

/** Render the ASCII plot grid. */
function buildPlotGrid(
  series: readonly MetricSeries[],
  plotWidth: number,
  scale: YScale,
): string[][] {
  // Initialize empty grid
  const grid: string[][] = Array.from({ length: CHART_ROWS }, () =>
    Array<string>(plotWidth).fill(' '),
  );

  for (const s of series) {
    const firstPt = s.points.at(0);
    const lastPt = s.points.at(-1);
    if (firstPt === undefined || lastPt === undefined) continue;

    const tStart = firstPt.timestampMs;
    const tEnd = lastPt.timestampMs;
    const tRange = tEnd - tStart;

    for (const pt of s.points) {
      // Map timestamp to column
      const col =
        tRange === 0
          ? Math.floor(plotWidth / 2)
          : Math.round(((pt.timestampMs - tStart) / tRange) * (plotWidth - 1));

      const clampedCol = Math.max(0, Math.min(plotWidth - 1, col));
      const row = valueToRow(pt.value, scale);

      // Use reduce to set cell — avoids indexed grid access
      grid.forEach((cells, r) => {
        if (r === row) {
          cells[clampedCol] = '█';
        }
      });
    }
  }

  return grid;
}

// ---------------------------------------------------------------------------
// Main render function
// ---------------------------------------------------------------------------

/**
 * Render a time-series chart to ASCII lines.
 * Spec 06 §4.2: fixed 8 rows, auto Y-scale, X time labels.
 */
export function renderTimeseriesChart(
  options: TimeseriesChartOptions,
): TimeseriesChart {
  const { series, width, title } = options;

  const plotWidth = Math.max(1, width - Y_LABEL_WIDTH - 1);

  // Collect all values for scale computation
  const allValues: number[] = [];
  for (const s of series) {
    for (const pt of s.points) {
      allValues.push(pt.value);
    }
  }

  const scale = computeYScale(allValues);
  const grid = buildPlotGrid(series, plotWidth, scale);

  const lines: string[] = [];

  // Optional title
  if (title !== undefined && title.length > 0) {
    lines.push(title);
  }

  // Build label array: one entry per row, empty string if no tick assigned.
  // Pair ticks and labels (both arrays have the same length from computeYScale).
  // ticks and tickLabels have identical lengths (from computeYScale)
  const tickPairs = scale.ticks.map((tick, i) => ({
    tick,
    label: scale.tickLabels.reduce<string>(
      (acc, lbl, j) => (j === i ? lbl : acc),
      '',
    ),
  }));
  const rowLabels: string[] = Array<string>(CHART_ROWS).fill('');
  const usedRows = new Set<number>();
  for (const { tick, label } of tickPairs) {
    // scale.max is always > scale.min (guaranteed by computeYScale)
    const fraction = (tick - scale.min) / (scale.max - scale.min);
    const row = CHART_ROWS - 1 - Math.round(fraction * (CHART_ROWS - 1));
    const clampedRow = Math.max(0, Math.min(CHART_ROWS - 1, row));
    // Only assign if not already used by another tick
    if (!usedRows.has(clampedRow)) {
      rowLabels[clampedRow] = label;
      usedRows.add(clampedRow);
    }
  }

  // Build chart rows with Y-axis labels (zip rowLabels and grid, both CHART_ROWS long)
  // zip using map — grid is exactly CHART_ROWS rows, rowLabels is exactly CHART_ROWS strings
  lines.push(
    ...grid.map((cells, row) => {
      const labelStr = rowLabels.reduce<string>(
        (acc, lbl, i) => (i === row ? lbl : acc),
        '',
      );
      return labelStr.padStart(Y_LABEL_WIDTH - 1) + ' ' + cells.join('');
    }),
  );

  // X-axis
  lines.push(buildXAxisRow(series, plotWidth, Y_LABEL_WIDTH));

  return { lines };
}

// ---------------------------------------------------------------------------
// Kafka lag trend indicator (Spec 06 §4.4)
// ---------------------------------------------------------------------------

/** Trend indicator for Kafka lag chart legends. */
export type TrendIndicator = '↑' | '↓' | '→';

/**
 * Compute the trend indicator for a consumer lag series.
 * Compares the average of the first half vs the second half.
 * - ↑ if last half average > first half average by >5%
 * - ↓ if last half average < first half average by >5%
 * - → otherwise (stable)
 */
export function computeTrendIndicator(
  values: readonly number[],
): TrendIndicator {
  if (values.length < 2) {
    return '→';
  }

  const mid = Math.floor(values.length / 2);
  const firstHalf = values.slice(0, mid);
  const secondHalf = values.slice(mid);

  const firstAvg = average(firstHalf);
  const secondAvg = average(secondHalf);

  if (firstAvg === 0 && secondAvg === 0) {
    return '→';
  }

  const baseline = firstAvg === 0 ? 1 : firstAvg;
  const changePct = (secondAvg - firstAvg) / Math.abs(baseline);

  if (changePct > 0.05) {
    return '↑';
  }
  if (changePct < -0.05) {
    return '↓';
  }
  return '→';
}

function average(values: readonly number[]): number {
  // values.length is always >= 1 when called from computeTrendIndicator
  return values.reduce((acc, v) => acc + v, 0) / values.length;
}
