/**
 * Session buffer for metrics-server fallback (Spec 06 §2.3).
 *
 * When only metrics-server is available, Privateer accumulates its own rolling
 * sample buffer — last 40 samples per visible pod/node — from regular polling.
 * This powers session-data sparklines in list views and a session-bounded
 * chart (up to ~20 min of history at 30s) clearly labeled "session data".
 *
 * Historical ranges (1h, 4h, 1d, 2d) remain Prometheus-only and are disabled
 * in the range selector when session-buffer is the active source.
 */

/** Maximum samples retained per resource key (Spec 06 §2.3). */
export const MAX_SAMPLES = 40;

export interface MetricsSample {
  /** Epoch ms when the sample was taken. */
  readonly timestampMs: number;
  /** CPU in millicores. */
  readonly cpuMillicores: number;
  /** Memory in bytes. */
  readonly memoryBytes: number;
}

/** Identifies a specific resource in the buffer. */
export interface ResourceKey {
  readonly kind: 'Pod' | 'Node';
  readonly namespace: string | null;
  readonly name: string;
}

function keyString(key: ResourceKey): string {
  return `${key.kind}/${key.namespace ?? '~'}/${key.name}`;
}

/**
 * In-memory rolling buffer of the last 40 samples per pod/node.
 * Thread-safe for single-process (Bun) use — all operations are synchronous.
 */
export class SessionBuffer {
  private readonly buffers = new Map<string, MetricsSample[]>();

  /**
   * Record a new sample for a resource. If the buffer is already at capacity,
   * the oldest sample is dropped.
   */
  push(key: ResourceKey, sample: MetricsSample): void {
    const k = keyString(key);
    const existing = this.buffers.get(k);
    if (existing === undefined) {
      this.buffers.set(k, [sample]);
      return;
    }
    existing.push(sample);
    if (existing.length > MAX_SAMPLES) {
      existing.shift();
    }
  }

  /**
   * Return all samples for `key` in chronological order (oldest first).
   * Returns an empty array if no samples have been recorded.
   */
  getSamples(key: ResourceKey): readonly MetricsSample[] {
    return this.buffers.get(keyString(key)) ?? [];
  }

  /**
   * Return the most recent sample for `key`, or undefined if none.
   */
  latest(key: ResourceKey): MetricsSample | undefined {
    const samples = this.buffers.get(keyString(key));
    if (samples === undefined || samples.length === 0) {
      return undefined;
    }
    return samples[samples.length - 1];
  }

  /**
   * Remove a resource from the buffer (e.g. when a pod is deleted or goes
   * off-screen and we want to reclaim memory).
   */
  evict(key: ResourceKey): void {
    this.buffers.delete(keyString(key));
  }

  /** Number of distinct resources currently tracked. */
  get resourceCount(): number {
    return this.buffers.size;
  }

  /** Total sample count across all resources. */
  get totalSamples(): number {
    let total = 0;
    for (const samples of this.buffers.values()) {
      total += samples.length;
    }
    return total;
  }
}
