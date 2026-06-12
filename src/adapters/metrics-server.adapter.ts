/**
 * metrics-server adapter (Spec 06 §2.3) — reads current pod/node usage from
 * the metrics.k8s.io API over the same node:https plumbing as the kube
 * client. Implements the MetricsSource boundary only far enough for the
 * discovery cascade's reachability probe; PromQL queries are not supported at
 * this tier (the controller accumulates a session buffer instead).
 */

import https from 'node:https';
import type { KubeConfig } from '@kubernetes/client-node';
import type {
  MetricsSource,
  MetricSample,
  MetricSeries,
  MetricsError,
  TimeRange,
} from '../boundaries/metrics-source.js';
import { ok, err, type Result } from '../core/result.js';
import { buildKubeRequestOptions } from './kube-client.adapter.js';

/** Parsed current usage for one pod or node. */
export interface UsageSample {
  name: string;
  namespace: string | null;
  cpuMillicores: number;
  memoryBytes: number;
}

/** Parse a Kubernetes CPU quantity ("123m", "1", "12345678n") to millicores. */
export function parseCpuMillicores(quantity: string): number {
  if (quantity.endsWith('n')) {
    return Number(quantity.slice(0, -1)) / 1_000_000;
  }
  if (quantity.endsWith('u')) {
    return Number(quantity.slice(0, -1)) / 1_000;
  }
  if (quantity.endsWith('m')) {
    return Number(quantity.slice(0, -1));
  }
  return Number(quantity) * 1000;
}

/** Parse a Kubernetes memory quantity ("123Mi", "1Gi", "12345") to bytes. */
export function parseMemoryBytes(quantity: string): number {
  const suffixes: Record<string, number> = {
    Ki: 1024,
    Mi: 1024 ** 2,
    Gi: 1024 ** 3,
    Ti: 1024 ** 4,
    k: 1000,
    M: 1000 ** 2,
    G: 1000 ** 3,
    T: 1000 ** 4,
  };
  for (const [suffix, mult] of Object.entries(suffixes)) {
    if (quantity.endsWith(suffix)) {
      return Number(quantity.slice(0, -suffix.length)) * mult;
    }
  }
  return Number(quantity);
}

interface MetricsItem {
  metadata?: { name?: string; namespace?: string };
  usage?: { cpu?: string; memory?: string };
  containers?: { usage?: { cpu?: string; memory?: string } }[];
}

export class MetricsServerAdapter implements MetricsSource {
  constructor(private readonly kc: KubeConfig) {}

  private async getJson(
    path: string,
  ): Promise<Result<{ items?: MetricsItem[] }, MetricsError>> {
    try {
      const server = this.kc.getCurrentCluster()?.server ?? '';
      const reqOpts = await buildKubeRequestOptions(
        this.kc,
        'GET',
        `${server}${path}`,
      );
      const body = await new Promise<{ status: number; text: string }>(
        (resolve, reject) => {
          const req = https.request(reqOpts, (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (c: Buffer) => chunks.push(c));
            res.on('end', () => {
              resolve({
                status: res.statusCode ?? 0,
                text: Buffer.concat(chunks).toString(),
              });
            });
            res.on('error', reject);
          });
          req.on('error', reject);
          req.end();
        },
      );
      if (body.status < 200 || body.status >= 300) {
        return err({
          kind: 'unreachable',
          message: `metrics.k8s.io returned ${String(body.status)}`,
        });
      }
      return ok(JSON.parse(body.text) as { items?: MetricsItem[] });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return err({ kind: 'unreachable', message });
    }
  }

  /** Current usage for all pods (cluster-wide). */
  async fetchPodUsage(): Promise<Result<UsageSample[], MetricsError>> {
    const result = await this.getJson('/apis/metrics.k8s.io/v1beta1/pods');
    if (!result.ok) {
      return result;
    }
    const samples: UsageSample[] = (result.value.items ?? []).map((item) => {
      let cpu = 0;
      let memory = 0;
      for (const container of item.containers ?? []) {
        cpu += parseCpuMillicores(container.usage?.cpu ?? '0');
        memory += parseMemoryBytes(container.usage?.memory ?? '0');
      }
      return {
        name: item.metadata?.name ?? '',
        namespace: item.metadata?.namespace ?? null,
        cpuMillicores: cpu,
        memoryBytes: memory,
      };
    });
    return ok(samples);
  }

  /** Current usage for all nodes. */
  async fetchNodeUsage(): Promise<Result<UsageSample[], MetricsError>> {
    const result = await this.getJson('/apis/metrics.k8s.io/v1beta1/nodes');
    if (!result.ok) {
      return result;
    }
    const samples: UsageSample[] = (result.value.items ?? []).map((item) => ({
      name: item.metadata?.name ?? '',
      namespace: null,
      cpuMillicores: parseCpuMillicores(item.usage?.cpu ?? '0'),
      memoryBytes: parseMemoryBytes(item.usage?.memory ?? '0'),
    }));
    return ok(samples);
  }

  // -------------------------------------------------------------------------
  // MetricsSource boundary — only the reachability probe is meaningful here.
  // -------------------------------------------------------------------------

  async probeSeries(
    _metricName: string,
  ): Promise<Result<boolean, MetricsError>> {
    const result = await this.getJson('/apis/metrics.k8s.io/v1beta1/nodes');
    if (!result.ok) {
      return result;
    }
    return ok(true);
  }

  query(_promql: string): Promise<Result<MetricSample[], MetricsError>> {
    return Promise.resolve(
      err({
        kind: 'queryError',
        message: 'metrics-server tier does not support PromQL queries',
      }),
    );
  }

  queryRange(
    _promql: string,
    _range: TimeRange,
  ): Promise<Result<MetricSeries[], MetricsError>> {
    return Promise.resolve(
      err({
        kind: 'queryError',
        message: 'metrics-server tier does not support PromQL queries',
      }),
    );
  }
}
