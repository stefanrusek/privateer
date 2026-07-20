import type { KubernetesObject, ResourceEvent } from '../core/types.js';
import { type Result, ok, err } from '../core/result.js';
import type {
  KubeClient,
  KubeContext,
  KubeError,
  WatchOptions,
  WatchHandler,
  WatchSubscription,
  ListOptions,
  ListPage,
  EventSelector,
  CrdDefinition,
} from './kube-client.js';

interface FakeKubeClientOptions {
  contexts?: KubeContext[];
  currentContext?: string;
  crds?: CrdDefinition[];
  events?: KubernetesObject[];
  clock?: () => number;
}

interface ActiveWatch {
  kind: string;
  options: WatchOptions;
  handler: WatchHandler;
  errorHandlers: ((error: KubeError) => void)[];
  closed: boolean;
}

function keyOf(kind: string, namespace: string | null, name: string): string {
  return `${kind}/${namespace ?? '~'}/${name}`;
}

/**
 * In-memory KubeClient for unit and behavior tests. Holds resources in a Map,
 * dispatches scripted watch events, and models 403/404/409 as typed results.
 */
export class FakeKubeClient implements KubeClient {
  private contexts: KubeContext[];
  private context: string;
  private crds: CrdDefinition[];
  private events: KubernetesObject[];
  private now: () => number;
  private resources = new Map<string, KubernetesObject>();
  private watches = new Set<ActiveWatch>();
  private forbiddenKinds = new Set<string>();

  constructor(options: FakeKubeClientOptions = {}) {
    this.contexts = options.contexts ?? [
      { name: 'fake', cluster: 'fake-cluster', user: 'fake-user' },
    ];
    this.context = options.currentContext ?? this.contexts[0]?.name ?? 'fake';
    this.crds = options.crds ?? [];
    this.events = options.events ?? [];
    this.now = options.clock ?? ((): number => 0);
  }

  listContexts(): KubeContext[] {
    return [...this.contexts];
  }

  currentContext(): string {
    return this.context;
  }

  watch(
    kind: string,
    options: WatchOptions,
    handler: WatchHandler,
  ): WatchSubscription {
    const active: ActiveWatch = {
      kind,
      options,
      handler,
      errorHandlers: [],
      closed: false,
    };
    this.watches.add(active);
    return {
      close: (): void => {
        active.closed = true;
        this.watches.delete(active);
      },
      onError: (h): void => {
        active.errorHandlers.push(h);
      },
    };
  }

  async list(
    kind: string,
    options: ListOptions,
  ): Promise<Result<ListPage, KubeError>> {
    if (this.forbiddenKinds.has(kind)) {
      return err(this.forbidden(kind));
    }
    const items = [...this.resources.values()].filter(
      (o) =>
        o.kind === kind &&
        (options.namespace === undefined ||
          o.metadata?.namespace === options.namespace),
    );
    return Promise.resolve(
      ok({ items, resourceVersion: '1', remainingItemCount: null }),
    );
  }

  async get(
    kind: string,
    name: string,
    namespace: string | null,
  ): Promise<Result<KubernetesObject, KubeError>> {
    if (this.forbiddenKinds.has(kind)) {
      return err(this.forbidden(kind));
    }
    const found = this.resources.get(keyOf(kind, namespace, name));
    if (found === undefined) {
      return err({
        kind: 'notFound',
        message: `${kind} ${name} not found`,
        statusCode: 404,
      });
    }
    return Promise.resolve(ok(found));
  }

  async replace(
    object: KubernetesObject,
  ): Promise<Result<KubernetesObject, KubeError>> {
    const kind = object.kind ?? '';
    const name = object.metadata?.name ?? '';
    const namespace = object.metadata?.namespace ?? null;
    const existing = this.resources.get(keyOf(kind, namespace, name));
    if (existing === undefined) {
      return err({
        kind: 'notFound',
        message: `${kind} ${name} not found`,
        statusCode: 404,
      });
    }
    if (
      existing.metadata?.resourceVersion !== object.metadata?.resourceVersion
    ) {
      return err({
        kind: 'conflict',
        message: 'resourceVersion mismatch',
        statusCode: 409,
      });
    }
    const next: KubernetesObject = {
      ...object,
      metadata: {
        ...object.metadata,
        resourceVersion: String(Number(object.metadata?.resourceVersion) + 1),
      },
    };
    this.resources.set(keyOf(kind, namespace, name), next);
    return Promise.resolve(ok(next));
  }

  async delete(
    kind: string,
    name: string,
    namespace: string | null,
  ): Promise<Result<void, KubeError>> {
    const key = keyOf(kind, namespace, name);
    if (!this.resources.has(key)) {
      return err({
        kind: 'notFound',
        message: `${kind} ${name} not found`,
        statusCode: 404,
      });
    }
    this.resources.delete(key);
    return Promise.resolve(ok(undefined));
  }

  async discoverCrds(): Promise<Result<CrdDefinition[], KubeError>> {
    return Promise.resolve(ok([...this.crds]));
  }

  async listEvents(
    selector: EventSelector,
  ): Promise<Result<KubernetesObject[], KubeError>> {
    const filtered = this.events.filter((e) => {
      const involved = (e.involvedObject ?? {}) as Record<string, unknown>;
      if (
        selector.involvedObjectName !== undefined &&
        involved.name !== selector.involvedObjectName
      ) {
        return false;
      }
      if (selector.type !== undefined && e.type !== selector.type) {
        return false;
      }
      return true;
    });
    return Promise.resolve(ok(filtered));
  }

  // ---- test-driving helpers -------------------------------------------------

  /** Seed a resource into the store (also resolvable via get/list). */
  seed(object: KubernetesObject): void {
    const kind = object.kind ?? '';
    const name = object.metadata?.name ?? '';
    const namespace = object.metadata?.namespace ?? null;
    this.resources.set(keyOf(kind, namespace, name), object);
  }

  /** Mark a kind as RBAC-forbidden so get/list return a 403. */
  forbid(kind: string): void {
    this.forbiddenKinds.add(kind);
  }

  /** Reverse {@link forbid}. */
  unforbid(kind: string): void {
    this.forbiddenKinds.delete(kind);
  }

  /** The WatchOptions of the most recent watch() call for `kind`, if any. */
  lastWatchOptions(kind: string): WatchOptions | undefined {
    let latest: WatchOptions | undefined;
    for (const watch of this.watches) {
      if (watch.kind === kind) {
        latest = watch.options;
      }
    }
    return latest;
  }

  /** Emit a scripted watch event to all matching open watches. */
  emit(event: Omit<ResourceEvent, 'receivedAt'>): void {
    const full: ResourceEvent = { ...event, receivedAt: this.now() };
    for (const watch of this.watches) {
      if (watch.closed || watch.kind !== event.kind) {
        continue;
      }
      const ns = watch.options.namespace;
      if (ns !== undefined && ns !== event.namespace) {
        continue;
      }
      watch.handler(full);
    }
  }

  /** Drive a stream error/drop to all matching open watches. */
  emitError(kind: string, error: KubeError): void {
    for (const watch of this.watches) {
      if (watch.closed || watch.kind !== kind) {
        continue;
      }
      for (const handler of watch.errorHandlers) {
        handler(error);
      }
    }
  }

  /** Count of currently open watches — for stream-lifecycle assertions. */
  openWatchCount(): number {
    return this.watches.size;
  }

  private forbidden(kind: string): KubeError {
    return {
      kind: 'forbidden',
      message: `forbidden: cannot access ${kind}`,
      statusCode: 403,
    };
  }
}
