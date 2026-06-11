/**
 * Kafka rules: KFK-001..013 (Spec 06 §6.5).
 *
 * Applicability matrix (Spec 06 §6.5):
 *   Strimzi-only:           KFK-003, 005, 008, 012
 *   kafka-exporter metrics: KFK-001, 002, 004, 009
 *   JMX/Prometheus metrics: KFK-006
 *   Pod/StatefulSet:        KFK-007, 010, 011
 *   Info (Kafka present):   KFK-013
 */

import type {
  HealthRule,
  RuleResult,
  AffectedResource,
  RuleCaps,
} from '../types.js';
import type { StateStore } from '../../store/state-store.js';
import type { ResourceObject } from '../../core/types.js';
import { isRuleSuppressed } from '../suppression.js';
import {
  detectKafka,
  detectStrimzi,
  getKafkaBrokerCount,
} from '../kafka-detection.js';

function toAffected(obj: ResourceObject): AffectedResource {
  return {
    kind: obj.kind,
    namespace: obj.namespace ?? '',
    name: obj.name,
  };
}

const KAFKA_LABELS: readonly (readonly [string, string])[] = [
  ['app', 'kafka'],
  ['app.kubernetes.io/name', 'kafka'],
  ['app.kubernetes.io/component', 'kafka'],
];

function hasAnyLabel(
  labels: Record<string, string>,
  pairs: readonly (readonly [string, string])[],
): boolean {
  return pairs.some(([k, v]) => labels[k] === v);
}

// ---------------------------------------------------------------------------
// KFK-001: Topic has replication factor of 1 (error, kafka-exporter required)
// ---------------------------------------------------------------------------

export const KFK_001: HealthRule = {
  id: 'KFK-001',
  category: 'kafka',
  severity: 'error',
  title: (result) => {
    const n = result.affectedResources.length;
    return n === 1
      ? `1 topic has replication factor of 1 (no fault tolerance)`
      : `${String(n)} topics have replication factor of 1`;
  },
  evaluate(store: StateStore, context: string, caps: RuleCaps): RuleResult {
    const kafka = detectKafka(store, context);
    if (kafka.deploymentType === 'none') {
      return { status: 'skipped', affectedResources: [] };
    }
    if (!caps.kafkaExporter) {
      return { status: 'skipped', affectedResources: [] };
    }

    const topics = store.list(context, 'KafkaTopic');
    const affected: AffectedResource[] = [];

    for (const topic of topics) {
      if (isRuleSuppressed(topic.annotations, 'KFK-001')) {
        continue;
      }
      const spec = topic.raw.spec;
      const replicas = spec?.replicas;
      if (typeof replicas === 'number' && replicas <= 1) {
        affected.push(toAffected(topic));
      }
    }

    if (affected.length === 0) {
      return { status: 'ok', affectedResources: [] };
    }
    return { status: 'error', affectedResources: affected };
  },
};

// ---------------------------------------------------------------------------
// KFK-002: Topic has replication factor less than 3 (warn, kafka-exporter)
// ---------------------------------------------------------------------------

export const KFK_002: HealthRule = {
  id: 'KFK-002',
  category: 'kafka',
  severity: 'warn',
  title: (result) => {
    const n = result.affectedResources.length;
    return n === 1
      ? `1 topic has replication factor less than 3`
      : `${String(n)} topics have replication factor less than 3`;
  },
  evaluate(store: StateStore, context: string, caps: RuleCaps): RuleResult {
    const kafka = detectKafka(store, context);
    if (kafka.deploymentType === 'none') {
      return { status: 'skipped', affectedResources: [] };
    }
    if (!caps.kafkaExporter) {
      return { status: 'skipped', affectedResources: [] };
    }

    const topics = store.list(context, 'KafkaTopic');
    const affected: AffectedResource[] = [];

    for (const topic of topics) {
      if (isRuleSuppressed(topic.annotations, 'KFK-002')) {
        continue;
      }
      const spec = topic.raw.spec;
      const replicas = spec?.replicas;
      // Must be >= 2 (less than 3 but > 1) — KFK-001 covers <= 1
      if (typeof replicas === 'number' && replicas >= 2 && replicas < 3) {
        affected.push(toAffected(topic));
      }
    }

    if (affected.length === 0) {
      return { status: 'ok', affectedResources: [] };
    }
    return { status: 'warn', affectedResources: affected };
  },
};

// ---------------------------------------------------------------------------
// KFK-003: min.insync.replicas equals replication factor (error, Strimzi-only)
// ---------------------------------------------------------------------------

export const KFK_003: HealthRule = {
  id: 'KFK-003',
  category: 'kafka',
  severity: 'error',
  title: (result) => {
    const n = result.affectedResources.length;
    return n === 1
      ? `1 topic has min.insync.replicas equal to replication factor`
      : `${String(n)} topics have min.insync.replicas equal to replication factor`;
  },
  evaluate(store: StateStore, context: string, caps: RuleCaps): RuleResult {
    if (!caps.strimziPresent) {
      return { status: 'skipped', affectedResources: [] };
    }

    const topics = store.list(context, 'KafkaTopic');
    const affected: AffectedResource[] = [];

    for (const topic of topics) {
      if (isRuleSuppressed(topic.annotations, 'KFK-003')) {
        continue;
      }
      const spec = topic.raw.spec;
      const replicas = spec?.replicas;
      const config = (spec?.config ?? {}) as Record<string, unknown>;
      const minIsr = config['min.insync.replicas'];

      if (
        typeof replicas === 'number' &&
        (typeof minIsr === 'number' || typeof minIsr === 'string')
      ) {
        const minIsrNum = Number(minIsr);
        if (!isNaN(minIsrNum) && minIsrNum >= replicas) {
          affected.push(toAffected(topic));
        }
      }
    }

    if (affected.length === 0) {
      return { status: 'ok', affectedResources: [] };
    }
    return { status: 'error', affectedResources: affected };
  },
};

// ---------------------------------------------------------------------------
// KFK-004: Consumer group lag in critical threshold trending upward (warn, kafka-exporter)
// ---------------------------------------------------------------------------

export const KFK_004: HealthRule = {
  id: 'KFK-004',
  category: 'kafka',
  severity: 'warn',
  title: (result) => {
    const n = result.affectedResources.length;
    return n === 1
      ? `1 consumer group has critical lag trending upward`
      : `${String(n)} consumer groups have critical lag trending upward`;
  },
  evaluate(store: StateStore, context: string, caps: RuleCaps): RuleResult {
    const kafka = detectKafka(store, context);
    if (kafka.deploymentType === 'none') {
      return { status: 'skipped', affectedResources: [] };
    }
    if (!caps.kafkaExporter) {
      return { status: 'skipped', affectedResources: [] };
    }

    // Consumer group lag is represented as ConsumerGroup resources in the store
    const groups = store.list(context, 'KafkaConsumerGroup');
    const affected: AffectedResource[] = [];

    for (const group of groups) {
      if (isRuleSuppressed(group.annotations, 'KFK-004')) {
        continue;
      }
      const status = group.raw.status;
      const lag = status?.lag;
      const trend = status?.trend;
      // Critical threshold: lag > 10000 and trending upward
      if (typeof lag === 'number' && lag > 10000 && trend === 'climbing') {
        affected.push(toAffected(group));
      }
    }

    if (affected.length === 0) {
      return { status: 'ok', affectedResources: [] };
    }
    return { status: 'warn', affectedResources: affected };
  },
};

// ---------------------------------------------------------------------------
// KFK-005: Topic has no retention policy set (warn, Strimzi-only)
// ---------------------------------------------------------------------------

export const KFK_005: HealthRule = {
  id: 'KFK-005',
  category: 'kafka',
  severity: 'warn',
  title: (result) => {
    const n = result.affectedResources.length;
    return n === 1
      ? `1 topic has no retention policy set (unlimited retention)`
      : `${String(n)} topics have no retention policy set`;
  },
  evaluate(store: StateStore, context: string, caps: RuleCaps): RuleResult {
    if (!caps.strimziPresent) {
      return { status: 'skipped', affectedResources: [] };
    }

    const topics = store.list(context, 'KafkaTopic');
    const affected: AffectedResource[] = [];

    for (const topic of topics) {
      if (isRuleSuppressed(topic.annotations, 'KFK-005')) {
        continue;
      }
      const spec = topic.raw.spec;
      const config = (spec?.config ?? {}) as Record<string, unknown>;
      const retentionMs = config['retention.ms'];
      const retentionBytes = config['retention.bytes'];

      const hasRetention =
        typeof retentionMs === 'number' ||
        typeof retentionMs === 'string' ||
        typeof retentionBytes === 'number' ||
        typeof retentionBytes === 'string';

      if (!hasRetention) {
        affected.push(toAffected(topic));
      }
    }

    if (affected.length === 0) {
      return { status: 'ok', affectedResources: [] };
    }
    return { status: 'warn', affectedResources: affected };
  },
};

// ---------------------------------------------------------------------------
// KFK-006: Under-replicated partitions detected (error, JMX metrics)
// ---------------------------------------------------------------------------

export const KFK_006: HealthRule = {
  id: 'KFK-006',
  category: 'kafka',
  severity: 'error',
  title: () => `Under-replicated partitions detected`,
  evaluate(store: StateStore, context: string, caps: RuleCaps): RuleResult {
    const kafka = detectKafka(store, context);
    if (kafka.deploymentType === 'none') {
      return { status: 'skipped', affectedResources: [] };
    }
    if (!caps.strimziJmx) {
      return { status: 'skipped', affectedResources: [] };
    }

    // KafkaMetrics resources carry broker health data
    const metrics = store.list(context, 'KafkaMetrics');
    for (const m of metrics) {
      if (isRuleSuppressed(m.annotations, 'KFK-006')) {
        continue;
      }
      const data = m.raw as Record<string, unknown>;
      const underReplicated = data.underReplicatedPartitions;
      if (typeof underReplicated === 'number' && underReplicated > 0) {
        return {
          status: 'error',
          affectedResources: [toAffected(m)],
          detail: `${String(underReplicated)} under-replicated partition(s)`,
        };
      }
    }

    return { status: 'ok', affectedResources: [] };
  },
};

// ---------------------------------------------------------------------------
// KFK-007: Broker count is 1 (warn, pod inspection)
// ---------------------------------------------------------------------------

export const KFK_007: HealthRule = {
  id: 'KFK-007',
  category: 'kafka',
  severity: 'warn',
  title: () => `Kafka cluster has only 1 broker (single point of failure)`,
  evaluate(store: StateStore, context: string): RuleResult {
    const kafka = detectKafka(store, context);
    if (kafka.deploymentType === 'none') {
      return { status: 'skipped', affectedResources: [] };
    }

    const brokerCount = getKafkaBrokerCount(store, context);
    if (brokerCount <= 1) {
      return {
        status: 'warn',
        affectedResources: [],
        detail: `Only ${String(brokerCount)} broker found`,
      };
    }
    return { status: 'ok', affectedResources: [] };
  },
};

// ---------------------------------------------------------------------------
// KFK-008: KafkaUser has wildcard ACL on Topic (warn, Strimzi-only)
// ---------------------------------------------------------------------------

export const KFK_008: HealthRule = {
  id: 'KFK-008',
  category: 'kafka',
  severity: 'warn',
  title: (result) => {
    const n = result.affectedResources.length;
    return n === 1
      ? `1 KafkaUser has wildcard ACL (*) on resource type Topic`
      : `${String(n)} KafkaUsers have wildcard ACL on Topic`;
  },
  evaluate(store: StateStore, context: string, caps: RuleCaps): RuleResult {
    if (!caps.strimziPresent) {
      return { status: 'skipped', affectedResources: [] };
    }

    const users = store.list(context, 'KafkaUser');
    const affected: AffectedResource[] = [];

    for (const user of users) {
      if (isRuleSuppressed(user.annotations, 'KFK-008')) {
        continue;
      }
      const spec = user.raw.spec;
      const auth = (spec?.authorization ?? {}) as Record<string, unknown>;
      const acls = Array.isArray(auth.acls)
        ? (auth.acls as Record<string, unknown>[])
        : [];

      const hasWildcard = acls.some((acl) => {
        const resource = (acl.resource ?? {}) as Record<string, unknown>;
        const name = resource.name;
        const type = resource.type;
        return type === 'topic' && name === '*';
      });

      if (hasWildcard) {
        affected.push(toAffected(user));
      }
    }

    if (affected.length === 0) {
      return { status: 'ok', affectedResources: [] };
    }
    return { status: 'warn', affectedResources: affected };
  },
};

// ---------------------------------------------------------------------------
// KFK-009: Topic has no consumer groups (info, kafka-exporter)
// ---------------------------------------------------------------------------

export const KFK_009: HealthRule = {
  id: 'KFK-009',
  category: 'kafka',
  severity: 'info',
  title: (result) => {
    const n = result.affectedResources.length;
    return n === 1
      ? `1 topic has no consumer groups (possibly orphaned)`
      : `${String(n)} topics have no consumer groups`;
  },
  evaluate(store: StateStore, context: string, caps: RuleCaps): RuleResult {
    const kafka = detectKafka(store, context);
    if (kafka.deploymentType === 'none') {
      return { status: 'skipped', affectedResources: [] };
    }
    if (!caps.kafkaExporter) {
      return { status: 'skipped', affectedResources: [] };
    }

    const topics = store.list(context, 'KafkaTopic');
    const groups = store.list(context, 'KafkaConsumerGroup');

    // Build set of topics referenced by consumer groups
    const topicsWithGroups = new Set<string>();
    for (const group of groups) {
      const spec = group.raw.spec;
      const topicName = spec?.topic;
      if (typeof topicName === 'string') {
        topicsWithGroups.add(`${group.namespace ?? ''}/${topicName}`);
      }
    }

    const affected: AffectedResource[] = [];
    for (const topic of topics) {
      if (isRuleSuppressed(topic.annotations, 'KFK-009')) {
        continue;
      }
      const key = `${topic.namespace ?? ''}/${topic.name}`;
      if (!topicsWithGroups.has(key)) {
        affected.push(toAffected(topic));
      }
    }

    if (affected.length === 0) {
      return { status: 'ok', affectedResources: [] };
    }
    return { status: 'warn', affectedResources: affected };
  },
};

// ---------------------------------------------------------------------------
// KFK-010: KRaft cluster running without persistent storage (warn, pod inspection)
// ---------------------------------------------------------------------------

export const KFK_010: HealthRule = {
  id: 'KFK-010',
  category: 'kafka',
  severity: 'warn',
  title: (result) => {
    const n = result.affectedResources.length;
    return n === 1
      ? `1 Kafka pod uses emptyDir volumes (no persistent storage)`
      : `${String(n)} Kafka pods use emptyDir volumes`;
  },
  evaluate(store: StateStore, context: string): RuleResult {
    const kafka = detectKafka(store, context);
    if (kafka.deploymentType === 'none') {
      return { status: 'skipped', affectedResources: [] };
    }

    const pods = store.list(context, 'Pod');
    const affected: AffectedResource[] = [];

    for (const pod of pods) {
      if (!hasAnyLabel(pod.labels, KAFKA_LABELS)) {
        continue;
      }
      if (isRuleSuppressed(pod.annotations, 'KFK-010')) {
        continue;
      }
      const spec = pod.raw.spec;
      const volumes = Array.isArray(spec?.volumes)
        ? (spec.volumes as Record<string, unknown>[])
        : [];
      const hasEmptyDir = volumes.some((v) => v.emptyDir !== undefined);
      if (hasEmptyDir) {
        affected.push(toAffected(pod));
      }
    }

    if (affected.length === 0) {
      return { status: 'ok', affectedResources: [] };
    }
    return { status: 'warn', affectedResources: affected };
  },
};

// ---------------------------------------------------------------------------
// KFK-011: Strimzi operator pod not running (error, pod inspection)
// ---------------------------------------------------------------------------

export const KFK_011: HealthRule = {
  id: 'KFK-011',
  category: 'kafka',
  severity: 'error',
  title: () =>
    `Strimzi operator pod not running (CRDs present but operator absent)`,
  evaluate(store: StateStore, context: string): RuleResult {
    if (!detectStrimzi(store, context)) {
      return { status: 'skipped', affectedResources: [] };
    }

    const pods = store.list(context, 'Pod');
    const operatorPods = pods.filter((pod) => {
      const name = pod.name.toLowerCase();
      const labels = pod.labels;
      return (
        name.includes('strimzi') ||
        labels.name === 'strimzi-cluster-operator' ||
        labels.app === 'strimzi' ||
        labels['app.kubernetes.io/name'] === 'strimzi-cluster-operator'
      );
    });

    if (operatorPods.length === 0) {
      return {
        status: 'error',
        affectedResources: [],
        detail: 'Strimzi CRDs found but no operator pod running',
      };
    }

    // Check if any operator pod is running
    const anyRunning = operatorPods.some(
      (pod) => pod.status.label === 'Running' || pod.status.color === 'green',
    );
    if (!anyRunning) {
      return {
        status: 'error',
        affectedResources: operatorPods.map(toAffected),
        detail: 'Strimzi operator pod not in Running state',
      };
    }
    return { status: 'ok', affectedResources: [] };
  },
};

// ---------------------------------------------------------------------------
// KFK-012: Kafka version is more than 2 minor versions behind (warn, Strimzi-only)
// ---------------------------------------------------------------------------

function parseMinorVersion(version: string): number | null {
  const [majorStr, minorStr] = version.split('.');
  // split always produces at least one element for majorStr.
  const major = Number(majorStr);
  const minor = Number(minorStr ?? '');
  if (isNaN(major) || isNaN(minor)) {
    return null;
  }
  return major * 100 + minor;
}

/** Pre-parsed numeric form of LATEST_KNOWN_KAFKA_VERSION (3*100+7 = 307). */
const LATEST_KNOWN_NUMERIC = 307;

export const KFK_012: HealthRule = {
  id: 'KFK-012',
  category: 'kafka',
  severity: 'warn',
  title: (result) => {
    const n = result.affectedResources.length;
    return n === 1
      ? `1 Kafka cluster is more than 2 minor versions behind latest known`
      : `${String(n)} Kafka clusters are more than 2 minor versions behind`;
  },
  evaluate(store: StateStore, context: string, caps: RuleCaps): RuleResult {
    if (!caps.strimziPresent) {
      return { status: 'skipped', affectedResources: [] };
    }

    const kafkaClusters = store.list(context, 'Kafka');
    const affected: AffectedResource[] = [];
    const latestNumeric = LATEST_KNOWN_NUMERIC;

    for (const cluster of kafkaClusters) {
      if (isRuleSuppressed(cluster.annotations, 'KFK-012')) {
        continue;
      }
      const spec = cluster.raw.spec;
      const kafka = (spec?.kafka ?? {}) as Record<string, unknown>;
      const version = kafka.version;
      if (typeof version !== 'string') {
        continue;
      }
      const clusterNumeric = parseMinorVersion(version);
      if (clusterNumeric === null) {
        continue;
      }
      if (latestNumeric - clusterNumeric > 2) {
        affected.push(toAffected(cluster));
      }
    }

    if (affected.length === 0) {
      return { status: 'ok', affectedResources: [] };
    }
    return { status: 'warn', affectedResources: affected };
  },
};

// ---------------------------------------------------------------------------
// KFK-013: Kafka detected but no lag metrics (info)
// ---------------------------------------------------------------------------

export const KFK_013: HealthRule = {
  id: 'KFK-013',
  category: 'kafka',
  severity: 'info',
  title: () =>
    `Kafka detected but no lag metrics exported — consumer lag monitoring unavailable`,
  evaluate(store: StateStore, context: string, caps: RuleCaps): RuleResult {
    const kafka = detectKafka(store, context);
    if (kafka.deploymentType === 'none') {
      return { status: 'skipped', affectedResources: [] };
    }
    if (caps.kafkaExporter) {
      return { status: 'ok', affectedResources: [] };
    }
    return {
      status: 'warn',
      affectedResources: [],
      detail:
        'Kafka Exporter not deployed — consumer lag monitoring unavailable',
    };
  },
};
