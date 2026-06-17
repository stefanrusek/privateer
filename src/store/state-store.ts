/**
 * State Store (Spec 01 §3.3) — Map-based reactive store.
 *
 * Structure: clusters → <context> → resources → <kind>/<ns>/<name> → ResourceObject
 *
 * - Mutations are synchronous.
 * - Subscriber notifications are async (coalesced into a single microtask per
 *   mutation batch — never block the event loop).
 * - managedFields and the kubectl last-applied annotation are stripped before
 *   storing to keep memory low on large clusters.
 */

import type {
  ResourceEvent,
  ResourceObject,
  KubernetesObject,
  ObjectMeta,
} from '../core/types.js';

export type StoreListener = () => void;
export type Unsubscribe = () => void;

/**
 * Mapper injected at construction time. Converts a ResourceEvent into the
 * canonical ResourceObject stored in the map. Status resolution is a separate
 * chunk — provide a stub for tests.
 */
export type ResourceMapper = (event: ResourceEvent) => ResourceObject;

/** Key used to look up a resource inside a context. */
function resourceKey(
  kind: string,
  namespace: string | null,
  name: string,
): string {
  return `${kind}/${namespace ?? '~'}/${name}`;
}

/**
 * Strip fields that must not be persisted (Spec 01 §3.1/§3.3):
 *   - metadata.managedFields
 *   - metadata.annotations['kubectl.kubernetes.io/last-applied-configuration']
 *
 * Returns a new object; the original is not mutated.
 */
export function stripHeavyFields(obj: KubernetesObject): KubernetesObject {
  const meta = obj.metadata;
  if (meta === undefined) {
    return obj;
  }

  // Build a new metadata without managedFields, and without the annotation
  // if it was present.
  const { managedFields: _mf, annotations, ...restMeta } = meta;

  // Compute filtered annotations (undefined means omit the property entirely).
  let filteredAnnotations: Record<string, string> | undefined;
  if (annotations !== undefined) {
    const {
      'kubectl.kubernetes.io/last-applied-configuration': _la,
      ...restAnnotations
    } = annotations;
    if (Object.keys(restAnnotations).length > 0) {
      filteredAnnotations = restAnnotations;
    }
    // If no annotations remain, omit the property (exactOptionalPropertyTypes).
  }

  const strippedMeta: ObjectMeta =
    filteredAnnotations !== undefined
      ? { ...restMeta, annotations: filteredAnnotations }
      : { ...restMeta };

  return { ...obj, metadata: strippedMeta };
}

/** Per-context resource map. */
type ContextStore = Map<string, ResourceObject>;

export class StateStore {
  private readonly contexts = new Map<string, ContextStore>();
  private readonly listeners = new Set<StoreListener>();
  private notifyScheduled = false;

  constructor(private readonly mapper: ResourceMapper) {}

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  /**
   * Apply a ResourceEvent. Upserts on ADDED/MODIFIED, deletes on DELETED.
   * Triggers an async (microtask) notification to subscribers.
   */
  applyEvent(contextName: string, event: ResourceEvent): void {
    const ctx = this.getOrCreateContext(contextName);
    const key = resourceKey(event.kind, event.namespace, event.name);

    switch (event.type) {
      case 'ADDED':
      case 'MODIFIED': {
        const stripped: ResourceEvent = {
          ...event,
          object: stripHeavyFields(event.object),
        };
        const obj = this.mapper(stripped);
        ctx.set(key, obj);
        break;
      }
      case 'DELETED': {
        ctx.delete(key);
        break;
      }
    }

    this.scheduleNotify();
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  /** Retrieve a single resource by kind/namespace/name, or undefined. */
  get(
    contextName: string,
    kind: string,
    namespace: string | null,
    name: string,
  ): ResourceObject | undefined {
    const ctx = this.contexts.get(contextName);
    if (ctx === undefined) {
      return undefined;
    }
    return ctx.get(resourceKey(kind, namespace, name));
  }

  /**
   * List all resources of `kind` in `contextName`. Optionally filter by
   * namespace; pass `undefined` to return all namespaces.
   */
  list(
    contextName: string,
    kind: string,
    namespace?: string,
  ): ResourceObject[] {
    const ctx = this.contexts.get(contextName);
    if (ctx === undefined) {
      return [];
    }
    const result: ResourceObject[] = [];
    for (const obj of ctx.values()) {
      if (obj.kind !== kind) {
        continue;
      }
      if (namespace !== undefined && obj.namespace !== namespace) {
        continue;
      }
      result.push(obj);
    }
    return result;
  }

  /** Return all stored ResourceObjects across all kinds in a context. */
  all(contextName: string): ResourceObject[] {
    const ctx = this.contexts.get(contextName);
    if (ctx === undefined) {
      return [];
    }
    return [...ctx.values()];
  }

  /**
   * Reconcile the store against a fresh LIST result for a single `kind`.
   *
   * `present` is the set of `${namespace ?? '~'}/${name}` identities returned by
   * the fresh LIST. Any stored resource of `kind` (optionally narrowed to
   * `namespace`) whose identity is **not** in `present` is removed — it was
   * deleted on the cluster while we were not watching (a missed DELETED event).
   *
   * This is the prune half of a refresh: callers upsert the fresh items via
   * {@link applyEvent} (ADDED), then call this to drop the stragglers. Returns
   * the removed ResourceObjects (for the table model to also prune). Schedules a
   * single notification when anything was removed.
   */
  reconcileList(
    contextName: string,
    kind: string,
    present: ReadonlySet<string>,
    namespace?: string,
  ): ResourceObject[] {
    const ctx = this.contexts.get(contextName);
    if (ctx === undefined) {
      return [];
    }
    const removed: ResourceObject[] = [];
    for (const [key, obj] of ctx) {
      if (obj.kind !== kind) {
        continue;
      }
      if (namespace !== undefined && obj.namespace !== namespace) {
        continue;
      }
      const identity = `${obj.namespace ?? '~'}/${obj.name}`;
      if (!present.has(identity)) {
        ctx.delete(key);
        removed.push(obj);
      }
    }
    if (removed.length > 0) {
      this.scheduleNotify();
    }
    return removed;
  }

  // ---------------------------------------------------------------------------
  // Subscriptions
  // ---------------------------------------------------------------------------

  /**
   * Register a listener that will be called (asynchronously, via microtask)
   * whenever the store changes. Multiple synchronous mutations coalesce into
   * a single notification.
   *
   * Returns an unsubscribe function.
   */
  subscribe(listener: StoreListener): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private getOrCreateContext(name: string): ContextStore {
    let ctx = this.contexts.get(name);
    if (ctx === undefined) {
      ctx = new Map();
      this.contexts.set(name, ctx);
    }
    return ctx;
  }

  private scheduleNotify(): void {
    if (this.notifyScheduled) {
      return;
    }
    this.notifyScheduled = true;
    queueMicrotask(() => {
      this.notifyScheduled = false;
      for (const listener of this.listeners) {
        listener();
      }
    });
  }
}
