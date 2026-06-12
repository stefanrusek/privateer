/**
 * Real Prometheus HTTP adapter implementing MetricsSource (Spec 06 §2,
 * Spec 01 §3.4). Thin fetch wrapper — all logic lives behind the boundary.
 *
 * Excluded from unit-test coverage (src/adapters/**) per vitest.config.ts;
 * exercised by the @envtest integration suite against a real cluster.
 */
import { type Result, ok, err } from '../core/result.js';
import type {
  MetricsSource,
  MetricSample,
  MetricSeries,
  MetricPoint,
  TimeRange,
  MetricsError,
} from '../boundaries/metrics-source.js';

interface PrometheusInstantResponse {
  status: string;
  data?: {
    resultType: string;
    result: {
      metric: Record<string, string>;
      value: [number, string];
    }[];
  };
  errorType?: string;
  error?: string;
}

interface PrometheusRangeResponse {
  status: string;
  data?: {
    resultType: string;
    result: {
      metric: Record<string, string>;
      values: [number, string][];
    }[];
  };
  errorType?: string;
  error?: string;
}

interface PrometheusSeriesResponse {
  status: string;
  data?: Record<string, string>[];
  errorType?: string;
  error?: string;
}

export class PrometheusHttpAdapter implements MetricsSource {
  constructor(private readonly baseUrl: string) {}

  async query(promql: string): Promise<Result<MetricSample[], MetricsError>> {
    const url = `${this.baseUrl}/api/v1/query?query=${encodeURIComponent(promql)}`;
    let response: Response;
    try {
      response = await fetch(url);
    } catch (e) {
      return err({
        kind: 'unreachable',
        message: e instanceof Error ? e.message : String(e),
      });
    }
    if (!response.ok) {
      return err({
        kind: 'queryError',
        message: `HTTP ${String(response.status)}`,
      });
    }
    const body = (await response.json()) as PrometheusInstantResponse;
    if (body.status !== 'success' || body.data === undefined) {
      return err({
        kind: 'queryError',
        message: body.error ?? 'unknown error',
      });
    }
    const samples: MetricSample[] = body.data.result.map((r) => ({
      labels: r.metric,
      value: parseFloat(r.value[1]),
      timestampMs: r.value[0] * 1000,
    }));
    return ok(samples);
  }

  async queryRange(
    promql: string,
    range: TimeRange,
  ): Promise<Result<MetricSeries[], MetricsError>> {
    const params = new URLSearchParams({
      query: promql,
      start: String(range.startMs / 1000),
      end: String(range.endMs / 1000),
      step: String(range.stepSeconds),
    });
    const url = `${this.baseUrl}/api/v1/query_range?${params.toString()}`;
    let response: Response;
    try {
      response = await fetch(url);
    } catch (e) {
      return err({
        kind: 'unreachable',
        message: e instanceof Error ? e.message : String(e),
      });
    }
    if (!response.ok) {
      return err({
        kind: 'queryError',
        message: `HTTP ${String(response.status)}`,
      });
    }
    const body = (await response.json()) as PrometheusRangeResponse;
    if (body.status !== 'success' || body.data === undefined) {
      return err({
        kind: 'queryError',
        message: body.error ?? 'unknown error',
      });
    }
    const series: MetricSeries[] = body.data.result.map((r) => ({
      labels: r.metric,
      points: r.values.map(
        ([ts, val]): MetricPoint => ({
          timestampMs: ts * 1000,
          value: parseFloat(val),
        }),
      ),
    }));
    return ok(series);
  }

  async probeSeries(
    metricName: string,
  ): Promise<Result<boolean, MetricsError>> {
    const url = `${this.baseUrl}/api/v1/series?${new URLSearchParams({ 'match[]': metricName }).toString()}`;
    let response: Response;
    try {
      response = await fetch(url);
    } catch (e) {
      return err({
        kind: 'unreachable',
        message: e instanceof Error ? e.message : String(e),
      });
    }
    if (!response.ok) {
      return err({
        kind: 'queryError',
        message: `HTTP ${String(response.status)}`,
      });
    }
    const body = (await response.json()) as PrometheusSeriesResponse;
    if (body.status !== 'success' || body.data === undefined) {
      return err({
        kind: 'queryError',
        message: body.error ?? 'unknown error',
      });
    }
    return ok(body.data.length > 0);
  }
}
