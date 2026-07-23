/**
 * `metadata.managedFields` display filtering.
 * P9R-0016: managedFields clutter dominates small resources (a fresh
 * ConfigMap's 22-line YAML was ~70% managedFields). Hidden by default in
 * read mode, toggled visible with the `[managed]` toolbar chip / `m` key
 * (session-scoped, display-only) — the edit buffer always carries the full
 * `managedFields` block regardless of display state, so a save round-trips
 * it intact.
 */

import jsYaml from 'js-yaml';
import { canonicalKeyOrder } from './canonical-order.js';

/** True when the parsed YAML has a non-empty `metadata.managedFields`. */
export function hasManagedFields(yaml: string): boolean {
  const meta = parseMetadata(yaml);
  return meta !== null && 'managedFields' in meta;
}

/**
 * Return the YAML with `metadata.managedFields` removed, for display only.
 * Returns the original string unchanged if there is no `managedFields` to
 * strip (or the YAML doesn't parse — validation is elsewhere).
 */
export function hideManagedFields(yaml: string): string {
  let doc: unknown;
  try {
    doc = jsYaml.load(yaml);
  } catch {
    return yaml;
  }
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    return yaml;
  }
  const obj = doc as Record<string, unknown>;
  const meta = obj.metadata;
  if (meta === null || typeof meta !== 'object' || Array.isArray(meta)) {
    return yaml;
  }
  const metaObj = meta as Record<string, unknown>;
  if (!('managedFields' in metaObj)) {
    return yaml;
  }
  const { managedFields: _mf, ...restMeta } = metaObj;
  const result = canonicalKeyOrder({ ...obj, metadata: restMeta });
  return jsYaml.dump(result, { lineWidth: -1, indent: 2 });
}

function parseMetadata(yaml: string): Record<string, unknown> | null {
  let doc: unknown;
  try {
    doc = jsYaml.load(yaml);
  } catch {
    return null;
  }
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    return null;
  }
  const meta = (doc as Record<string, unknown>).metadata;
  if (meta === null || typeof meta !== 'object' || Array.isArray(meta)) {
    return null;
  }
  return meta as Record<string, unknown>;
}
