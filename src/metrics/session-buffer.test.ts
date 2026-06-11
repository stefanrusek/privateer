/**
 * Unit tests for SessionBuffer — rolling 40-sample buffer for metrics-server
 * fallback sparklines (Spec 06 §2.3).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { SessionBuffer, MAX_SAMPLES } from './session-buffer.js';
import type { ResourceKey, MetricsSample } from './session-buffer.js';

function sample(offsetMs: number): MetricsSample {
  return {
    timestampMs: 1_000_000 + offsetMs,
    cpuMillicores: 100 + offsetMs,
    memoryBytes: 1024 * 1024 + offsetMs,
  };
}

const POD_A: ResourceKey = { kind: 'Pod', namespace: 'default', name: 'pod-a' };
const POD_B: ResourceKey = {
  kind: 'Pod',
  namespace: 'kube-system',
  name: 'pod-b',
};
const NODE_A: ResourceKey = { kind: 'Node', namespace: null, name: 'node-1' };

describe('SessionBuffer', () => {
  let buf: SessionBuffer;

  beforeEach(() => {
    buf = new SessionBuffer();
  });

  // -------------------------------------------------------------------------
  // Basic push / get
  // -------------------------------------------------------------------------

  it('starts empty', () => {
    expect(buf.resourceCount).toBe(0);
    expect(buf.totalSamples).toBe(0);
  });

  it('stores a single sample', () => {
    buf.push(POD_A, sample(0));
    expect(buf.getSamples(POD_A)).toHaveLength(1);
  });

  it('returns empty array for unknown key', () => {
    expect(buf.getSamples(POD_A)).toHaveLength(0);
  });

  it('stores multiple samples in chronological order', () => {
    buf.push(POD_A, sample(0));
    buf.push(POD_A, sample(1000));
    buf.push(POD_A, sample(2000));
    const samples = buf.getSamples(POD_A);
    expect(samples).toHaveLength(3);
    expect(samples[0]?.timestampMs).toBe(1_000_000);
    expect(samples[1]?.timestampMs).toBe(1_001_000);
    expect(samples[2]?.timestampMs).toBe(1_002_000);
  });

  it('tracks separate buffers per resource key', () => {
    buf.push(POD_A, sample(0));
    buf.push(POD_B, sample(0));
    buf.push(POD_B, sample(1000));
    expect(buf.getSamples(POD_A)).toHaveLength(1);
    expect(buf.getSamples(POD_B)).toHaveLength(2);
    expect(buf.resourceCount).toBe(2);
  });

  it('distinguishes Node from Pod with same name', () => {
    const podKey: ResourceKey = {
      kind: 'Pod',
      namespace: null,
      name: 'node-1',
    };
    buf.push(NODE_A, sample(0));
    buf.push(podKey, sample(1000));
    expect(buf.getSamples(NODE_A)).toHaveLength(1);
    expect(buf.getSamples(podKey)).toHaveLength(1);
  });

  it('distinguishes pods across namespaces', () => {
    buf.push(POD_A, sample(0));
    buf.push(POD_B, sample(0));
    expect(buf.resourceCount).toBe(2);
  });

  // -------------------------------------------------------------------------
  // Rolling window — MAX_SAMPLES = 40
  // -------------------------------------------------------------------------

  it('MAX_SAMPLES constant is 40', () => {
    expect(MAX_SAMPLES).toBe(40);
  });

  it('drops oldest sample when buffer exceeds 40', () => {
    for (let i = 0; i < MAX_SAMPLES + 1; i++) {
      buf.push(POD_A, sample(i * 1000));
    }
    const samples = buf.getSamples(POD_A);
    expect(samples).toHaveLength(MAX_SAMPLES);
    // Oldest (i=0) should be gone; first sample should be i=1
    expect(samples[0]?.timestampMs).toBe(1_001_000);
  });

  it('keeps exactly MAX_SAMPLES after filling to capacity', () => {
    for (let i = 0; i < MAX_SAMPLES * 2; i++) {
      buf.push(POD_A, sample(i * 1000));
    }
    expect(buf.getSamples(POD_A)).toHaveLength(MAX_SAMPLES);
  });

  it('most recent sample is last in the array', () => {
    for (let i = 0; i < MAX_SAMPLES + 5; i++) {
      buf.push(POD_A, sample(i * 1000));
    }
    const samples = buf.getSamples(POD_A);
    expect(samples[MAX_SAMPLES - 1]?.timestampMs).toBe(
      1_000_000 + (MAX_SAMPLES + 4) * 1000,
    );
  });

  // -------------------------------------------------------------------------
  // latest()
  // -------------------------------------------------------------------------

  it('latest() returns undefined for unknown key', () => {
    expect(buf.latest(POD_A)).toBeUndefined();
  });

  it('latest() returns the most recent sample', () => {
    buf.push(POD_A, sample(0));
    buf.push(POD_A, sample(1000));
    buf.push(POD_A, sample(2000));
    expect(buf.latest(POD_A)?.timestampMs).toBe(1_002_000);
  });

  // -------------------------------------------------------------------------
  // evict()
  // -------------------------------------------------------------------------

  it('evict() removes all samples for a resource', () => {
    buf.push(POD_A, sample(0));
    buf.push(POD_A, sample(1000));
    buf.evict(POD_A);
    expect(buf.getSamples(POD_A)).toHaveLength(0);
    expect(buf.resourceCount).toBe(0);
  });

  it('evict() is safe when key not present', () => {
    expect(() => {
      buf.evict(POD_A);
    }).not.toThrow();
  });

  it('evict() does not affect other resources', () => {
    buf.push(POD_A, sample(0));
    buf.push(POD_B, sample(0));
    buf.evict(POD_A);
    expect(buf.getSamples(POD_B)).toHaveLength(1);
    expect(buf.resourceCount).toBe(1);
  });

  // -------------------------------------------------------------------------
  // totalSamples
  // -------------------------------------------------------------------------

  it('totalSamples counts across all resources', () => {
    buf.push(POD_A, sample(0));
    buf.push(POD_A, sample(1000));
    buf.push(POD_B, sample(0));
    buf.push(NODE_A, sample(0));
    expect(buf.totalSamples).toBe(4);
  });

  it('totalSamples respects rolling window cap', () => {
    for (let i = 0; i < MAX_SAMPLES + 10; i++) {
      buf.push(POD_A, sample(i * 1000));
    }
    expect(buf.totalSamples).toBe(MAX_SAMPLES);
  });
});
