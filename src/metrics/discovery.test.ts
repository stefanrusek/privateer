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
  // Tier 4: standard namespace probe
  // -------------------------------------------------------------------------

  describe('tier 4: standard namespace probe', () => {
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
