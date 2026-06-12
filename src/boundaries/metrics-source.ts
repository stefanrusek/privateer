import type { Result } from '../core/result.js';

/**
 * MetricsSource boundary (Spec 01 §3.4, Spec 06 §2). Abstracts Prometheus
 * (full history) and the metrics-server fallback (current values only). The
 * production adapter speaks the Prometheus HTTP API; `FakePrometheus` serves
 * canned series.
 */
export interface MetricsSource {
  /** Instant query — a single value per series at `now` (Spec 06). */
  query(promql: string): Promise<Result<MetricSample[], MetricsError>>;

  /** Range query — a time series per matching series. */
  queryRange(
    promql: string,
    range: TimeRange,
  ): Promise<Result<MetricSeries[], MetricsError>>;

  /**
   * Probe whether a metric family exists, via /api/v1/series (Spec 06 §2.2.1).
   * Drives per-exporter chart gating.
   */
  probeSeries(metricName: string): Promise<Result<boolean, MetricsError>>;
}

export interface TimeRange {
  /** Epoch ms (inclusive). */
  startMs: number;
  /** Epoch ms (inclusive). */
  endMs: number;
  /** Step in seconds. */
  stepSeconds: number;
}

export interface MetricSample {
  labels: Record<string, string>;
  value: number;
  /** Epoch ms of the sample. */
  timestampMs: number;
}

export interface MetricSeries {
  labels: Record<string, string>;
  points: MetricPoint[];
}

export interface MetricPoint {
  timestampMs: number;
  value: number;
}

export interface MetricsError {
  kind: 'unreachable' | 'queryError' | 'timeout';
  message: string;
}
