/**
 * Step definitions for health rule BDD scenarios (Spec 06 §6).
 * Uses distinct step text to avoid Cucumber ambiguity with existing step defs.
 */
import { Given, When, Then, Before } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import type { PrivateerWorld } from '../support/world.js';
import { RULE_CATALOG } from '../../src/health/registry.js';
import type {
  HealthRule,
  RuleResult,
  RuleCaps,
} from '../../src/health/types.js';
import { EMPTY_CAPS } from '../../src/health/types.js';
import { StateStore } from '../../src/store/state-store.js';
import type { ResourceEvent, ResourceObject } from '../../src/core/types.js';

// ---------------------------------------------------------------------------
// World augmentation
// ---------------------------------------------------------------------------

declare module '../support/world.js' {
  interface PrivateerWorld {
    hrStore: StateStore;
    hrCaps: RuleCaps;
    hrResult: RuleResult | null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const HR_CTX = 'hr-test';

function makeHrStore(
  seed: (store: StateStore) => void = () => undefined,
): StateStore {
  const store = new StateStore((event: ResourceEvent): ResourceObject => {
    const meta = event.object.metadata ?? {};
    const uid =
      meta.uid ?? `${event.kind}/${meta.namespace ?? '~'}/${meta.name ?? ''}`;
    return {
      uid,
      kind: event.kind,
      apiVersion: event.apiVersion,
      name: meta.name ?? '',
      namespace: event.namespace,
      labels: meta.labels ?? {},
      annotations: meta.annotations ?? {},
      creationTimestamp: meta.creationTimestamp ?? '2026-01-01T00:00:00Z',
      resourceVersion: meta.resourceVersion ?? '1',
      status: { color: 'green', label: 'Running' },
      raw: event.object,
    };
  });
  seed(store);
  return store;
}

function seedHr(
  store: StateStore,
  kind: string,
  name: string,
  namespace: string | null,
  raw: Record<string, unknown>,
): void {
  const rawMeta =
    typeof raw.metadata === 'object' && raw.metadata !== null
      ? (raw.metadata as Record<string, unknown>)
      : {};
  const baseMeta: Record<string, unknown> = {
    name,
    uid: `uid-${kind}-${namespace ?? 'cluster'}-${name}`,
    ...rawMeta,
  };
  const metaWithNs = namespace !== null ? { ...baseMeta, namespace } : baseMeta;

  const event: ResourceEvent = {
    type: 'ADDED',
    apiVersion: typeof raw.apiVersion === 'string' ? raw.apiVersion : 'v1',
    kind,
    namespace,
    name,
    object: { ...raw, kind, metadata: metaWithNs },
    receivedAt: 0,
  };
  store.applyEvent(HR_CTX, event);
}

function findRule(id: string): HealthRule {
  const rule = RULE_CATALOG.find((r) => r.id === id);
  assert.ok(rule !== undefined, `Rule ${id} not found in RULE_CATALOG`);
  return rule;
}

// ---------------------------------------------------------------------------
// Before hook — reset state per scenario
// ---------------------------------------------------------------------------

Before(function (this: PrivateerWorld) {
  this.hrStore = makeHrStore();
  this.hrCaps = { ...EMPTY_CAPS };
  this.hrResult = null;
});

// ---------------------------------------------------------------------------
// Given steps — environment / capabilities
// ---------------------------------------------------------------------------

Given('a health rule evaluation environment', function (this: PrivateerWorld) {
  // Initialised in Before hook; step names the context explicitly.
});

Given('no exporter capabilities are enabled', function (this: PrivateerWorld) {
  this.hrCaps = { ...EMPTY_CAPS };
});

Given(
  'the kafkaExporter capability is enabled',
  function (this: PrivateerWorld) {
    this.hrCaps = { ...this.hrCaps, kafkaExporter: true };
  },
);

Given(
  'the kafkaExporter capability is not enabled',
  function (this: PrivateerWorld) {
    this.hrCaps = { ...this.hrCaps, kafkaExporter: false };
  },
);

Given(
  'the strimziPresent capability is enabled',
  function (this: PrivateerWorld) {
    this.hrCaps = { ...this.hrCaps, strimziPresent: true };
  },
);

Given(
  'no secrets operator capability is enabled',
  function (this: PrivateerWorld) {
    this.hrCaps = { ...this.hrCaps, secretsOperatorPresent: false };
  },
);

Given(
  'the secretsOperator capability is enabled',
  function (this: PrivateerWorld) {
    this.hrCaps = { ...this.hrCaps, secretsOperatorPresent: true };
  },
);

Given('Prometheus is connected', function (this: PrivateerWorld) {
  this.hrCaps = { ...this.hrCaps, prometheusConnected: true };
});

// ---------------------------------------------------------------------------
// Given steps — Pod
// ---------------------------------------------------------------------------

Given(
  'a Pod {string} in namespace {string} with no readiness probe',
  function (this: PrivateerWorld, name: string, ns: string) {
    seedHr(this.hrStore, 'Pod', name, ns, {
      spec: { containers: [{ name: 'main', image: 'nginx' }] },
    });
  },
);

Given(
  'a Pod {string} in namespace {string} with a readiness probe',
  function (this: PrivateerWorld, name: string, ns: string) {
    seedHr(this.hrStore, 'Pod', name, ns, {
      spec: {
        containers: [
          {
            name: 'main',
            image: 'nginx',
            readinessProbe: { httpGet: { path: '/ready', port: 8080 } },
          },
        ],
      },
    });
  },
);

Given(
  'a Pod {string} in namespace {string} suppressing rule {string} with no readiness probe',
  function (this: PrivateerWorld, name: string, ns: string, ruleId: string) {
    seedHr(this.hrStore, 'Pod', name, ns, {
      metadata: { annotations: { 'p9r.io/suppress-rules': ruleId } },
      spec: { containers: [{ name: 'main', image: 'nginx' }] },
    });
  },
);

Given(
  'a Pod {string} in namespace {string} with no startup probe',
  function (this: PrivateerWorld, name: string, ns: string) {
    seedHr(this.hrStore, 'Pod', name, ns, {
      spec: { containers: [{ name: 'main', image: 'nginx' }] },
    });
  },
);

Given(
  'a Pod {string} in namespace {string} with no scrape annotation',
  function (this: PrivateerWorld, name: string, ns: string) {
    seedHr(this.hrStore, 'Pod', name, ns, {
      spec: { containers: [{ name: 'main', image: 'nginx' }] },
    });
  },
);

Given(
  'a Pod {string} in namespace {string} with scrape annotation {string}',
  function (
    this: PrivateerWorld,
    name: string,
    ns: string,
    scrapeValue: string,
  ) {
    seedHr(this.hrStore, 'Pod', name, ns, {
      metadata: {
        annotations: { 'prometheus.io/scrape': scrapeValue },
      },
      spec: { containers: [{ name: 'main', image: 'nginx' }] },
    });
  },
);

// ---------------------------------------------------------------------------
// Given steps — ServiceMonitor
// ---------------------------------------------------------------------------

Given(
  'a ServiceMonitor {string} in namespace {string} exists',
  function (this: PrivateerWorld, name: string, ns: string) {
    seedHr(this.hrStore, 'ServiceMonitor', name, ns, {
      spec: { endpoints: [] },
    });
  },
);

// ---------------------------------------------------------------------------
// Given steps — StatefulSet
// ---------------------------------------------------------------------------

Given(
  'a StatefulSet {string} in namespace {string} with {int} replica',
  function (this: PrivateerWorld, name: string, ns: string, replicas: number) {
    seedHr(this.hrStore, 'StatefulSet', name, ns, {
      spec: { replicas },
    });
  },
);

Given(
  'a StatefulSet {string} in namespace {string} with {int} replicas',
  function (this: PrivateerWorld, name: string, ns: string, replicas: number) {
    seedHr(this.hrStore, 'StatefulSet', name, ns, {
      spec: { replicas },
    });
  },
);

Given(
  'a StatefulSet {string} in namespace {string} with {int} replica suppressing {string}',
  function (
    this: PrivateerWorld,
    name: string,
    ns: string,
    replicas: number,
    ruleId: string,
  ) {
    seedHr(this.hrStore, 'StatefulSet', name, ns, {
      metadata: { annotations: { 'p9r.io/suppress-rules': ruleId } },
      spec: { replicas },
    });
  },
);

// ---------------------------------------------------------------------------
// Given steps — CronJob
// ---------------------------------------------------------------------------

Given(
  'a CronJob {string} in namespace {string} with no concurrencyPolicy',
  function (this: PrivateerWorld, name: string, ns: string) {
    seedHr(this.hrStore, 'CronJob', name, ns, {
      spec: { schedule: '0 * * * *' },
    });
  },
);

Given(
  'a CronJob {string} in namespace {string} with concurrencyPolicy {string}',
  function (this: PrivateerWorld, name: string, ns: string, policy: string) {
    seedHr(this.hrStore, 'CronJob', name, ns, {
      spec: { schedule: '0 * * * *', concurrencyPolicy: policy },
    });
  },
);

// ---------------------------------------------------------------------------
// Given steps — PVC
// ---------------------------------------------------------------------------

Given(
  'a PVC {string} in namespace {string} with no storageClassName',
  function (this: PrivateerWorld, name: string, ns: string) {
    seedHr(this.hrStore, 'PersistentVolumeClaim', name, ns, {
      spec: { accessModes: ['ReadWriteOnce'] },
    });
  },
);

Given(
  'a PVC {string} in namespace {string} with storageClassName {string}',
  function (
    this: PrivateerWorld,
    name: string,
    ns: string,
    storageClassName: string,
  ) {
    seedHr(this.hrStore, 'PersistentVolumeClaim', name, ns, {
      spec: { storageClassName, accessModes: ['ReadWriteOnce'] },
    });
  },
);

// ---------------------------------------------------------------------------
// Given steps — PV
// ---------------------------------------------------------------------------

Given(
  'a PV {string} with reclaimPolicy {string} and no backup annotation',
  function (this: PrivateerWorld, name: string, reclaimPolicy: string) {
    seedHr(this.hrStore, 'PersistentVolume', name, null, {
      spec: { persistentVolumeReclaimPolicy: reclaimPolicy },
    });
  },
);

Given(
  'a PV {string} with reclaimPolicy {string} and velero backup annotation',
  function (this: PrivateerWorld, name: string, reclaimPolicy: string) {
    seedHr(this.hrStore, 'PersistentVolume', name, null, {
      metadata: {
        annotations: { 'backup.velero.io/backup-volumes': 'true' },
      },
      spec: { persistentVolumeReclaimPolicy: reclaimPolicy },
    });
  },
);

// ---------------------------------------------------------------------------
// Given steps — Secret
// ---------------------------------------------------------------------------

Given(
  'an Opaque Secret {string} in namespace {string}',
  function (this: PrivateerWorld, name: string, ns: string) {
    seedHr(this.hrStore, 'Secret', name, ns, {
      type: 'Opaque',
    });
  },
);

// ---------------------------------------------------------------------------
// Given steps — Kafka detection
// ---------------------------------------------------------------------------

Given('no Kafka is present in the cluster', function (this: PrivateerWorld) {
  // default state — no Kafka resources seeded
});

Given('Strimzi Kafka is present via CRD', function (this: PrivateerWorld) {
  seedHr(
    this.hrStore,
    'CustomResourceDefinition',
    'kafkas.kafka.strimzi.io',
    null,
    {
      spec: { group: 'kafka.strimzi.io' },
    },
  );
});

Given('bare Kafka is present via pod labels', function (this: PrivateerWorld) {
  seedHr(this.hrStore, 'Pod', 'kafka-0', 'kafka', {
    metadata: { labels: { app: 'kafka' } },
    spec: { containers: [{ name: 'kafka', image: 'kafka:3.7' }] },
  });
});

// ---------------------------------------------------------------------------
// When steps
// ---------------------------------------------------------------------------

When(
  'health rule {string} is evaluated',
  function (this: PrivateerWorld, ruleId: string) {
    const rule = findRule(ruleId);
    this.hrResult = rule.evaluate(this.hrStore, HR_CTX, this.hrCaps);
  },
);

// ---------------------------------------------------------------------------
// Then steps
// ---------------------------------------------------------------------------

Then(
  'the health rule result status is {string}',
  function (this: PrivateerWorld, expectedStatus: string) {
    assert.ok(
      this.hrResult !== null,
      'hrResult is null — was When "health rule ... is evaluated" executed?',
    );
    assert.equal(this.hrResult.status, expectedStatus);
  },
);

Then(
  'the affected resource name is {string}',
  function (this: PrivateerWorld, expectedName: string) {
    assert.ok(this.hrResult !== null, 'hrResult is null');
    const names = this.hrResult.affectedResources.map((r) => r.name);
    assert.ok(
      names.includes(expectedName),
      `Expected affected resource "${expectedName}" but got [${names.join(', ')}]`,
    );
  },
);

Then(
  'the health rule result detail mentions {string}',
  function (this: PrivateerWorld, substring: string) {
    assert.ok(this.hrResult !== null, 'hrResult is null');
    assert.ok(
      typeof this.hrResult.detail === 'string' &&
        this.hrResult.detail.includes(substring),
      `Expected detail to include "${substring}" but got: ${String(this.hrResult.detail)}`,
    );
  },
);
