/**
 * Metrics source discovery cascade (Spec 06 §2.2, Spec 01 §5).
 *
 * Attempts in order:
 *   1. Config override (prometheus.url in ~/.config/p9r/config.yaml)
 *   2. PROMETHEUS_URL env var
 *   3. ServiceMonitor CRD scan via KubeClient
 *   4. Service scan (any namespace) — known operator/helm labels, then
 *      name match (prometheus/prometheus-server/prometheus-operated), then
 *      any Service with port 9090 (or a port named http/web/http-web on a
 *      prometheus-named Service). Ties broken by namespace order
 *      (monitoring, default, rest, alphabetically).
 *   5. Standard namespace probe (prometheus-operated, prometheus, prometheus-server
 *      in the `monitoring` namespace, by DNS name rather than a live list)
 *   6. Pod annotation scan (prometheus.io/scrape: "true")
 *   7. metrics-server fallback
 *   8. none
 *
 * Every candidate URL is probed with MetricsSource#probeSeries before it is
 * declared connected — this hits Prometheus's `/api/v1/series` endpoint and
 * requires a genuine `{"status":"success"}` JSON body, which rejects
 * non-Prometheus services that merely happen to be named/ported like one
 * (mitigates the false-positive risk called out in P9R-0008).
 *
 * Boundaries consumed:
 *   - ConfigStore  — read prometheus.url config override
 *   - KubeClient   — ServiceMonitor list, Service list + pod annotation scan
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
  | 'service-scan'
  | 'namespace-probe'
  | 'pod-annotation'
  | 'metrics-server'
  | 'none';

export interface DiscoveryResult {
  readonly tier: MetricsTier;
  readonly url: string | null;
  readonly sourceLabel: DiscoverySourceLabel;
}

/**
 * Human-readable description of everything discovery looked for, surfaced by
 * the "No Prometheus found" dashboard warning (OBS-010) so users can tell
 * why their setup wasn't matched.
 */
export const DISCOVERY_SEARCH_DESCRIPTION =
  'config override, PROMETHEUS_URL, ServiceMonitor CRDs, a Service named ' +
  'prometheus/prometheus-server/prometheus-operated or exposing port 9090 ' +
  '(any namespace), the standard prometheus-operated/prometheus/' +
  'prometheus-server.monitoring hostnames, and pod prometheus.io/scrape ' +
  'annotations';

/** Known Prometheus operator/Helm chart label selectors (preference tier 1). */
const KNOWN_PROMETHEUS_LABELS: readonly [key: string, value: string][] = [
  ['app.kubernetes.io/name', 'prometheus'],
  ['app.kubernetes.io/managed-by', 'prometheus-operator'],
  ['operated-prometheus', 'true'],
  ['app', 'prometheus'],
];

/** Service names recognized as Prometheus (preference tier 2). */
const KNOWN_PROMETHEUS_NAMES: ReadonlySet<string> = new Set([
  'prometheus',
  'prometheus-server',
  'prometheus-operated',
]);

/** Port names accepted on a prometheus-named Service (Spec: P9R-0008). */
const KNOWN_HTTP_PORT_NAMES: ReadonlySet<string> = new Set([
  'http',
  'web',
  'http-web',
]);

/** Namespace preference order for tie-breaking (P9R-0008). */
const NAMESPACE_PREFERENCE: readonly string[] = ['monitoring', 'default'];

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

  // 4. Service scan (any namespace): known labels, then name match, then port 9090
  const serviceResult = await tryServiceScan(deps);
  if (serviceResult !== null) {
    return serviceResult;
  }

  // 5. Standard namespace probe
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

  // 6. Pod annotation scan
  const podResult = await tryPodAnnotationScan(deps);
  if (podResult !== null) {
    return podResult;
  }

  // 7. metrics-server fallback
  const msProbe = await deps.metricsServerSource.probeSeries('up');
  if (msProbe.ok) {
    return { tier: 'metrics-server', url: null, sourceLabel: 'metrics-server' };
  }

  // 8. None
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

interface ServicePort {
  readonly port: number;
  readonly name: string | null;
}

interface ServiceCandidate {
  readonly name: string;
  readonly namespace: string;
  readonly rank: 1 | 2 | 3;
  readonly url: string;
}

function getServicePorts(item: KubernetesObject): ServicePort[] {
  const spec = item.spec;
  const rawPorts = spec?.ports;
  if (!Array.isArray(rawPorts)) {
    return [];
  }
  const ports: ServicePort[] = [];
  for (const rawPort of rawPorts) {
    if (!isPlainObject(rawPort)) {
      continue;
    }
    const port = rawPort.port;
    if (typeof port !== 'number') {
      continue;
    }
    const name = typeof rawPort.name === 'string' ? rawPort.name : null;
    ports.push({ port, name });
  }
  return ports;
}

function hasKnownPrometheusLabel(item: KubernetesObject): boolean {
  const labels = item.metadata?.labels;
  if (labels === undefined) {
    return false;
  }
  return KNOWN_PROMETHEUS_LABELS.some(([key, value]) => labels[key] === value);
}

/**
 * Classify a Service as a Prometheus candidate per P9R-0008's preference
 * order, or return null if it doesn't match any of the search criteria.
 * Rank 1 = known operator/helm labels, 2 = name match, 3 = port 9090 (or a
 * named http-ish port on a prometheus-named service).
 */
function classifyServiceCandidate(
  item: KubernetesObject,
): ServiceCandidate | null {
  const name = item.metadata?.name;
  const namespace = item.metadata?.namespace;
  if (typeof name !== 'string' || typeof namespace !== 'string') {
    return null;
  }
  const ports = getServicePorts(item);
  const nameMatches = KNOWN_PROMETHEUS_NAMES.has(name);
  const port9090 = ports.find((p) => p.port === 9090);
  const namedHttpPort = ports.find(
    (p) => p.name !== null && KNOWN_HTTP_PORT_NAMES.has(p.name),
  );

  let rank: 1 | 2 | 3;
  let chosenPort: number;
  if (hasKnownPrometheusLabel(item)) {
    rank = 1;
    chosenPort =
      port9090?.port ?? namedHttpPort?.port ?? ports[0]?.port ?? 9090;
  } else if (nameMatches) {
    rank = 2;
    chosenPort =
      port9090?.port ?? namedHttpPort?.port ?? ports[0]?.port ?? 9090;
  } else if (port9090 !== undefined) {
    rank = 3;
    chosenPort = port9090.port;
  } else if (name.includes('prometheus') && namedHttpPort !== undefined) {
    rank = 3;
    chosenPort = namedHttpPort.port;
  } else {
    return null;
  }

  return {
    name,
    namespace,
    rank,
    url: `http://${name}.${namespace}:${String(chosenPort)}`,
  };
}

function namespaceRank(namespace: string): number {
  const idx = NAMESPACE_PREFERENCE.indexOf(namespace);
  return idx === -1 ? NAMESPACE_PREFERENCE.length : idx;
}

/**
 * Rank candidates by preference tier, then namespace order (monitoring,
 * default, rest — alphabetical within "rest"), then name for determinism.
 */
function compareCandidates(a: ServiceCandidate, b: ServiceCandidate): number {
  if (a.rank !== b.rank) {
    return a.rank - b.rank;
  }
  const nsCompare = namespaceRank(a.namespace) - namespaceRank(b.namespace);
  if (nsCompare !== 0) {
    return nsCompare;
  }
  if (a.namespace !== b.namespace) {
    return a.namespace < b.namespace ? -1 : 1;
  }
  // Two Services can never share (namespace, name), so once the namespaces
  // match, the names are guaranteed distinct.
  return a.name < b.name ? -1 : 1;
}

/**
 * Scan Services across all namespaces for a Prometheus candidate (P9R-0008):
 * known operator/helm labels first, then a recognized name, then any Service
 * exposing port 9090 (or a named http-ish port on a prometheus-named
 * Service). Each candidate is probed in preference order and the first
 * reachable one wins — this avoids false positives from same-named but
 * unrelated services.
 */
async function tryServiceScan(
  deps: DiscoveryDeps,
): Promise<DiscoveryResult | null> {
  const listResult = await deps.kubeClient.list('Service', {});
  if (!listResult.ok) {
    return null;
  }
  const candidates = listResult.value.items
    .map(classifyServiceCandidate)
    .filter((c): c is ServiceCandidate => c !== null)
    .sort(compareCandidates);

  for (const candidate of candidates) {
    const source = deps.makeSource(candidate.url);
    const probeResult = await source.probeSeries('up');
    if (probeResult.ok) {
      return {
        tier: 'prometheus',
        url: candidate.url,
        sourceLabel: 'service-scan',
      };
    }
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
