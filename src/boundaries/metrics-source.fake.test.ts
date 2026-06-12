import { describe, it, expect } from 'vitest';
import { FakeMetricsSource } from './metrics-source.fake.js';

const range = { startMs: 0, endMs: 1000, stepSeconds: 30 };

describe('FakeMetricsSource', () => {
  it('returns seeded instant samples and empty for unseeded queries', async () => {
    const m = new FakeMetricsSource();
    m.setInstant('up', [{ labels: {}, value: 1, timestampMs: 0 }]);
    expect((await m.query('up')).ok).toBe(true);
    const hit = await m.query('up');
    expect(hit.ok && hit.value).toHaveLength(1);
    const miss = await m.query('down');
    expect(miss.ok && miss.value).toEqual([]);
  });

  it('returns seeded range series and empty otherwise', async () => {
    const m = new FakeMetricsSource();
    m.setRange('rate(x[5m])', [{ labels: {}, points: [] }]);
    const hit = await m.queryRange('rate(x[5m])', range);
    expect(hit.ok && hit.value).toHaveLength(1);
    const miss = await m.queryRange('other', range);
    expect(miss.ok && miss.value).toEqual([]);
  });

  it('probes for known metric families', async () => {
    const m = new FakeMetricsSource();
    m.setKnownSeries('kafka_consumergroup_lag');
    expect((await m.probeSeries('kafka_consumergroup_lag')).ok).toBe(true);
    const known = await m.probeSeries('kafka_consumergroup_lag');
    expect(known.ok && known.value).toBe(true);
    const unknown = await m.probeSeries('nope');
    expect(unknown.ok && unknown.value).toBe(false);
  });

  it('reports unreachable on every method when degraded', async () => {
    const m = new FakeMetricsSource();
    m.setReachable(false);
    const q = await m.query('up');
    const r = await m.queryRange('up', range);
    const p = await m.probeSeries('up');
    expect(!q.ok && q.error.kind).toBe('unreachable');
    expect(!r.ok && r.error.kind).toBe('unreachable');
    expect(!p.ok && p.error.kind).toBe('unreachable');
  });
});
