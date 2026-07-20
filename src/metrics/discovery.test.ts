/**
 * Unit tests for metrics source discovery cascade (Spec 06 §2.2, Spec 01 §5).
 * Covers all seven cascade branches and degrade paths.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { discoverMetricsSource } from './discovery.js';
import type { DiscoveryDeps } from './discovery.js';
import { FakeMetricsSource } from '../boundaries/metrics-source.fake.js';
import { FakeKubeClient } from '../boundaries/kube-client.fake.js';
import { InMemoryConfigStore } from '../boundaries/config-store.fake.js';
import type { KubernetesObject } from '../core/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePod(
  name: string,
  ip: string,
  annotations: Record<string, string>,
): KubernetesObject {
  return {
    kind: 'Pod',
    apiVersion: 'v1',
    metadata: { name, namespace: 'default', annotations },
    status: { podIP: ip },
  };
}

function makeServiceMonitor(name: string, targetUrl: string): KubernetesObject {
  return {
    kind: 'ServiceMonitor',
    apiVersion: 'monitoring.coreos.com/v1',
    metadata: { name, namespace: 'monitoring' },
    spec: {
      endpoints: [{ targetUrl }],
    },
  };
}

function makeService(
  name: string,
  namespace: string,
  options: {
    ports?: (Record<string, unknown> | null)[];
    labels?: Record<string, string>;
  } = {},
): KubernetesObject {
  return {
    kind: 'Service',
    apiVersion: 'v1',
    metadata: {
      name,
      namespace,
      ...(options.labels !== undefined ? { labels: options.labels } : {}),
    },
    spec: {
      ports: options.ports ?? [{ port: 9090 }],
    },
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('discoverMetricsSource', () => {
  let configStore: InMemoryConfigStore;
  let kubeClient: FakeKubeClient;
  let probeResults: Map<string, FakeMetricsSource>;
  let metricsServer: FakeMetricsSource;
  let envVars: Map<string, string>;

  function buildDeps(): DiscoveryDeps {
    return {
      configStore,
      kubeClient,
      makeSource: (url: string): FakeMetricsSource => {
        let source = probeResults.get(url);
        if (source === undefined) {
          source = new FakeMetricsSource();
          source.setReachable(false);
          probeResults.set(url, source);
        }
        return source;
      },
      metricsServerSource: metricsServer,
      getEnv: (name: string): string | undefined => envVars.get(name),
    };
  }

  beforeEach(() => {
    configStore = new InMemoryConfigStore();
    kubeClient = new FakeKubeClient();
    probeResults = new Map();
    metricsServer = new FakeMetricsSource();
    metricsServer.setReachable(true);
    envVars = new Map();
  });

  /** Mark a candidate URL as reachable (probeSeries().ok === true). */
  function markReachable(url: string): void {
    probeResults.set(url, new FakeMetricsSource());
  }

  // -------------------------------------------------------------------------
  // Tier 1: config override
  // -------------------------------------------------------------------------

  describe('tier 1: config override', () => {
    it('resolves with prometheus tier and config label', async () => {
      await configStore.save({ prometheus: { url: 'http://config:9090' } });
      const result = await discoverMetricsSource(buildDeps());
      expect(result.tier).toBe('prometheus');
      expect(result.url).toBe('http://config:9090');
      expect(result.sourceLabel).toBe('config');
    });

    it('takes priority over env var', async () => {
      await configStore.save({ prometheus: { url: 'http://config:9090' } });
      envVars.set('PROMETHEUS_URL', 'http://env:9090');
      const result = await discoverMetricsSource(buildDeps());
      expect(result.url).toBe('http://config:9090');
      expect(result.sourceLabel).toBe('config');
    });

    it('skips config when prometheus.url is missing', async () => {
      await configStore.save({ prometheus: {} });
      envVars.set('PROMETHEUS_URL', 'http://env:9090');
      const result = await discoverMetricsSource(buildDeps());
      expect(result.sourceLabel).toBe('env');
    });

    it('skips config when prometheus is not an object', async () => {
      await configStore.save({ prometheus: 'not-an-object' });
      envVars.set('PROMETHEUS_URL', 'http://env:9090');
      const result = await discoverMetricsSource(buildDeps());
      expect(result.sourceLabel).toBe('env');
    });

    it('skips config when prometheus is an array', async () => {
      await configStore.save({ prometheus: ['http://bad:9090'] });
      envVars.set('PROMETHEUS_URL', 'http://env:9090');
      const result = await discoverMetricsSource(buildDeps());
      expect(result.sourceLabel).toBe('env');
    });

    it('skips config when prometheus is null', async () => {
      await configStore.save({ prometheus: null });
      envVars.set('PROMETHEUS_URL', 'http://env:9090');
      const result = await discoverMetricsSource(buildDeps());
      expect(result.sourceLabel).toBe('env');
    });

    it('skips config when prometheus.url is empty string', async () => {
      await configStore.save({ prometheus: { url: '' } });
      envVars.set('PROMETHEUS_URL', 'http://env:9090');
      const result = await discoverMetricsSource(buildDeps());
      expect(result.sourceLabel).toBe('env');
    });

    it('skips config when config load fails', async () => {
      configStore.failNextLoad();
      envVars.set('PROMETHEUS_URL', 'http://env:9090');
      const result = await discoverMetricsSource(buildDeps());
      expect(result.sourceLabel).toBe('env');
    });
  });

  // -------------------------------------------------------------------------
  // Tier 2: env var
  // -------------------------------------------------------------------------

  describe('tier 2: PROMETHEUS_URL env var', () => {
    it('resolves with env label', async () => {
      envVars.set('PROMETHEUS_URL', 'http://env:9090');
      const result = await discoverMetricsSource(buildDeps());
      expect(result.tier).toBe('prometheus');
      expect(result.url).toBe('http://env:9090');
      expect(result.sourceLabel).toBe('env');
    });

    it('skips when env var is undefined', async () => {
      const result = await discoverMetricsSource(buildDeps());
      expect(result.sourceLabel).not.toBe('env');
    });

    it('skips when env var is empty string', async () => {
      envVars.set('PROMETHEUS_URL', '');
      const result = await discoverMetricsSource(buildDeps());
      expect(result.sourceLabel).not.toBe('env');
    });
  });

  // -------------------------------------------------------------------------
  // Tier 3: ServiceMonitor CRD scan
  // -------------------------------------------------------------------------

  describe('tier 3: ServiceMonitor scan', () => {
    it('resolves with servicemonitor label when ServiceMonitor has targetUrl', async () => {
      kubeClient.seed(makeServiceMonitor('prom-sm', 'http://sm:9090'));
      const result = await discoverMetricsSource(buildDeps());
      expect(result.tier).toBe('prometheus');
      expect(result.url).toBe('http://sm:9090');
      expect(result.sourceLabel).toBe('servicemonitor');
    });

    it('skips when list returns forbidden', async () => {
      kubeClient.forbid('ServiceMonitor');
      // metrics-server is reachable so it becomes the fallback
      const result = await discoverMetricsSource(buildDeps());
      expect(result.sourceLabel).toBe('metrics-server');
    });

    it('skips ServiceMonitor with no endpoints', async () => {
      kubeClient.seed({
        kind: 'ServiceMonitor',
        apiVersion: 'monitoring.coreos.com/v1',
        metadata: { name: 'empty', namespace: 'monitoring' },
        spec: { endpoints: [] },
      });
      const result = await discoverMetricsSource(buildDeps());
      // falls through to metrics-server
      expect(result.tier).toBe('metrics-server');
    });

    it('skips ServiceMonitor with no spec', async () => {
      kubeClient.seed({
        kind: 'ServiceMonitor',
        apiVersion: 'monitoring.coreos.com/v1',
        metadata: { name: 'nospec', namespace: 'monitoring' },
      });
      const result = await discoverMetricsSource(buildDeps());
      expect(result.tier).toBe('metrics-server');
    });

    it('skips ServiceMonitor with no spec', async () => {
      kubeClient.seed({
        kind: 'ServiceMonitor',
        apiVersion: 'monitoring.coreos.com/v1',
        metadata: { name: 'nospecb', namespace: 'monitoring' },
      });
      const result = await discoverMetricsSource(buildDeps());
      expect(result.tier).toBe('metrics-server');
    });

    it('skips ServiceMonitor with endpoint missing targetUrl', async () => {
      kubeClient.seed({
        kind: 'ServiceMonitor',
        apiVersion: 'monitoring.coreos.com/v1',
        metadata: { name: 'notarget', namespace: 'monitoring' },
        spec: { endpoints: [{ port: '9090' }] },
      });
      const result = await discoverMetricsSource(buildDeps());
      expect(result.tier).toBe('metrics-server');
    });

    it('skips ServiceMonitor with empty targetUrl', async () => {
      kubeClient.seed({
        kind: 'ServiceMonitor',
        apiVersion: 'monitoring.coreos.com/v1',
        metadata: { name: 'emptytarget', namespace: 'monitoring' },
        spec: { endpoints: [{ targetUrl: '' }] },
      });
      const result = await discoverMetricsSource(buildDeps());
      expect(result.tier).toBe('metrics-server');
    });

    it('skips ServiceMonitor with null first endpoint', async () => {
      kubeClient.seed({
        kind: 'ServiceMonitor',
        apiVersion: 'monitoring.coreos.com/v1',
        metadata: { name: 'nullep', namespace: 'monitoring' },
        spec: { endpoints: [null] },
      });
      const result = await discoverMetricsSource(buildDeps());
      expect(result.tier).toBe('metrics-server');
    });
  });

  // -------------------------------------------------------------------------
  // Tier 4: Service scan (P9R-0008)
  // -------------------------------------------------------------------------

  describe('tier 4: Service scan', () => {
    it('resolves a plain Service named "prometheus" with port 9090 (P9R-0008 repro)', async () => {
      kubeClient.seed(makeService('prometheus', 'default'));
      markReachable('http://prometheus.default:9090');
      const result = await discoverMetricsSource(buildDeps());
      expect(result.tier).toBe('prometheus');
      expect(result.url).toBe('http://prometheus.default:9090');
      expect(result.sourceLabel).toBe('service-scan');
    });

    it('matches prometheus-server and prometheus-operated by name', async () => {
      kubeClient.seed(makeService('prometheus-server', 'ns1'));
      markReachable('http://prometheus-server.ns1:9090');
      const result = await discoverMetricsSource(buildDeps());
      expect(result.url).toBe('http://prometheus-server.ns1:9090');
    });

    it('matches any Service exposing port 9090 regardless of name', async () => {
      kubeClient.seed(makeService('metrics-thing', 'apps'));
      markReachable('http://metrics-thing.apps:9090');
      const result = await discoverMetricsSource(buildDeps());
      expect(result.url).toBe('http://metrics-thing.apps:9090');
      expect(result.sourceLabel).toBe('service-scan');
    });

    it('matches a prometheus-named Service with a port named "http"', async () => {
      kubeClient.seed(
        makeService('my-prometheus', 'apps', {
          ports: [{ port: 8080, name: 'http' }],
        }),
      );
      markReachable('http://my-prometheus.apps:8080');
      const result = await discoverMetricsSource(buildDeps());
      expect(result.url).toBe('http://my-prometheus.apps:8080');
    });

    it('matches a prometheus-named Service with a port named "web"', async () => {
      kubeClient.seed(
        makeService('my-prometheus', 'apps', {
          ports: [{ port: 8081, name: 'web' }],
        }),
      );
      markReachable('http://my-prometheus.apps:8081');
      const result = await discoverMetricsSource(buildDeps());
      expect(result.url).toBe('http://my-prometheus.apps:8081');
    });

    it('matches a prometheus-named Service with a port named "http-web"', async () => {
      kubeClient.seed(
        makeService('my-prometheus', 'apps', {
          ports: [{ port: 8082, name: 'http-web' }],
        }),
      );
      markReachable('http://my-prometheus.apps:8082');
      const result = await discoverMetricsSource(buildDeps());
      expect(result.url).toBe('http://my-prometheus.apps:8082');
    });

    it('does not match a non-prometheus-named Service with a named http port but no 9090', async () => {
      kubeClient.seed(
        makeService('web-app', 'apps', {
          ports: [{ port: 8080, name: 'http' }],
        }),
      );
      const result = await discoverMetricsSource(buildDeps());
      expect(result.sourceLabel).toBe('metrics-server');
    });

    it('prefers known operator/helm labels over name and port matches', async () => {
      kubeClient.seed(makeService('port-only', 'zzz'));
      kubeClient.seed(makeService('prometheus', 'zzz'));
      kubeClient.seed(
        makeService('labeled-prom', 'zzz', {
          labels: { 'app.kubernetes.io/name': 'prometheus' },
        }),
      );
      markReachable('http://labeled-prom.zzz:9090');
      const result = await discoverMetricsSource(buildDeps());
      expect(result.url).toBe('http://labeled-prom.zzz:9090');
    });

    it('recognizes app.kubernetes.io/managed-by: prometheus-operator', async () => {
      kubeClient.seed(
        makeService('prometheus-operated', 'apps', {
          labels: { 'app.kubernetes.io/managed-by': 'prometheus-operator' },
        }),
      );
      markReachable('http://prometheus-operated.apps:9090');
      const result = await discoverMetricsSource(buildDeps());
      expect(result.url).toBe('http://prometheus-operated.apps:9090');
    });

    it('recognizes operated-prometheus: "true"', async () => {
      kubeClient.seed(
        makeService('op-prom', 'apps', {
          labels: { 'operated-prometheus': 'true' },
        }),
      );
      markReachable('http://op-prom.apps:9090');
      const result = await discoverMetricsSource(buildDeps());
      expect(result.sourceLabel).toBe('service-scan');
    });

    it('recognizes app: prometheus label', async () => {
      kubeClient.seed(
        makeService('op-prom2', 'apps', {
          labels: { app: 'prometheus' },
        }),
      );
      markReachable('http://op-prom2.apps:9090');
      const result = await discoverMetricsSource(buildDeps());
      expect(result.sourceLabel).toBe('service-scan');
    });

    it('prefers name match over bare port-9090 match', async () => {
      kubeClient.seed(makeService('random-svc', 'zzz'));
      kubeClient.seed(
        makeService('prometheus', 'zzz', {
          ports: [{ port: 1234 }],
        }),
      );
      markReachable('http://prometheus.zzz:1234');
      markReachable('http://random-svc.zzz:9090');
      const result = await discoverMetricsSource(buildDeps());
      expect(result.url).toBe('http://prometheus.zzz:1234');
    });

    it('breaks ties by namespace order: monitoring before default before rest', async () => {
      kubeClient.seed(makeService('prometheus', 'zzz-ns'));
      kubeClient.seed(makeService('prometheus', 'default'));
      kubeClient.seed(makeService('prometheus', 'monitoring'));
      markReachable('http://prometheus.zzz-ns:9090');
      markReachable('http://prometheus.default:9090');
      markReachable('http://prometheus.monitoring:9090');
      const result = await discoverMetricsSource(buildDeps());
      expect(result.url).toBe('http://prometheus.monitoring:9090');
    });

    it('breaks ties within "rest" namespaces alphabetically', async () => {
      kubeClient.seed(makeService('prometheus', 'zzz-ns'));
      kubeClient.seed(makeService('prometheus', 'aaa-ns'));
      markReachable('http://prometheus.zzz-ns:9090');
      markReachable('http://prometheus.aaa-ns:9090');
      const result = await discoverMetricsSource(buildDeps());
      expect(result.url).toBe('http://prometheus.aaa-ns:9090');
    });

    it('breaks ties within "rest" namespaces alphabetically (reverse seed order)', async () => {
      kubeClient.seed(makeService('prometheus', 'aaa-ns'));
      kubeClient.seed(makeService('prometheus', 'zzz-ns'));
      markReachable('http://prometheus.aaa-ns:9090');
      markReachable('http://prometheus.zzz-ns:9090');
      const result = await discoverMetricsSource(buildDeps());
      expect(result.url).toBe('http://prometheus.aaa-ns:9090');
    });

    it('uses the named http-ish port for a labeled Service with no port 9090', async () => {
      kubeClient.seed(
        makeService('labeled-named-port', 'default', {
          ports: [{ port: 7777, name: 'web' }],
          labels: { app: 'prometheus' },
        }),
      );
      markReachable('http://labeled-named-port.default:7777');
      const result = await discoverMetricsSource(buildDeps());
      expect(result.url).toBe('http://labeled-named-port.default:7777');
    });

    it('uses the first port for a labeled Service with no 9090 or named http port', async () => {
      kubeClient.seed(
        makeService('labeled-other-port', 'default', {
          ports: [{ port: 5555, name: 'grpc' }],
          labels: { app: 'prometheus' },
        }),
      );
      markReachable('http://labeled-other-port.default:5555');
      const result = await discoverMetricsSource(buildDeps());
      expect(result.url).toBe('http://labeled-other-port.default:5555');
    });

    it('uses the named http-ish port for a name-matched Service with no port 9090', async () => {
      kubeClient.seed(
        makeService('prometheus-server', 'default', {
          ports: [{ port: 7778, name: 'http' }],
        }),
      );
      markReachable('http://prometheus-server.default:7778');
      const result = await discoverMetricsSource(buildDeps());
      expect(result.url).toBe('http://prometheus-server.default:7778');
    });

    it('uses the first port for a name-matched Service with no 9090 or named http port', async () => {
      kubeClient.seed(
        makeService('prometheus-server', 'default', {
          ports: [{ port: 5556, name: 'grpc' }],
        }),
      );
      markReachable('http://prometheus-server.default:5556');
      const result = await discoverMetricsSource(buildDeps());
      expect(result.url).toBe('http://prometheus-server.default:5556');
    });

    it('falls back to port 9090 for a labeled Service with no ports at all', async () => {
      kubeClient.seed(
        makeService('labeled-no-ports', 'default', {
          ports: [],
          labels: { app: 'prometheus' },
        }),
      );
      markReachable('http://labeled-no-ports.default:9090');
      const result = await discoverMetricsSource(buildDeps());
      expect(result.url).toBe('http://labeled-no-ports.default:9090');
    });

    it('breaks ties by name when rank and namespace are equal', async () => {
      kubeClient.seed(makeService('prometheus-server', 'apps'));
      kubeClient.seed(makeService('prometheus-operated', 'apps'));
      kubeClient.seed(makeService('prometheus', 'apps'));
      markReachable('http://prometheus-server.apps:9090');
      markReachable('http://prometheus-operated.apps:9090');
      markReachable('http://prometheus.apps:9090');
      const result = await discoverMetricsSource(buildDeps());
      // all three name-match at rank 2, same namespace: alphabetically first wins
      expect(result.url).toBe('http://prometheus.apps:9090');
    });

    it('breaks ties by name when rank and namespace are equal (reverse seed order)', async () => {
      kubeClient.seed(makeService('prometheus', 'apps'));
      kubeClient.seed(makeService('prometheus-operated', 'apps'));
      kubeClient.seed(makeService('prometheus-server', 'apps'));
      markReachable('http://prometheus.apps:9090');
      markReachable('http://prometheus-operated.apps:9090');
      markReachable('http://prometheus-server.apps:9090');
      const result = await discoverMetricsSource(buildDeps());
      expect(result.url).toBe('http://prometheus.apps:9090');
    });

    it('falls through to the next candidate when the first is unreachable', async () => {
      const badUrl = 'http://prometheus.monitoring:9090';
      const bad = new FakeMetricsSource();
      bad.setReachable(false);
      probeResults.set(badUrl, bad);
      kubeClient.seed(makeService('prometheus', 'monitoring'));
      kubeClient.seed(makeService('prometheus-server', 'default'));
      markReachable('http://prometheus-server.default:9090');
      const result = await discoverMetricsSource(buildDeps());
      expect(result.url).toBe('http://prometheus-server.default:9090');
      expect(result.sourceLabel).toBe('service-scan');
    });

    it('falls through to later tiers when no Service candidate is reachable', async () => {
      const badUrl = 'http://prometheus.default:9090';
      const bad = new FakeMetricsSource();
      bad.setReachable(false);
      probeResults.set(badUrl, bad);
      kubeClient.seed(makeService('prometheus', 'default'));
      const result = await discoverMetricsSource(buildDeps());
      expect(result.sourceLabel).toBe('metrics-server');
    });

    it('ignores Services with no matching name, label, or port', async () => {
      kubeClient.seed(
        makeService('unrelated', 'default', { ports: [{ port: 80 }] }),
      );
      const result = await discoverMetricsSource(buildDeps());
      expect(result.sourceLabel).toBe('metrics-server');
    });

    it('ignores Services with no ports', async () => {
      kubeClient.seed(makeService('unrelated', 'default', { ports: [] }));
      const result = await discoverMetricsSource(buildDeps());
      expect(result.sourceLabel).toBe('metrics-server');
    });

    it('ignores malformed port entries (non-object, non-numeric port)', async () => {
      kubeClient.seed(
        makeService('prometheus', 'default', {
          ports: [null, { port: 'not-a-number' }, { name: 'http' }],
        }),
      );
      markReachable('http://prometheus.default:9090');
      const result = await discoverMetricsSource(buildDeps());
      // name match still applies even with unusable ports; falls back to 9090
      expect(result.url).toBe('http://prometheus.default:9090');
    });

    it('ignores Services with non-array ports', async () => {
      kubeClient.seed({
        kind: 'Service',
        apiVersion: 'v1',
        metadata: { name: 'prometheus', namespace: 'default' },
        spec: { ports: 'not-an-array' },
      });
      markReachable('http://prometheus.default:9090');
      const result = await discoverMetricsSource(buildDeps());
      // name match still applies with no usable ports; falls back to 9090
      expect(result.url).toBe('http://prometheus.default:9090');
    });

    it('ignores Services with no spec', async () => {
      kubeClient.seed({
        kind: 'Service',
        apiVersion: 'v1',
        metadata: { name: 'prometheus', namespace: 'default' },
      });
      markReachable('http://prometheus.default:9090');
      const result = await discoverMetricsSource(buildDeps());
      expect(result.url).toBe('http://prometheus.default:9090');
    });

    it('ignores Services with no name or namespace metadata', async () => {
      kubeClient.seed({
        kind: 'Service',
        apiVersion: 'v1',
        metadata: {},
        spec: { ports: [{ port: 9090 }] },
      });
      const result = await discoverMetricsSource(buildDeps());
      expect(result.sourceLabel).toBe('metrics-server');
    });

    it('skips when Service list returns forbidden', async () => {
      kubeClient.forbid('Service');
      const result = await discoverMetricsSource(buildDeps());
      expect(result.sourceLabel).toBe('metrics-server');
    });
  });

  // -------------------------------------------------------------------------
  // Tier 5: standard namespace probe
  // -------------------------------------------------------------------------

  describe('tier 5: standard namespace probe', () => {
    it('resolves prometheus-operated.monitoring:9090', async () => {
      const url = 'http://prometheus-operated.monitoring:9090';
      probeResults.set(url, new FakeMetricsSource()); // reachable by default
      const result = await discoverMetricsSource(buildDeps());
      expect(result.tier).toBe('prometheus');
      expect(result.url).toBe(url);
      expect(result.sourceLabel).toBe('namespace-probe');
    });

    it('resolves prometheus.monitoring:9090 when first fails', async () => {
      const first = 'http://prometheus-operated.monitoring:9090';
      const second = 'http://prometheus.monitoring:9090';
      const failSource = new FakeMetricsSource();
      failSource.setReachable(false);
      probeResults.set(first, failSource);
      probeResults.set(second, new FakeMetricsSource());
      const result = await discoverMetricsSource(buildDeps());
      expect(result.url).toBe(second);
      expect(result.sourceLabel).toBe('namespace-probe');
    });

    it('resolves prometheus-server.monitoring:9090 when first two fail', async () => {
      const first = 'http://prometheus-operated.monitoring:9090';
      const second = 'http://prometheus.monitoring:9090';
      const third = 'http://prometheus-server.monitoring:9090';
      const failSource1 = new FakeMetricsSource();
      failSource1.setReachable(false);
      const failSource2 = new FakeMetricsSource();
      failSource2.setReachable(false);
      probeResults.set(first, failSource1);
      probeResults.set(second, failSource2);
      probeResults.set(third, new FakeMetricsSource());
      const result = await discoverMetricsSource(buildDeps());
      expect(result.url).toBe(third);
      expect(result.sourceLabel).toBe('namespace-probe');
    });

    it('falls through when all three standard probes fail', async () => {
      for (const url of [
        'http://prometheus-operated.monitoring:9090',
        'http://prometheus.monitoring:9090',
        'http://prometheus-server.monitoring:9090',
      ]) {
        const s = new FakeMetricsSource();
        s.setReachable(false);
        probeResults.set(url, s);
      }
      const result = await discoverMetricsSource(buildDeps());
      expect(result.tier).toBe('metrics-server');
    });
  });

  // -------------------------------------------------------------------------
  // Tier 5: pod annotation scan
  // -------------------------------------------------------------------------

  describe('tier 5: pod annotation scan', () => {
    it('resolves pod with prometheus.io/scrape annotation', async () => {
      kubeClient.seed(
        makePod('prom-pod', '10.0.0.1', {
          'prometheus.io/scrape': 'true',
          'prometheus.io/port': '8080',
          'prometheus.io/path': '/metrics',
        }),
      );
      const result = await discoverMetricsSource(buildDeps());
      expect(result.tier).toBe('prometheus');
      expect(result.url).toBe('http://10.0.0.1:8080/metrics');
      expect(result.sourceLabel).toBe('pod-annotation');
    });

    it('uses default port 9090 when prometheus.io/port is absent', async () => {
      kubeClient.seed(
        makePod('prom-pod', '10.0.0.2', {
          'prometheus.io/scrape': 'true',
        }),
      );
      const result = await discoverMetricsSource(buildDeps());
      expect(result.url).toBe('http://10.0.0.2:9090/metrics');
    });

    it('uses default path /metrics when prometheus.io/path is absent', async () => {
      kubeClient.seed(
        makePod('prom-pod', '10.0.0.3', {
          'prometheus.io/scrape': 'true',
          'prometheus.io/port': '8888',
        }),
      );
      const result = await discoverMetricsSource(buildDeps());
      expect(result.url).toBe('http://10.0.0.3:8888/metrics');
    });

    it('skips pods without prometheus.io/scrape annotation', async () => {
      kubeClient.seed(makePod('no-annot', '10.0.0.4', { app: 'myapp' }));
      const result = await discoverMetricsSource(buildDeps());
      expect(result.tier).toBe('metrics-server');
    });

    it('skips pods with prometheus.io/scrape not equal to "true"', async () => {
      kubeClient.seed(
        makePod('false-scrape', '10.0.0.5', {
          'prometheus.io/scrape': 'false',
        }),
      );
      const result = await discoverMetricsSource(buildDeps());
      expect(result.tier).toBe('metrics-server');
    });

    it('skips pods with no IP', async () => {
      kubeClient.seed({
        kind: 'Pod',
        apiVersion: 'v1',
        metadata: {
          name: 'no-ip',
          namespace: 'default',
          annotations: { 'prometheus.io/scrape': 'true' },
        },
        status: {},
      });
      const result = await discoverMetricsSource(buildDeps());
      expect(result.tier).toBe('metrics-server');
    });

    it('skips pods with no metadata annotations', async () => {
      kubeClient.seed({
        kind: 'Pod',
        apiVersion: 'v1',
        metadata: { name: 'no-annots', namespace: 'default' },
        status: { podIP: '10.0.0.6' },
      });
      const result = await discoverMetricsSource(buildDeps());
      expect(result.tier).toBe('metrics-server');
    });

    it('skips when pod list returns error', async () => {
      kubeClient.forbid('Pod');
      const result = await discoverMetricsSource(buildDeps());
      expect(result.tier).toBe('metrics-server');
    });
  });

  // -------------------------------------------------------------------------
  // Tier 6: metrics-server
  // -------------------------------------------------------------------------

  describe('tier 6: metrics-server fallback', () => {
    it('resolves metrics-server when nothing else found', async () => {
      const result = await discoverMetricsSource(buildDeps());
      expect(result.tier).toBe('metrics-server');
      expect(result.url).toBeNull();
      expect(result.sourceLabel).toBe('metrics-server');
    });
  });

  // -------------------------------------------------------------------------
  // Tier 7: none
  // -------------------------------------------------------------------------

  describe('tier 7: none', () => {
    it('resolves none when metrics-server also unreachable', async () => {
      metricsServer.setReachable(false);
      const result = await discoverMetricsSource(buildDeps());
      expect(result.tier).toBe('none');
      expect(result.url).toBeNull();
      expect(result.sourceLabel).toBe('none');
    });
  });

  // -------------------------------------------------------------------------
  // Re-running discovery (context switch)
  // -------------------------------------------------------------------------

  describe('re-run on context switch', () => {
    it('returns updated result after ServiceMonitor is added', async () => {
      const first = await discoverMetricsSource(buildDeps());
      expect(first.tier).toBe('metrics-server');

      kubeClient.seed(makeServiceMonitor('new-sm', 'http://new:9090'));
      const second = await discoverMetricsSource(buildDeps());
      expect(second.tier).toBe('prometheus');
      expect(second.url).toBe('http://new:9090');
    });
  });
});
