/**
 * Derived state rollups (Spec 01 §3.3) — pure functions that compute status
 * summaries from a slice of stored ResourceObjects. No side-effects; no Map
 * mutations; always deterministic given the same input.
 */

import type { ResourceObject, StatusColor } from '../core/types.js';

/** Count of resources per StatusColor. */
export interface StatusCounts {
  green: number;
  yellow: number;
  red: number;
  grey: number;
}

function emptyCounts(): StatusCounts {
  return { green: 0, yellow: 0, red: 0, grey: 0 };
}

function increment(counts: StatusCounts, color: StatusColor): void {
  counts[color] += 1;
}

// ---------------------------------------------------------------------------
// Namespace rollup
// ---------------------------------------------------------------------------

export interface NamespaceRollup {
  namespace: string;
  counts: StatusCounts;
  total: number;
}

/**
 * For each namespace present in `resources`, compute the aggregate StatusCounts
 * across all resources in that namespace.
 */
export function rollupByNamespace(
  resources: readonly ResourceObject[],
): Map<string, NamespaceRollup> {
  const result = new Map<string, NamespaceRollup>();

  for (const obj of resources) {
    const ns = obj.namespace ?? '~';
    let rollup = result.get(ns);
    if (rollup === undefined) {
      rollup = { namespace: ns, counts: emptyCounts(), total: 0 };
      result.set(ns, rollup);
    }
    increment(rollup.counts, obj.status.color);
    rollup.total += 1;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Node rollup
// ---------------------------------------------------------------------------

export interface NodeRollup {
  nodeName: string;
  counts: StatusCounts;
  total: number;
}

/**
 * For each node referenced by the `nodeName` field on stored objects (Pods
 * carry `spec.nodeName`), compute the aggregate StatusCounts.
 */
export function rollupByNode(
  resources: readonly ResourceObject[],
): Map<string, NodeRollup> {
  const result = new Map<string, NodeRollup>();

  for (const obj of resources) {
    const spec = obj.raw.spec;
    if (spec === undefined) {
      continue;
    }
    const nodeName = spec.nodeName;
    if (typeof nodeName !== 'string' || nodeName.length === 0) {
      continue;
    }
    let rollup = result.get(nodeName);
    if (rollup === undefined) {
      rollup = { nodeName, counts: emptyCounts(), total: 0 };
      result.set(nodeName, rollup);
    }
    increment(rollup.counts, obj.status.color);
    rollup.total += 1;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Workload rollup
// ---------------------------------------------------------------------------

/** Workload = any owner-referenced pod group (Deployment, StatefulSet, …). */
export interface WorkloadRollup {
  /** Composite key: "<ownerKind>/<namespace>/<ownerName>" */
  key: string;
  ownerKind: string;
  ownerName: string;
  namespace: string | null;
  counts: StatusCounts;
  total: number;
}

/**
 * Groups resources by their first controller owner reference and sums counts.
 * Resources with no ownerReferences are grouped under a synthetic
 * "Standalone/<namespace>/<name>" key.
 */
export function rollupByWorkload(
  resources: readonly ResourceObject[],
): Map<string, WorkloadRollup> {
  const result = new Map<string, WorkloadRollup>();

  for (const obj of resources) {
    const ownerRefs = obj.raw.metadata?.ownerReferences ?? [];
    const controller = ownerRefs.find((r) => r.controller === true);
    let key: string;
    let ownerKind: string;
    let ownerName: string;

    if (controller !== undefined) {
      ownerKind = controller.kind;
      ownerName = controller.name;
      key = `${ownerKind}/${obj.namespace ?? '~'}/${ownerName}`;
    } else {
      ownerKind = 'Standalone';
      ownerName = obj.name;
      key = `Standalone/${obj.namespace ?? '~'}/${obj.name}`;
    }

    let rollup = result.get(key);
    if (rollup === undefined) {
      rollup = {
        key,
        ownerKind,
        ownerName,
        namespace: obj.namespace,
        counts: emptyCounts(),
        total: 0,
      };
      result.set(key, rollup);
    }
    increment(rollup.counts, obj.status.color);
    rollup.total += 1;
  }

  return result;
}
