/**
 * Normalize a raw KubernetesObject into the canonical ResourceObject (Spec 03 §2).
 * Pure function — no I/O, no Date.now, no randomness.
 */

import type { KubernetesObject, ResourceObject } from '../core/types.js';
import { resolveStatus } from './status/index.js';

export function normalize(raw: KubernetesObject): ResourceObject {
  const meta = raw.metadata ?? {};
  const kind = raw.kind ?? '';
  const apiVersion = raw.apiVersion ?? '';
  const name = meta.name ?? '';
  const namespace = meta.namespace ?? null;
  const uid = meta.uid ?? '';
  const resourceVersion = meta.resourceVersion ?? '';
  const creationTimestamp = meta.creationTimestamp ?? '';
  const labels = meta.labels ?? {};
  const annotations = meta.annotations ?? {};

  const status = resolveStatus(kind, raw);

  return {
    uid,
    kind,
    apiVersion,
    name,
    namespace,
    labels,
    annotations,
    creationTimestamp,
    resourceVersion,
    status,
    raw,
  };
}
