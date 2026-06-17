/**
 * context-memory.ts — pure per-context UI memory (navigation-overhaul chunk 08 /
 * B08).
 *
 * Spec: `specs/002-navigation-overhaul/08-context-switching-polish.md` §4
 * ("Per-context memory") and "Where the logic lives".
 *
 * p9r remembers, **per kube context**, the `{ namespace, activeKind }` the user
 * was last looking at, so switching back and forth does not reset them to
 * Overview / all-namespaces every time. This module owns:
 *
 *  - the map type and its `layout.json` (de)serialization shape (tolerant of the
 *    old schema that had no `contexts` key — it yields an empty map, never
 *    throws);
 *  - `remember(...)` — record the outgoing context's values immutably;
 *  - `restore(...)` — read the incoming context's values, **validated** against
 *    the new cluster (a remembered kind/namespace that no longer exists falls
 *    back to Overview / all-namespaces).
 *
 * It is pure (no I/O, no clock) and 100% covered. The controller does the
 * file I/O and the actual table/stream swap; it carries no validation logic of
 * its own.
 */

/** The all-namespaces sentinel and the Overview-kind fallback. */
export const ALL_NAMESPACES = '';
export const OVERVIEW_KIND = 'Overview';

/** What is remembered for one context. */
export interface ContextMemoryEntry {
  /** Namespace filter (`""` = all namespaces). */
  readonly namespace: string;
  /** Active resource kind label (e.g. `"Deployments"`, or `"Overview"`). */
  readonly activeKind: string;
}

/** Per-context memory keyed by context name. */
export type ContextMemory = Readonly<Record<string, ContextMemoryEntry>>;

/** The validity inputs for a restore against the (possibly different) cluster. */
export interface RestoreContext {
  /**
   * The kind labels that exist for the target context. `Overview` is always
   * implicitly available and need not be listed.
   */
  readonly availableKinds: readonly string[];
  /**
   * The namespaces that exist for the target context. When empty (namespaces
   * have not loaded yet) a remembered namespace cannot be validated and the
   * restore falls back to all-namespaces.
   */
  readonly availableNamespaces: readonly string[];
}

/** The default entry when a context has never been remembered. */
export function defaultEntry(): ContextMemoryEntry {
  return { namespace: ALL_NAMESPACES, activeKind: OVERVIEW_KIND };
}

/**
 * Return a new map with `ctx`'s remembered `{ namespace, activeKind }` set to
 * `entry`. The input map is never mutated.
 */
export function remember(
  map: ContextMemory,
  ctx: string,
  entry: ContextMemoryEntry,
): ContextMemory {
  return {
    ...map,
    [ctx]: { namespace: entry.namespace, activeKind: entry.activeKind },
  };
}

/**
 * Read `ctx`'s remembered values, validated against `available`:
 *
 *  - no entry for `ctx` → default (`Overview` / all-namespaces);
 *  - a remembered `activeKind` other than `Overview` is kept only if it is in
 *    `availableKinds`, else falls back to `Overview`;
 *  - a remembered non-empty `namespace` is kept only if it is in
 *    `availableNamespaces`, else falls back to all-namespaces.
 */
export function restore(
  map: ContextMemory,
  ctx: string,
  available: RestoreContext,
): ContextMemoryEntry {
  const entry = map[ctx];
  if (entry === undefined) {
    return defaultEntry();
  }
  const activeKind =
    entry.activeKind === OVERVIEW_KIND ||
    available.availableKinds.includes(entry.activeKind)
      ? entry.activeKind
      : OVERVIEW_KIND;
  const namespace =
    entry.namespace !== ALL_NAMESPACES &&
    available.availableNamespaces.includes(entry.namespace)
      ? entry.namespace
      : ALL_NAMESPACES;
  return { namespace, activeKind };
}

/**
 * Parse the `contexts` value read from `layout.json` into a `ContextMemory`,
 * tolerating the old schema. Anything that is not an object of well-formed
 * entries is dropped silently (a missing/old `contexts` key yields `{}`); a
 * partially-malformed map keeps only its valid entries. Never throws.
 */
export function parseContextMemory(raw: unknown): ContextMemory {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  const out: Record<string, ContextMemoryEntry> = {};
  for (const [ctx, value] of Object.entries(raw as Record<string, unknown>)) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      continue;
    }
    const { namespace, activeKind } = value as {
      namespace?: unknown;
      activeKind?: unknown;
    };
    if (typeof namespace === 'string' && typeof activeKind === 'string') {
      out[ctx] = { namespace, activeKind };
    }
  }
  return out;
}

/**
 * Serialize a `ContextMemory` into a plain JSON object for `layout.json`. The
 * inverse of {@link parseContextMemory} for well-formed maps.
 */
export function serializeContextMemory(
  map: ContextMemory,
): Record<string, ContextMemoryEntry> {
  const out: Record<string, ContextMemoryEntry> = {};
  for (const [ctx, entry] of Object.entries(map)) {
    out[ctx] = { namespace: entry.namespace, activeKind: entry.activeKind };
  }
  return out;
}
