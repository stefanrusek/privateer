/**
 * Sparkline rendering (Spec 06 §3.1).
 *
 * Converts MetricSeries[] to Unicode block sparkline strings.
 * Width: 10 chars. Characters: ▁▂▃▄▅▆▇█.
 * Color thresholds: green <70%, yellow 70-90%, red >90%, grey = no data.
 * Session data gets ~ prefix.
 *
 * Pure functions only — no side effects, no Date.now, no Math.random.
 */

import type { MetricSeries } from '../boundaries/metrics-source.js';

/** The 8 Unicode block characters for sparklines (index 0 = lowest). */
const BLOCKS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'] as const;
const BLOCKS_LEN = BLOCKS.length;

/** Map a fraction [0..1] to a block character index. */
function fractionToBlockChar(fraction: number): string {
  // Multiply fraction by 8, clamp to [0,7], and select block character.
  // We use a switch over all valid index values to satisfy noUncheckedIndexedAccess.
  const rawIdx = Math.floor(fraction * BLOCKS_LEN);
  switch (rawIdx < BLOCKS_LEN ? rawIdx : BLOCKS_LEN - 1) {
    case 0:
      return '▁';
    case 1:
      return '▂';
    case 2:
      return '▃';
    case 3:
      return '▄';
    case 4:
      return '▅';
    case 5:
      return '▆';
    case 6:
      return '▇';
    default:
      return '█';
  }
}

/** Map a single value in [0..max] to a block character. */
function valueToBlock(v: number, max: number): string {
  return fractionToBlockChar(v / max);
}

/** Threshold color classification for a sparkline. */
export type SparklineColor = 'green' | 'yellow' | 'red' | 'grey';

/** Result of rendering a sparkline. */
export interface SparklineResult {
  /** 10-character sparkline string. */
  readonly text: string;
  /** Color classification based on the most recent value vs max. */
  readonly color: SparklineColor;
}

/** Rendered sparkline with optional session prefix. */
export interface RenderedSparkline {
  /** The visible string (may start with ~ for session data). */
  readonly text: string;
  /** Color classification. */
  readonly color: SparklineColor;
}

/**
 * Render a sparkline from the last 10 values of a series.
 *
 * @param values - Raw numeric values (latest-last ordering)
 * @param max - The maximum value (used for relative scaling and color)
 * @returns SparklineResult with text and color
 */
export function renderSparkline(
  values: readonly number[],
  max: number,
): SparklineResult {
  if (values.length === 0 || max <= 0) {
    return { text: '▁'.repeat(10), color: 'grey' };
  }

  // Take last 10 values, pad front if fewer
  const raw = values.slice(-10);
  const padded: number[] =
    raw.length < 10
      ? [...Array<number>(10 - raw.length).fill(0), ...raw]
      : [...raw];

  // Clamp all values to [0, max]
  const clamped = padded.map((v) => Math.max(0, Math.min(v, max)));

  // Convert to sparkline characters (clamped is exactly 10 elements, all [0..max])
  const text = clamped.map((v) => valueToBlock(v, max)).join('');

  // Color: use the most recent value (clamped always has 10 elements here)
  const lastValue = clamped.reduce<number>((_, cur) => cur, 0);
  const pct = lastValue / max;
  const color = classifyColor(pct);

  return { text, color };
}

/**
 * Render a sparkline from MetricSeries[] (uses the first series).
 * Returns grey sparkline if no series provided.
 */
export function renderSeriesSparkline(
  series: readonly MetricSeries[],
  max: number,
): SparklineResult {
  const firstSeries = series[0];
  if (firstSeries === undefined || firstSeries.points.length === 0) {
    return { text: '▁'.repeat(10), color: 'grey' };
  }

  const values = firstSeries.points.map((p) => p.value);
  return renderSparkline(values, max);
}

/**
 * Render a session-data sparkline (metrics-server fallback).
 * Identical to renderSparkline but prefixes the text with ~.
 * Spec 06 §2.3 / §3.2.
 */
export function renderSessionSparkline(
  values: readonly number[],
  max: number,
): RenderedSparkline {
  const { text, color } = renderSparkline(values, max);
  return { text: `~${text}`, color };
}

/** Classify a fraction [0..1] into a sparkline color. */
function classifyColor(pct: number): SparklineColor {
  if (pct < 0.7) {
    return 'green';
  }
  if (pct <= 0.9) {
    return 'yellow';
  }
  return 'red';
}

// ---------------------------------------------------------------------------
// §3.2 Per-resource-type sparkline column definitions
// ---------------------------------------------------------------------------

/** A named sparkline column. */
export interface SparklineColumn {
  /** Display name for the column header. */
  readonly name: string;
  /** The rendered sparkline for the column. */
  readonly sparkline: SparklineResult;
}

/** Input data for computing sparkline columns for a resource. */
export interface ResourceSparklineInput {
  readonly resourceType: string;
  /** CPU usage values (last 10 samples). */
  readonly cpuValues?: readonly number[];
  /** Memory usage values (last 10 samples). */
  readonly memoryValues?: readonly number[];
  /** Consumer lag values (last 10 samples, for KafkaTopic). */
  readonly lagValues?: readonly number[];
  /** Under-replicated partitions values (last 10 samples, for Kafka). */
  readonly underReplicatedValues?: readonly number[];
  /** Max CPU (for scaling). */
  readonly maxCpu?: number;
  /** Max memory (for scaling). */
  readonly maxMemory?: number;
  /** Max lag (for scaling). */
  readonly maxLag?: number;
  /** Max under-replicated (for scaling). */
  readonly maxUnderReplicated?: number;
}

/**
 * Compute sparkline columns for a resource based on its type.
 * Spec 06 §3.2.
 */
export function computeSparklineColumns(
  input: ResourceSparklineInput,
): SparklineColumn[] {
  const columns: SparklineColumn[] = [];

  switch (input.resourceType) {
    case 'Pod':
    case 'Node':
    case 'Deployment':
    case 'StatefulSet': {
      const cpuSparkline = renderSparkline(
        input.cpuValues ?? [],
        input.maxCpu ?? 100,
      );
      columns.push({ name: 'CPU', sparkline: cpuSparkline });

      const memSparkline = renderSparkline(
        input.memoryValues ?? [],
        input.maxMemory ?? 100,
      );
      columns.push({ name: 'Memory', sparkline: memSparkline });
      break;
    }

    case 'KafkaTopic': {
      const lagSparkline = renderSparkline(
        input.lagValues ?? [],
        input.maxLag ?? 100,
      );
      columns.push({ name: 'Lag', sparkline: lagSparkline });
      break;
    }

    case 'Kafka': {
      const urpSparkline = renderSparkline(
        input.underReplicatedValues ?? [],
        input.maxUnderReplicated ?? 10,
      );
      columns.push({ name: 'UnderReplicated', sparkline: urpSparkline });
      break;
    }

    default:
      // No sparkline columns for unknown resource types
      break;
  }

  return columns;
}
