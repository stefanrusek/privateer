import { type Result, ok, err } from '../core/result.js';
import type {
  MetricsSource,
  MetricsError,
  MetricSample,
  MetricSeries,
  TimeRange,
} from './metrics-source.js';

/**
 * In-memory MetricsSource for tests — the unit-test stand-in for the in-process
 * `FakePrometheus` HTTP server. Series are seeded by query string; `probeSeries`
 * is driven by the set of known metric families.
 */
export class FakeMetricsSource implements MetricsSource {
  private instant = new Map<string, MetricSample[]>();
  private ranges = new Map<string, MetricSeries[]>();
  private knownSeries = new Set<string>();
  private reachable = true;

  query(promql: string): Promise<Result<MetricSample[], MetricsError>> {
    if (!this.reachable) {
      return Promise.resolve(err(this.unreachable()));
    }
    return Promise.resolve(ok(this.instant.get(promql) ?? []));
  }

  queryRange(
    promql: string,
    // Range bounds are honored by the real adapter; the fake serves whatever
    // series were seeded for `promql` regardless of window.
    _range: TimeRange,
  ): Promise<Result<MetricSeries[], MetricsError>> {
    if (!this.reachable) {
      return Promise.resolve(err(this.unreachable()));
    }
    return Promise.resolve(ok(this.ranges.get(promql) ?? []));
  }

  probeSeries(metricName: string): Promise<Result<boolean, MetricsError>> {
    if (!this.reachable) {
      return Promise.resolve(err(this.unreachable()));
    }
    return Promise.resolve(ok(this.knownSeries.has(metricName)));
  }

  // ---- test-driving helpers -------------------------------------------------

  setInstant(promql: string, samples: MetricSample[]): void {
    this.instant.set(promql, samples);
  }

  setRange(promql: string, series: MetricSeries[]): void {
    this.ranges.set(promql, series);
  }

  setKnownSeries(...metricNames: string[]): void {
    for (const name of metricNames) {
      this.knownSeries.add(name);
    }
  }

  setReachable(reachable: boolean): void {
    this.reachable = reachable;
  }

  private unreachable(): MetricsError {
    return { kind: 'unreachable', message: 'prometheus unreachable' };
  }
}
