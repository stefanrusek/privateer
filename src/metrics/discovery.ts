/**
 * Metrics source discovery cascade (Spec 06 §2.2, Spec 01 §5).
 *
 * Attempts in order:
 *   1. Config override (prometheus.url in ~/.config/p9r/config.yaml)
 *   2. PROMETHEUS_URL env var
 *   3. ServiceMonitor CRD scan via KubeClient
 *   4. Standard namespace probe (prometheus-operated, prometheus, prometheus-server)
 *   5. Pod annotation scan (prometheus.io/scrape: "true")
 *   6. metrics-server fallback
 *   7. none
 *
 * Boundaries consumed:
 *   - ConfigStore  — read prometheus.url config override
 *   - KubeClient   — ServiceMonitor list + pod annotation scan
 *   - MetricsSource — probe reachability of candidate URLs
 */
import type { MetricsSource } from '../boundaries/metrics-source.js';
import type { KubeClient } from '../boundaries/kube-client.js';
import type { KubernetesObject } from '../core/types.js';
import type { ConfigStore } from '../boundaries/config-store.js';

export type MetricsTier = 'prometheus' | 'metrics-server' | 'none';

export type DiscoverySourceLabel =
  | 'config'
  | 'env'
  | 'servicemonitor'
  | 'namespace-probe'
  | 'pod-annotation'
  | 'metrics-server'
  | 'none';

export interface DiscoveryResult {
  readonly tier: MetricsTier;
  readonly url: string | null;
  readonly sourceLabel: DiscoverySourceLabel;
}

/** Standard Prometheus service URLs to probe in order (Spec 01 §5). */
const STANDARD_PROBE_URLS: readonly string[] = [
  'http://prometheus-operated.monitoring:9090',
  'http://prometheus.monitoring:9090',
  'http://prometheus-server.monitoring:9090',
];

/**
 * Dependencies injected into the discovery cascade. `env` is a map of
 * environment variable overrides (defaults to `process.env`-style lookup).
 */
export interface DiscoveryDeps {
  readonly configStore: ConfigStore;
  readonly kubeClient: KubeClient;
  /** Factory: given a base URL, returns a MetricsSource that probes it. */
  readonly makeSource: (url: string) => MetricsSource;
  /** Metrics-server MetricsSource (for fallback reachability check). */
  readonly metricsServerSource: MetricsSource;
  /** Environment variable lookup — injectable for tests. */
  readonly getEnv: (name: string) => string | undefined;
}

/** Narrow an unknown config value to a plain object (not array, not null). */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Run the full discovery cascade and return the first successful result.
 * Re-run on every context switch (callers are responsible for re-calling).
 */
export async function discoverMetricsSource(
  deps: DiscoveryDeps,
): Promise<DiscoveryResult> {
  // 1. Config override
  const configResult = await deps.configStore.load();
  if (configResult.ok) {
    const prometheusConfig = configResult.value.prometheus;
    if (isPlainObject(prometheusConfig)) {
      const configUrl = prometheusConfig.url;
      if (typeof configUrl === 'string' && configUrl.length > 0) {
        return { tier: 'prometheus', url: configUrl, sourceLabel: 'config' };
      }
    }
  }

  // 2. PROMETHEUS_URL env var
  const envUrl = deps.getEnv('PROMETHEUS_URL');
  if (envUrl !== undefined && envUrl.length > 0) {
    return { tier: 'prometheus', url: envUrl, sourceLabel: 'env' };
  }

  // 3. ServiceMonitor CRD scan
  const smResult = await tryServiceMonitorScan(deps);
  if (smResult !== null) {
    return smResult;
  }

  // 4. Standard namespace probe
  for (const probeUrl of STANDARD_PROBE_URLS) {
    const source = deps.makeSource(probeUrl);
    const probeResult = await source.probeSeries('up');
    if (probeResult.ok) {
      return {
        tier: 'prometheus',
        url: probeUrl,
        sourceLabel: 'namespace-probe',
      };
    }
  }

  // 5. Pod annotation scan
  const podResult = await tryPodAnnotationScan(deps);
  if (podResult !== null) {
    return podResult;
  }

  // 6. metrics-server fallback
  const msProbe = await deps.metricsServerSource.probeSeries('up');
  if (msProbe.ok) {
    return { tier: 'metrics-server', url: null, sourceLabel: 'metrics-server' };
  }

  // 7. None
  return { tier: 'none', url: null, sourceLabel: 'none' };
}

async function tryServiceMonitorScan(
  deps: DiscoveryDeps,
): Promise<DiscoveryResult | null> {
  const listResult = await deps.kubeClient.list('ServiceMonitor', {});
  if (!listResult.ok) {
    return null;
  }
  for (const item of listResult.value.items) {
    const url = extractServiceMonitorUrl(item);
    if (url !== null) {
      return { tier: 'prometheus', url, sourceLabel: 'servicemonitor' };
    }
  }
  return null;
}

function extractServiceMonitorUrl(item: KubernetesObject): string | null {
  const spec = item.spec;
  if (spec === undefined) {
    return null;
  }
  const endpoints = spec.endpoints;
  if (!Array.isArray(endpoints) || endpoints.length === 0) {
    return null;
  }
  const first: unknown = endpoints[0];
  if (!isPlainObject(first)) {
    return null;
  }
  const targetUrl = first.targetUrl;
  if (typeof targetUrl === 'string' && targetUrl.length > 0) {
    return targetUrl;
  }
  return null;
}

async function tryPodAnnotationScan(
  deps: DiscoveryDeps,
): Promise<DiscoveryResult | null> {
  const listResult = await deps.kubeClient.list('Pod', {});
  if (!listResult.ok) {
    return null;
  }
  for (const item of listResult.value.items) {
    const annotations = item.metadata?.annotations;
    if (annotations === undefined) {
      continue;
    }
    if (annotations['prometheus.io/scrape'] !== 'true') {
      continue;
    }
    const portAnnotation = annotations['prometheus.io/port'];
    const pathAnnotation = annotations['prometheus.io/path'];
    const ip = item.status?.podIP;
    if (typeof ip !== 'string' || ip.length === 0) {
      continue;
    }
    const port = portAnnotation ?? '9090';
    const path = pathAnnotation ?? '/metrics';
    const url = `http://${ip}:${port}${path}`;
    return { tier: 'prometheus', url, sourceLabel: 'pod-annotation' };
  }
  return null;
}
