/**
 * Step definitions for Spec 06 metrics discovery BDD scenarios.
 * Uses distinct step text to avoid Cucumber ambiguity with other step files.
 */
import { Given, When, Then, Before } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import type { PrivateerWorld } from '../support/world.js';
import {
  discoverMetricsSource,
  type DiscoveryResult,
  type DiscoveryDeps,
} from '../../src/metrics/discovery.js';
import { detectExporterCapabilities } from '../../src/metrics/exporters.js';
import type { ExporterCapabilities } from '../../src/metrics/exporters.js';
import { FakeMetricsSource } from '../../src/boundaries/metrics-source.fake.js';
import { FakeKubeClient } from '../../src/boundaries/kube-client.fake.js';
import { InMemoryConfigStore } from '../../src/boundaries/config-store.fake.js';
import type { KubernetesObject } from '../../src/core/types.js';

// ---------------------------------------------------------------------------
// World augmentation
// ---------------------------------------------------------------------------

declare module '../support/world.js' {
  interface PrivateerWorld {
    metricsDiscoveryResult: DiscoveryResult | null;
    metricsExporterCaps: ExporterCapabilities | null;
    metricsConfigStore: InMemoryConfigStore;
    metricsKubeClient: FakeKubeClient;
    metricsProbeOverrides: Map<string, FakeMetricsSource>;
    metricsServerSource: FakeMetricsSource;
    metricsEnvVars: Map<string, string>;
    metricsExporterSource: FakeMetricsSource;
    metricsStandardProbesFail: boolean;
    metricsAnnotationPodUrl: string | null;
    metricsAnnotationPodsAbsent: boolean;
  }
}

// ---------------------------------------------------------------------------
// Reset per-scenario
// ---------------------------------------------------------------------------

Before(function (this: PrivateerWorld) {
  this.metricsDiscoveryResult = null;
  this.metricsExporterCaps = null;
  this.metricsConfigStore = new InMemoryConfigStore();
  this.metricsKubeClient = new FakeKubeClient();
  this.metricsProbeOverrides = new Map();
  this.metricsServerSource = new FakeMetricsSource();
  this.metricsServerSource.setReachable(true);
  this.metricsEnvVars = new Map();
  this.metricsExporterSource = new FakeMetricsSource();
  this.metricsStandardProbesFail = false;
  this.metricsAnnotationPodUrl = null;
  this.metricsAnnotationPodsAbsent = false;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildDiscoveryDeps(world: PrivateerWorld): DiscoveryDeps {
  return {
    configStore: world.metricsConfigStore,
    kubeClient: world.metricsKubeClient,
    makeSource: (url: string): FakeMetricsSource => {
      const override = world.metricsProbeOverrides.get(url);
      if (override !== undefined) {
        return override;
      }
      const failing = new FakeMetricsSource();
      failing.setReachable(false);
      return failing;
    },
    metricsServerSource: world.metricsServerSource,
    getEnv: (name: string): string | undefined =>
      world.metricsEnvVars.get(name),
  };
}

function makeServiceMonitorObject(
  name: string,
  targetUrl: string,
): KubernetesObject {
  return {
    kind: 'ServiceMonitor',
    apiVersion: 'monitoring.coreos.com/v1',
    metadata: { name, namespace: 'monitoring' },
    spec: { endpoints: [{ targetUrl }] },
  };
}

function makeScrapedPod(url: string): KubernetesObject {
  const parsed = new URL(url);
  const ip = parsed.hostname;
  const port = parsed.port || '9090';
  const path = parsed.pathname;
  return {
    kind: 'Pod',
    apiVersion: 'v1',
    metadata: {
      name: 'scrape-pod',
      namespace: 'default',
      annotations: {
        'prometheus.io/scrape': 'true',
        'prometheus.io/port': port,
        'prometheus.io/path': path,
      },
    },
    status: { podIP: ip },
  };
}

// ---------------------------------------------------------------------------
// Given steps — discovery environment
// ---------------------------------------------------------------------------

Given(
  'a metrics discovery environment with config URL {string}',
  async function (this: PrivateerWorld, configUrl: string) {
    await this.metricsConfigStore.save({ prometheus: { url: configUrl } });
  },
);

Given(
  'a metrics discovery environment with env URL {string}',
  function (this: PrivateerWorld, envUrl: string) {
    this.metricsEnvVars.set('PROMETHEUS_URL', envUrl);
  },
);

Given(
  'a metrics discovery environment with no config or env URL',
  function (this: PrivateerWorld) {
    // default state — no config, no env
  },
);

Given(
  'the env URL is {string}',
  function (this: PrivateerWorld, envUrl: string) {
    this.metricsEnvVars.set('PROMETHEUS_URL', envUrl);
  },
);

Given(
  'a ServiceMonitor exists pointing to {string}',
  function (this: PrivateerWorld, smUrl: string) {
    this.metricsKubeClient.seed(makeServiceMonitorObject('prom-sm', smUrl));
  },
);

Given(
  'a ServiceMonitor is added pointing to {string}',
  function (this: PrivateerWorld, smUrl: string) {
    this.metricsKubeClient.seed(makeServiceMonitorObject('new-sm', smUrl));
  },
);

Given(
  'the kube client forbids ServiceMonitor access',
  function (this: PrivateerWorld) {
    this.metricsKubeClient.forbid('ServiceMonitor');
  },
);

Given('no ServiceMonitors exist', function (this: PrivateerWorld) {
  // default state — no ServiceMonitors seeded
});

Given(
  'the standard probe for {string} succeeds',
  function (this: PrivateerWorld, url: string) {
    const source = new FakeMetricsSource();
    this.metricsProbeOverrides.set(url, source);
  },
);

Given('no standard namespace probes succeed', function (this: PrivateerWorld) {
  for (const url of [
    'http://prometheus-operated.monitoring:9090',
    'http://prometheus.monitoring:9090',
    'http://prometheus-server.monitoring:9090',
  ]) {
    const s = new FakeMetricsSource();
    s.setReachable(false);
    this.metricsProbeOverrides.set(url, s);
  }
});

Given(
  'the standard namespace probes all fail',
  function (this: PrivateerWorld) {
    for (const url of [
      'http://prometheus-operated.monitoring:9090',
      'http://prometheus.monitoring:9090',
      'http://prometheus-server.monitoring:9090',
    ]) {
      const s = new FakeMetricsSource();
      s.setReachable(false);
      this.metricsProbeOverrides.set(url, s);
    }
  },
);

Given(
  'a scraped pod exists at {string}',
  function (this: PrivateerWorld, podUrl: string) {
    this.metricsKubeClient.seed(makeScrapedPod(podUrl));
  },
);

Given('the pod annotation scan finds no pods', function (this: PrivateerWorld) {
  // default — no pods seeded
});

Given('metrics-server is unavailable', function (this: PrivateerWorld) {
  this.metricsServerSource.setReachable(false);
});

// ---------------------------------------------------------------------------
// Given steps — exporter probe environment
// ---------------------------------------------------------------------------

Given('a metrics exporter probe environment', function (this: PrivateerWorld) {
  this.metricsExporterSource = new FakeMetricsSource();
});

Given(
  'the metric family {string} is present',
  function (this: PrivateerWorld, metricName: string) {
    this.metricsExporterSource.setKnownSeries(metricName);
  },
);

Given('no metric families are present', function (this: PrivateerWorld) {
  // default — nothing seeded
});

Given('the metrics source is unreachable', function (this: PrivateerWorld) {
  this.metricsExporterSource.setReachable(false);
});

// ---------------------------------------------------------------------------
// When steps
// ---------------------------------------------------------------------------

When('discovery runs', async function (this: PrivateerWorld) {
  this.metricsDiscoveryResult = await discoverMetricsSource(
    buildDiscoveryDeps(this),
  );
});

When('discovery runs again', async function (this: PrivateerWorld) {
  this.metricsDiscoveryResult = await discoverMetricsSource(
    buildDiscoveryDeps(this),
  );
});

When('exporter detection runs', async function (this: PrivateerWorld) {
  this.metricsExporterCaps = await detectExporterCapabilities(
    this.metricsExporterSource,
  );
});

// ---------------------------------------------------------------------------
// Then steps — discovery result
// ---------------------------------------------------------------------------

Then(
  'the resolved metrics tier is {string}',
  function (this: PrivateerWorld, expectedTier: string) {
    assert.ok(
      this.metricsDiscoveryResult !== null,
      'discovery result is null — was When "discovery runs" executed?',
    );
    assert.equal(this.metricsDiscoveryResult.tier, expectedTier);
  },
);

Then(
  'the resolved metrics source URL is {string}',
  function (this: PrivateerWorld, expectedUrl: string) {
    assert.ok(this.metricsDiscoveryResult !== null);
    assert.equal(this.metricsDiscoveryResult.url, expectedUrl);
  },
);

Then(
  'the discovery source label is {string}',
  function (this: PrivateerWorld, expectedLabel: string) {
    assert.ok(this.metricsDiscoveryResult !== null);
    assert.equal(this.metricsDiscoveryResult.sourceLabel, expectedLabel);
  },
);

// ---------------------------------------------------------------------------
// Then steps — exporter capabilities
// ---------------------------------------------------------------------------

Then(
  'the capability {string} is enabled',
  function (this: PrivateerWorld, capName: string) {
    assert.ok(
      this.metricsExporterCaps !== null,
      'exporter caps are null — was When "exporter detection runs" executed?',
    );
    const caps = this.metricsExporterCaps;
    switch (capName) {
      case 'cadvisor':
        assert.equal(caps.cadvisor, true);
        break;
      case 'kube-state-metrics':
        assert.equal(caps.kubeStateMetrics, true);
        break;
      case 'kafka-exporter':
        assert.equal(caps.kafkaExporter, true);
        break;
      case 'strimzi-jmx':
        assert.equal(caps.strimziJmx, true);
        break;
      default:
        assert.fail(`Unknown capability: ${capName}`);
    }
  },
);

Then(
  'the capability {string} is disabled',
  function (this: PrivateerWorld, capName: string) {
    assert.ok(
      this.metricsExporterCaps !== null,
      'exporter caps are null — was When "exporter detection runs" executed?',
    );
    const caps = this.metricsExporterCaps;
    switch (capName) {
      case 'cadvisor':
        assert.equal(caps.cadvisor, false);
        break;
      case 'kube-state-metrics':
        assert.equal(caps.kubeStateMetrics, false);
        break;
      case 'kafka-exporter':
        assert.equal(caps.kafkaExporter, false);
        break;
      case 'strimzi-jmx':
        assert.equal(caps.strimziJmx, false);
        break;
      default:
        assert.fail(`Unknown capability: ${capName}`);
    }
  },
);
