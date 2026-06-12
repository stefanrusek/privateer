/**
 * Kafka detection — Strimzi vs bare, KRaft vs ZooKeeper (Spec 06 §7).
 *
 * All functions are pure over the State Store snapshot.
 */

import type { StateStore } from '../store/state-store.js';

export type KafkaDeploymentType = 'strimzi' | 'bare' | 'none';
export type KafkaModeType = 'kraft' | 'zookeeper' | 'unknown';

export interface KafkaDetectionResult {
  deploymentType: KafkaDeploymentType;
  mode: KafkaModeType;
}

/** Labels that indicate a bare Kafka pod/statefulset. */
const KAFKA_LABELS: readonly (readonly [string, string])[] = [
  ['app', 'kafka'],
  ['app.kubernetes.io/name', 'kafka'],
  ['app.kubernetes.io/component', 'kafka'],
];

/** Labels that indicate ZooKeeper pods. */
const ZOOKEEPER_LABELS: readonly (readonly [string, string])[] = [
  ['app', 'zookeeper'],
  ['app.kubernetes.io/name', 'zookeeper'],
];

function hasLabel(
  labels: Record<string, string>,
  key: string,
  value: string,
): boolean {
  return labels[key] === value;
}

function hasAnyLabel(
  labels: Record<string, string>,
  pairs: readonly (readonly [string, string])[],
): boolean {
  return pairs.some(([k, v]) => hasLabel(labels, k, v));
}

/**
 * Detect whether Strimzi CRDs are present. Checks for CRD resources with
 * group `kafka.strimzi.io` in the store.
 *
 * In practice the store holds CustomResourceDefinition objects; we look for
 * any resource whose `spec.group` is `kafka.strimzi.io`, which is how CRDs
 * appear once loaded into the store.
 */
export function detectStrimzi(store: StateStore, context: string): boolean {
  const crds = store.list(context, 'CustomResourceDefinition');
  for (const crd of crds) {
    const spec = crd.raw.spec;
    const group = spec?.group;
    if (group === 'kafka.strimzi.io') {
      return true;
    }
  }
  return false;
}

/**
 * Detect bare Kafka pods/statefulsets via label patterns.
 * Returns true if any matching resource found.
 */
export function detectBareKafka(store: StateStore, context: string): boolean {
  const pods = store.list(context, 'Pod');
  for (const pod of pods) {
    if (hasAnyLabel(pod.labels, KAFKA_LABELS)) {
      return true;
    }
  }

  const statefulSets = store.list(context, 'StatefulSet');
  for (const ss of statefulSets) {
    if (hasAnyLabel(ss.labels, KAFKA_LABELS)) {
      return true;
    }
  }

  return false;
}

/**
 * Detect ZooKeeper presence (ZooKeeper pods/services with matching labels).
 */
export function detectZooKeeper(store: StateStore, context: string): boolean {
  const pods = store.list(context, 'Pod');
  for (const pod of pods) {
    if (hasAnyLabel(pod.labels, ZOOKEEPER_LABELS)) {
      return true;
    }
  }
  return false;
}

/**
 * Full Kafka detection result (Spec 06 §7).
 * - Strimzi takes priority over bare detection.
 * - KRaft: no ZooKeeper pods present.
 * - ZooKeeper: ZooKeeper pods present.
 */
export function detectKafka(
  store: StateStore,
  context: string,
): KafkaDetectionResult {
  const isStrimzi = detectStrimzi(store, context);
  const isBare = !isStrimzi && detectBareKafka(store, context);

  if (!isStrimzi && !isBare) {
    return { deploymentType: 'none', mode: 'unknown' };
  }

  const deploymentType: KafkaDeploymentType = isStrimzi ? 'strimzi' : 'bare';
  const hasZooKeeper = detectZooKeeper(store, context);
  const mode: KafkaModeType = hasZooKeeper ? 'zookeeper' : 'kraft';

  return { deploymentType, mode };
}

/**
 * Get Kafka broker count by inspecting pods/statefulsets with Kafka labels.
 * Used by KFK-007.
 */
export function getKafkaBrokerCount(
  store: StateStore,
  context: string,
): number {
  // Try StatefulSet replicas first
  const statefulSets = store.list(context, 'StatefulSet');
  for (const ss of statefulSets) {
    if (hasAnyLabel(ss.labels, KAFKA_LABELS)) {
      const spec = ss.raw.spec;
      const replicas = spec?.replicas;
      if (typeof replicas === 'number') {
        return replicas;
      }
    }
  }

  // Fall back to pod count
  const pods = store.list(context, 'Pod');
  let count = 0;
  for (const pod of pods) {
    if (hasAnyLabel(pod.labels, KAFKA_LABELS)) {
      count++;
    }
  }
  return count;
}
