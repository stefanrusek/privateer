import type { KubernetesObject, ResourceEvent } from '../core/types.js';
import type { Result } from '../core/result.js';

/**
 * KubeClient boundary (Spec 01 §3.1, Spec 08 §5.1). The single seam to the
 * Kubernetes API. The production adapter wraps `@kubernetes/client-node`;
 * `FakeKubeClient` serves in-memory resources and scripted watch events.
 *
 * Mutating and fetching operations return `Result`s so expected API failures
 * (403, 404, 409) are typed values, not exceptions (Spec 08 §6.4).
 */
export interface KubeClient {
  /** Contexts available in the loaded kubeconfig. */
  listContexts(): KubeContext[];

  /** The currently active context name. */
  currentContext(): string;

  /**
   * Open a watch on a resource kind. Events are delivered to the handler in
   * arrival order; the returned subscription stops the watch when closed.
   */
  watch(
    kind: string,
    options: WatchOptions,
    handler: WatchHandler,
  ): WatchSubscription;

  /** Metadata-only LIST for sidebar badge counts (Spec 01 §3.1, on-demand kinds). */
  list(
    kind: string,
    options: ListOptions,
  ): Promise<Result<ListPage, KubeError>>;

  /** Fetch a single resource's full body. */
  get(
    kind: string,
    name: string,
    namespace: string | null,
  ): Promise<Result<KubernetesObject, KubeError>>;

  /** Replace (PUT) a resource. 409 on stale resourceVersion (Spec 04 §6.3). */
  replace(
    object: KubernetesObject,
  ): Promise<Result<KubernetesObject, KubeError>>;

  /** Delete a resource (foreground cascade — Spec 05 §6.4). */
  delete(
    kind: string,
    name: string,
    namespace: string | null,
  ): Promise<Result<void, KubeError>>;

  /** Discover served CRDs via apiextensions (Spec 03 §7). */
  discoverCrds(): Promise<Result<CrdDefinition[], KubeError>>;

  /** On-demand LIST of Events for a resource or namespace (Spec 01 §3.1, M6). */
  listEvents(
    selector: EventSelector,
  ): Promise<Result<KubernetesObject[], KubeError>>;
}

export interface KubeContext {
  name: string;
  cluster: string;
  user: string;
}

export interface WatchOptions {
  namespace?: string;
  fieldSelector?: string;
  /** Resume from this resourceVersion after a reconnect (Spec 01 §3.1). */
  resourceVersion?: string;
}

export interface ListOptions {
  namespace?: string;
  /** When true, request metadata-only objects (PartialObjectMetadata). */
  metadataOnly?: boolean;
  limit?: number;
}

export interface ListPage {
  items: KubernetesObject[];
  resourceVersion: string;
  /** Server-reported count of items not returned (for badge totals). */
  remainingItemCount: number | null;
}

export interface EventSelector {
  namespace?: string;
  involvedObjectName?: string;
  involvedObjectKind?: string;
  type?: 'Warning' | 'Normal';
}

export interface CrdDefinition {
  group: string;
  kind: string;
  plural: string;
  /** true if namespaced, false if cluster-scoped. */
  namespaced: boolean;
  versions: string[];
}

export type WatchHandler = (event: ResourceEvent) => void;

export interface WatchSubscription {
  /** Stop the watch and release server-side resources. Idempotent. */
  close(): void;
  /** Register a callback for stream errors/drops (Spec 01 §3.1 reconnect). */
  onError(handler: (error: KubeError) => void): void;
}

/** A typed Kubernetes API failure. */
export interface KubeError {
  kind: KubeErrorKind;
  message: string;
  /** HTTP status code when the failure came from the API server. */
  statusCode?: number;
}

export type KubeErrorKind =
  | 'forbidden' // 401/403
  | 'notFound' // 404
  | 'conflict' // 409 (stale resourceVersion)
  | 'streamDropped'
  | 'network'
  | 'unknown';
