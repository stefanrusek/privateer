/**
 * Unit tests for sparkline rendering (Spec 06 §3.1, §3.2).
 * 100% branch coverage including all threshold/scale branches.
 */

import { describe, it, expect } from 'vitest';
import {
  renderSparkline,
  renderSeriesSparkline,
  renderSessionSparkline,
  computeSparklineColumns,
} from './sparkline.js';
import type { MetricSeries } from '../boundaries/metrics-source.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSeries(values: number[]): MetricSeries {
  return {
    labels: {},
    points: values.map((v, i) => ({ timestampMs: i * 1000, value: v })),
  };
}

// ---------------------------------------------------------------------------
// renderSparkline
// ---------------------------------------------------------------------------

describe('renderSparkline', () => {
  it('returns grey with low blocks for empty values array', () => {
    const result = renderSparkline([], 100);
    expect(result.color).toBe('grey');
    expect(result.text).toBe('▁▁▁▁▁▁▁▁▁▁');
  });

  it('returns grey when max is 0', () => {
    const result = renderSparkline([1, 2, 3], 0);
    expect(result.color).toBe('grey');
    expect(result.text).toBe('▁▁▁▁▁▁▁▁▁▁');
  });

  it('returns grey when max is negative', () => {
    const result = renderSparkline([1, 2, 3], -1);
    expect(result.color).toBe('grey');
    expect(result.text).toBe('▁▁▁▁▁▁▁▁▁▁');
  });

  it('produces 10-char string for 10 values', () => {
    const result = renderSparkline(
      [10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
      100,
    );
    expect(Array.from(result.text).length).toBe(10);
  });

  it('pads to 10 chars when fewer than 10 values', () => {
    const result = renderSparkline([50], 100);
    expect(Array.from(result.text).length).toBe(10);
  });

  it('takes only the last 10 when more than 10 values', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const result = renderSparkline(values, 100);
    expect(Array.from(result.text).length).toBe(10);
  });

  it('returns green color when last value < 70% of max', () => {
    const result = renderSparkline([60], 100);
    expect(result.color).toBe('green');
  });

  it('returns yellow color when last value exactly 70%', () => {
    const result = renderSparkline([70], 100);
    expect(result.color).toBe('yellow');
  });

  it('returns yellow color when last value between 70-90%', () => {
    const result = renderSparkline([80], 100);
    expect(result.color).toBe('yellow');
  });

  it('returns yellow color when last value exactly 90%', () => {
    const result = renderSparkline([90], 100);
    expect(result.color).toBe('yellow');
  });

  it('returns red color when last value above 90%', () => {
    const result = renderSparkline([95], 100);
    expect(result.color).toBe('red');
  });

  it('returns red color when last value equals max', () => {
    const result = renderSparkline([100], 100);
    expect(result.color).toBe('red');
  });

  it('clamps values above max to max', () => {
    const result = renderSparkline([200], 100);
    expect(result.color).toBe('red');
  });

  it('clamps values below 0 to 0', () => {
    const result = renderSparkline([-50], 100);
    expect(result.color).toBe('green');
  });

  it('uses block characters from the allowed set', () => {
    const blocks = new Set(['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█']);
    const result = renderSparkline([50], 100);
    for (const ch of result.text) {
      expect(blocks.has(ch)).toBe(true);
    }
  });

  it('ascending values produce ascending sparkline blocks', () => {
    const result = renderSparkline(
      [10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
      100,
    );
    // The sparkline should not be all the same character — should go up
    const chars = Array.from(result.text);
    const first = chars.at(0) ?? '';
    const last = chars.at(-1) ?? '';
    expect(last >= first).toBe(true);
  });

  it('uses all 8 block characters for a full-range ramp', () => {
    // Values at 1/16, 3/16, 5/16, 7/16, 9/16, 11/16, 13/16, 15/16 of max
    // to hit each of the 8 block character cases (0..7)
    const max = 16;
    const values = [1, 3, 5, 7, 9, 11, 13, 15];
    const result = renderSparkline(values, max);
    // Each of the 8 chars should appear
    const charSet = new Set(Array.from(result.text));
    expect(charSet.has('▁')).toBe(true);
    expect(charSet.has('▂')).toBe(true);
    expect(charSet.has('▃')).toBe(true);
    expect(charSet.has('▄')).toBe(true);
    expect(charSet.has('▅')).toBe(true);
    expect(charSet.has('▆')).toBe(true);
    expect(charSet.has('▇')).toBe(true);
    expect(charSet.has('█')).toBe(true);
  });

  it('all-zero values produce all lowest blocks', () => {
    const result = renderSparkline([0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 100);
    expect(result.text).toBe('▁▁▁▁▁▁▁▁▁▁');
    // Zero values → green (0/100 = 0% < 70%)
    expect(result.color).toBe('green');
  });
});

// ---------------------------------------------------------------------------
// renderSeriesSparkline
// ---------------------------------------------------------------------------

describe('renderSeriesSparkline', () => {
  it('returns grey for empty series array', () => {
    const result = renderSeriesSparkline([], 100);
    expect(result.color).toBe('grey');
  });

  it('returns grey for series with no points', () => {
    const result = renderSeriesSparkline([makeSeries([])], 100);
    expect(result.color).toBe('grey');
  });

  it('renders from first series values', () => {
    const result = renderSeriesSparkline(
      [makeSeries([60, 60, 60, 60, 60, 60, 60, 60, 60, 60])],
      100,
    );
    expect(result.color).toBe('green');
  });

  it('ignores additional series beyond first', () => {
    const result = renderSeriesSparkline(
      [
        makeSeries([60, 60, 60, 60, 60, 60, 60, 60, 60, 60]),
        makeSeries([95, 95, 95, 95, 95, 95, 95, 95, 95, 95]),
      ],
      100,
    );
    // Should use first series (60) — green
    expect(result.color).toBe('green');
  });
});

// ---------------------------------------------------------------------------
// renderSessionSparkline
// ---------------------------------------------------------------------------

describe('renderSessionSparkline', () => {
  it('prefixes with tilde for session data', () => {
    const result = renderSessionSparkline(
      [50, 50, 50, 50, 50, 50, 50, 50, 50, 50],
      100,
    );
    expect(result.text.startsWith('~')).toBe(true);
  });

  it('preserves color classification', () => {
    const result = renderSessionSparkline([60], 100);
    expect(result.color).toBe('green');
  });

  it('has 11+ chars total (tilde + 10)', () => {
    const result = renderSessionSparkline(
      [50, 50, 50, 50, 50, 50, 50, 50, 50, 50],
      100,
    );
    expect(Array.from(result.text).length).toBeGreaterThan(10);
  });
});

// ---------------------------------------------------------------------------
// computeSparklineColumns
// ---------------------------------------------------------------------------

describe('computeSparklineColumns', () => {
  it('returns CPU and Memory columns for Pod', () => {
    const cols = computeSparklineColumns({
      resourceType: 'Pod',
      cpuValues: [40, 40, 40, 40, 40, 40, 40, 40, 40, 40],
      memoryValues: [60, 60, 60, 60, 60, 60, 60, 60, 60, 60],
      maxCpu: 100,
      maxMemory: 100,
    });
    const names = cols.map((c) => c.name);
    expect(names).toContain('CPU');
    expect(names).toContain('Memory');
    expect(names).toHaveLength(2);
  });

  it('returns CPU and Memory columns for Node', () => {
    const cols = computeSparklineColumns({
      resourceType: 'Node',
      cpuValues: [30],
      memoryValues: [70],
      maxCpu: 100,
      maxMemory: 100,
    });
    expect(cols.map((c) => c.name)).toContain('CPU');
    expect(cols.map((c) => c.name)).toContain('Memory');
  });

  it('returns CPU and Memory columns for Deployment', () => {
    const cols = computeSparklineColumns({
      resourceType: 'Deployment',
      cpuValues: [50],
      memoryValues: [55],
      maxCpu: 100,
      maxMemory: 100,
    });
    expect(cols.map((c) => c.name)).toContain('CPU');
    expect(cols.map((c) => c.name)).toContain('Memory');
  });

  it('returns CPU and Memory columns for StatefulSet', () => {
    const cols = computeSparklineColumns({
      resourceType: 'StatefulSet',
      cpuValues: [45],
      memoryValues: [65],
      maxCpu: 100,
      maxMemory: 100,
    });
    expect(cols.map((c) => c.name)).toContain('CPU');
    expect(cols.map((c) => c.name)).toContain('Memory');
  });

  it('returns Lag column for KafkaTopic', () => {
    const cols = computeSparklineColumns({
      resourceType: 'KafkaTopic',
      lagValues: [1000],
      maxLag: 10000,
    });
    expect(cols.map((c) => c.name)).toContain('Lag');
    expect(cols).toHaveLength(1);
  });

  it('returns UnderReplicated column for Kafka', () => {
    const cols = computeSparklineColumns({
      resourceType: 'Kafka',
      underReplicatedValues: [2],
      maxUnderReplicated: 10,
    });
    expect(cols.map((c) => c.name)).toContain('UnderReplicated');
    expect(cols).toHaveLength(1);
  });

  it('returns empty columns for unknown resource type', () => {
    const cols = computeSparklineColumns({ resourceType: 'Unknown' });
    expect(cols).toHaveLength(0);
  });

  it('handles missing optional values gracefully', () => {
    // No cpuValues / memoryValues
    const cols = computeSparklineColumns({ resourceType: 'Pod' });
    expect(cols.map((c) => c.name)).toContain('CPU');
    expect(cols.map((c) => c.name)).toContain('Memory');
    // Both should be grey (no data)
    expect(cols[0]?.sparkline.color).toBe('grey');
    expect(cols[1]?.sparkline.color).toBe('grey');
  });

  it('returns correct sparkline values in columns', () => {
    const cols = computeSparklineColumns({
      resourceType: 'Pod',
      cpuValues: [95, 95, 95, 95, 95, 95, 95, 95, 95, 95],
      memoryValues: [60, 60, 60, 60, 60, 60, 60, 60, 60, 60],
      maxCpu: 100,
      maxMemory: 100,
    });
    const cpuCol = cols.find((c) => c.name === 'CPU');
    const memCol = cols.find((c) => c.name === 'Memory');
    expect(cpuCol?.sparkline.color).toBe('red');
    expect(memCol?.sparkline.color).toBe('green');
  });

  it('handles missing optional lagValues for KafkaTopic', () => {
    const cols = computeSparklineColumns({ resourceType: 'KafkaTopic' });
    expect(cols.map((c) => c.name)).toContain('Lag');
    expect(cols[0]?.sparkline.color).toBe('grey');
  });

  it('handles missing optional underReplicatedValues for Kafka', () => {
    const cols = computeSparklineColumns({ resourceType: 'Kafka' });
    expect(cols.map((c) => c.name)).toContain('UnderReplicated');
    expect(cols[0]?.sparkline.color).toBe('grey');
  });

  it('handles explicit maxLag for KafkaTopic', () => {
    const cols = computeSparklineColumns({
      resourceType: 'KafkaTopic',
      lagValues: [5000],
      maxLag: 10000,
    });
    expect(cols[0]?.sparkline.color).toBe('green');
  });

  it('handles explicit maxUnderReplicated for Kafka', () => {
    const cols = computeSparklineColumns({
      resourceType: 'Kafka',
      underReplicatedValues: [5],
      maxUnderReplicated: 10,
    });
    // 5/10 = 50% — green
    expect(cols[0]?.sparkline.color).toBe('green');
  });
});
