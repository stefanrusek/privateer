/**
 * Canonical key order for Kubernetes object YAML.
 * P9R-0016: key order varied by kind (Pods rendered `apiVersion`/`kind`
 * first; ConfigMaps/Secrets rendered them last, after `metadata`) — this is
 * disorienting and non-conventional. One canonical order is applied before
 * every render AND before every diff, so reordering alone never shows up as
 * a change (both sides of a diff are normalized the same way).
 */

/** Keys pinned to the front, in this order, when present. */
const FRONT_KEYS: readonly string[] = ['apiVersion', 'kind', 'metadata'];

/** Keys pinned to the back, in this order, when present. */
const BACK_KEYS: readonly string[] = ['status'];

/**
 * Reorder a Kubernetes object's top-level keys to the canonical
 * `apiVersion, kind, metadata, spec/data, status` order. Keys not in the
 * front/back lists (e.g. `spec`, `data`, `stringData`, `binaryData`) keep
 * their relative order and sit in between. Non-object input is returned
 * unchanged (defensive — real k8s objects are always maps at the top level).
 */
export function canonicalKeyOrder<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return obj;
  }
  const rec = obj as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of FRONT_KEYS) {
    if (key in rec) {
      result[key] = rec[key];
    }
  }
  for (const key of Object.keys(rec)) {
    if (!FRONT_KEYS.includes(key) && !BACK_KEYS.includes(key)) {
      result[key] = rec[key];
    }
  }
  for (const key of BACK_KEYS) {
    if (key in rec) {
      result[key] = rec[key];
    }
  }
  return result as T;
}
