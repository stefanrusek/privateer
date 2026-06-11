/**
 * Real KubeClient adapter — wraps @kubernetes/client-node (Spec 01 §3.1,
 * Spec 08 §5.2). Contains no business logic; maps SDK calls/errors to the
 * typed KubeClient interface. Covered by @envtest, not unit tests.
 */

/* eslint-disable @typescript-eslint/no-unsafe-member-access -- SDK response bodies lack precise types */
/* eslint-disable @typescript-eslint/no-explicit-any -- SDK response bodies lack precise types */

import https from 'node:https';
import { KubeConfig, ApiextensionsV1Api, Watch } from '@kubernetes/client-node';
import type { V1CustomResourceDefinition } from '@kubernetes/client-node';
import type {
  KubeClient,
  KubeContext,
  WatchOptions,
  WatchHandler,
  WatchSubscription,
  ListOptions,
  ListPage,
  EventSelector,
  CrdDefinition,
  KubeError,
} from '../boundaries/kube-client.js';
import type { KubernetesObject } from '../core/types.js';
import { ok, err } from '../core/result.js';
import type { Result } from '../core/result.js';

/** Build a typed KubeError from an SDK error. */
function mapError(e: unknown): KubeError {
  if (e !== null && typeof e === 'object' && 'statusCode' in e) {
    const status = (e as { statusCode: number }).statusCode;
    const body = (e as { body?: { message?: string } }).body;
    const message =
      body?.message ?? (e instanceof Error ? e.message : 'unknown error');
    if (status === 401 || status === 403) {
      return { kind: 'forbidden', message, statusCode: status };
    }
    if (status === 404) {
      return { kind: 'notFound', message, statusCode: status };
    }
    if (status === 409) {
      return { kind: 'conflict', message, statusCode: status };
    }
    return { kind: 'unknown', message, statusCode: status };
  }
  const message = e instanceof Error ? e.message : String(e);
  return { kind: 'network', message };
}

export class KubeClientAdapter implements KubeClient {
  private readonly kc: KubeConfig;

  constructor(kc: KubeConfig) {
    this.kc = kc;
  }

  /** Construct from the default kubeconfig (~/.kube/config or in-cluster). */
  static fromDefault(): KubeClientAdapter {
    const kc = new KubeConfig();
    kc.loadFromDefault();
    return new KubeClientAdapter(kc);
  }

  listContexts(): KubeContext[] {
    return this.kc.contexts.map((c: any) => ({
      name: c.name as string,
      cluster: c.cluster as string,
      user: c.user as string,
    }));
  }

  currentContext(): string {
    return this.kc.getCurrentContext();
  }

  watch(
    kind: string,
    options: WatchOptions,
    handler: WatchHandler,
  ): WatchSubscription {
    const watchPath = this.watchPath(kind, options.namespace);
    const params: Record<string, string> = {};
    if (options.fieldSelector !== undefined) {
      params.fieldSelector = options.fieldSelector;
    }
    if (options.resourceVersion !== undefined) {
      params.resourceVersion = options.resourceVersion;
    }

    const watcher = new Watch(this.kc);
    // abortController holds the request once the async watch resolves.
    const abortController: { fn: (() => void) | null } = { fn: null };
    const errorHandlers: ((e: KubeError) => void)[] = [];
    let closed = false;

    void (async () => {
      try {
        const req = await watcher.watch(
          watchPath,
          params,
          (type: string, obj: unknown) => {
            const kubeObj = obj as KubernetesObject;
            const meta = kubeObj.metadata ?? {};
            handler({
              type: type as 'ADDED' | 'MODIFIED' | 'DELETED',
              apiVersion: kubeObj.apiVersion ?? '',
              kind: kubeObj.kind ?? kind,
              namespace: meta.namespace ?? null,
              name: meta.name ?? '',
              object: kubeObj,
              receivedAt: 0,
            });
          },
          (err2: unknown) => {
            if (closed) {
              return;
            }
            const ke =
              err2 === null
                ? { kind: 'streamDropped' as const, message: 'stream ended' }
                : mapError(err2);
            for (const h of errorHandlers) {
              h(ke);
            }
          },
        );
        abortController.fn = (): void => {
          (req as unknown as { abort(): void }).abort();
        };
      } catch (e) {
        const ke = mapError(e);
        for (const h of errorHandlers) {
          h(ke);
        }
      }
    })();

    return {
      close: (): void => {
        closed = true;
        abortController.fn?.();
      },
      onError: (h): void => {
        errorHandlers.push(h);
      },
    };
  }

  async list(
    kind: string,
    options: ListOptions,
  ): Promise<Result<ListPage, KubeError>> {
    try {
      const path = this.listPath(kind, options.namespace);
      const params = new URLSearchParams();
      if (options.limit !== undefined) {
        params.set('limit', String(options.limit));
      }
      if (options.metadataOnly === true) {
        params.set('includeUninitialized', 'false');
      }
      const server = this.kc.getCurrentCluster()?.server ?? '';
      const qs = params.size > 0 ? `?${params.toString()}` : '';
      const { status, body: rawBody } = await this.doRequest(
        'GET',
        `${server}${path}${qs}`,
      );
      if (status < 200 || status >= 300) {
        const parsed = JSON.parse(rawBody) as { message?: string };
        return err(
          mapError({ statusCode: status, body: { message: parsed.message } }),
        );
      }
      const body = JSON.parse(rawBody) as {
        items?: unknown[];
        metadata?: {
          resourceVersion?: string;
          remainingItemCount?: number;
        };
      };
      const items = (body.items ?? []) as KubernetesObject[];
      const resourceVersion = body.metadata?.resourceVersion ?? '';
      const remainingItemCount = body.metadata?.remainingItemCount ?? null;
      return ok({ items, resourceVersion, remainingItemCount });
    } catch (e) {
      return err(mapError(e));
    }
  }

  async get(
    kind: string,
    name: string,
    namespace: string | null,
  ): Promise<Result<KubernetesObject, KubeError>> {
    try {
      const path = this.resourcePath(kind, name, namespace);
      const server = this.kc.getCurrentCluster()?.server ?? '';
      const { status, body: rawBody } = await this.doRequest(
        'GET',
        `${server}${path}`,
      );
      if (status < 200 || status >= 300) {
        const parsed = JSON.parse(rawBody) as { message?: string };
        return err(
          mapError({ statusCode: status, body: { message: parsed.message } }),
        );
      }
      const obj = JSON.parse(rawBody) as KubernetesObject;
      return ok(obj);
    } catch (e) {
      return err(mapError(e));
    }
  }

  async replace(
    object: KubernetesObject,
  ): Promise<Result<KubernetesObject, KubeError>> {
    try {
      const kind = object.kind ?? '';
      const name = object.metadata?.name ?? '';
      const namespace = object.metadata?.namespace ?? null;
      const path = this.resourcePath(kind, name, namespace);
      const server = this.kc.getCurrentCluster()?.server ?? '';
      const bodyStr = JSON.stringify(object);
      const { status, body: rawBody } = await this.doRequest(
        'PUT',
        `${server}${path}`,
        bodyStr,
      );
      if (status < 200 || status >= 300) {
        const parsed = JSON.parse(rawBody) as { message?: string };
        return err(
          mapError({ statusCode: status, body: { message: parsed.message } }),
        );
      }
      const updated = JSON.parse(rawBody) as KubernetesObject;
      return ok(updated);
    } catch (e) {
      return err(mapError(e));
    }
  }

  async delete(
    kind: string,
    name: string,
    namespace: string | null,
  ): Promise<Result<void, KubeError>> {
    try {
      const path = this.resourcePath(kind, name, namespace);
      const server = this.kc.getCurrentCluster()?.server ?? '';
      const { status, body: rawBody } = await this.doRequest(
        'DELETE',
        `${server}${path}`,
      );
      if (status < 200 || status >= 300) {
        const parsed = JSON.parse(rawBody) as { message?: string };
        return err(
          mapError({ statusCode: status, body: { message: parsed.message } }),
        );
      }
      return ok(undefined);
    } catch (e) {
      return err(mapError(e));
    }
  }

  async discoverCrds(): Promise<Result<CrdDefinition[], KubeError>> {
    try {
      const apiext = this.kc.makeApiClient(ApiextensionsV1Api);
      const list = await apiext.listCustomResourceDefinition();
      const crds: CrdDefinition[] = list.items.map(
        (crd: V1CustomResourceDefinition) => {
          const group = crd.spec.group;
          const kind = crd.spec.names.kind;
          const plural = crd.spec.names.plural;
          const namespaced = crd.spec.scope === 'Namespaced';
          const versions = crd.spec.versions.map((v) => v.name);
          return { group, kind, plural, namespaced, versions };
        },
      );
      return ok(crds);
    } catch (e) {
      return err(mapError(e));
    }
  }

  async listEvents(
    selector: EventSelector,
  ): Promise<Result<KubernetesObject[], KubeError>> {
    try {
      const parts: string[] = [];
      if (selector.involvedObjectName !== undefined) {
        parts.push(`involvedObject.name=${selector.involvedObjectName}`);
      }
      if (selector.involvedObjectKind !== undefined) {
        parts.push(`involvedObject.kind=${selector.involvedObjectKind}`);
      }
      if (selector.type !== undefined) {
        parts.push(`type=${selector.type}`);
      }
      const fieldSelector = parts.join(',');
      const ns = selector.namespace;
      const path =
        ns !== undefined ? `/api/v1/namespaces/${ns}/events` : '/api/v1/events';
      const qs =
        fieldSelector.length > 0
          ? `?fieldSelector=${encodeURIComponent(fieldSelector)}`
          : '';
      const server = this.kc.getCurrentCluster()?.server ?? '';
      const { status, body: rawBody } = await this.doRequest(
        'GET',
        `${server}${path}${qs}`,
      );
      if (status < 200 || status >= 300) {
        const parsed = JSON.parse(rawBody) as { message?: string };
        return err(
          mapError({ statusCode: status, body: { message: parsed.message } }),
        );
      }
      const body = JSON.parse(rawBody) as { items?: KubernetesObject[] };
      return ok(body.items ?? []);
    } catch (e) {
      return err(mapError(e));
    }
  }

  // ---------------------------------------------------------------------------
  // HTTP helpers
  // ---------------------------------------------------------------------------

  /**
   * Perform an HTTP request using Node.js https.request (supports TLS agents
   * from the kubeconfig, including skipTLSVerify and client certs).
   * Returns { status, body }.
   */
  private async doRequest(
    method: string,
    url: string,
    body?: string,
  ): Promise<{ status: number; body: string }> {
    // applyToHTTPSOptions populates: agent (TLS), ca, cert, key, auth, headers.Authorization
    const httpOpts: https.RequestOptions & {
      headers?: Record<string, string>;
    } = {};
    await this.kc.applyToHTTPSOptions(httpOpts);

    // applyToHTTPSOptions sets opts.headers.Authorization for token-based auth
    // and opts.auth for basic auth (handled by applyToFetchOptions conversion).
    // We call applyToFetchOptions to get the final Authorization header value.
    const fetchOptsRaw = await this.kc.applyToFetchOptions({});
    const fetchHeaders = fetchOptsRaw.headers as unknown as Headers;
    const authHeader = fetchHeaders.get('Authorization');

    const parsed = new URL(url);
    const reqHeaders: Record<string, string | number> = {};
    if (authHeader !== null) {
      reqHeaders.Authorization = authHeader;
    }
    if (body !== undefined) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(body);
    }

    const reqOpts: https.RequestOptions = {
      agent: httpOpts.agent,
      ca: httpOpts.ca,
      cert: httpOpts.cert,
      key: httpOpts.key,
      hostname: parsed.hostname,
      port: parsed.port,
      path: `${parsed.pathname}${parsed.search}`,
      method,
      headers: reqHeaders,
    };

    return new Promise((resolve, reject) => {
      const req = https.request(reqOpts, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString(),
          });
        });
        res.on('error', reject);
      });
      req.on('error', reject);
      if (body !== undefined) {
        req.write(body);
      }
      req.end();
    });
  }

  // ---------------------------------------------------------------------------
  // Path helpers
  // ---------------------------------------------------------------------------

  private watchPath(kind: string, namespace?: string): string {
    return namespace !== undefined
      ? `${this.apiPrefix(kind)}/namespaces/${namespace}/${this.plural(kind)}`
      : `${this.apiPrefix(kind)}/${this.plural(kind)}`;
  }

  private listPath(kind: string, namespace?: string): string {
    return this.watchPath(kind, namespace);
  }

  private resourcePath(
    kind: string,
    name: string,
    namespace: string | null,
  ): string {
    const base =
      namespace !== null
        ? `${this.apiPrefix(kind)}/namespaces/${namespace}/${this.plural(kind)}`
        : `${this.apiPrefix(kind)}/${this.plural(kind)}`;
    return `${base}/${name}`;
  }

  private apiPrefix(kind: string): string {
    const coreKinds = new Set([
      'Pod',
      'Node',
      'Namespace',
      'ConfigMap',
      'Secret',
      'Service',
      'ServiceAccount',
      'Event',
      'PersistentVolume',
      'PersistentVolumeClaim',
    ]);
    if (coreKinds.has(kind)) {
      return '/api/v1';
    }
    const apiGroups: Record<string, string> = {
      Deployment: 'apps/v1',
      StatefulSet: 'apps/v1',
      DaemonSet: 'apps/v1',
      ReplicaSet: 'apps/v1',
      Job: 'batch/v1',
      CronJob: 'batch/v1',
      Ingress: 'networking.k8s.io/v1',
      NetworkPolicy: 'networking.k8s.io/v1',
      HorizontalPodAutoscaler: 'autoscaling/v2',
      ClusterRole: 'rbac.authorization.k8s.io/v1',
      ClusterRoleBinding: 'rbac.authorization.k8s.io/v1',
      Role: 'rbac.authorization.k8s.io/v1',
      RoleBinding: 'rbac.authorization.k8s.io/v1',
      StorageClass: 'storage.k8s.io/v1',
    };
    const group = apiGroups[kind] ?? 'apps/v1';
    return `/apis/${group}`;
  }

  private plural(kind: string): string {
    const overrides: Record<string, string> = {
      NetworkPolicy: 'networkpolicies',
      HorizontalPodAutoscaler: 'horizontalpodautoscalers',
      ClusterRole: 'clusterroles',
      ClusterRoleBinding: 'clusterrolebindings',
      RoleBinding: 'rolebindings',
      StorageClass: 'storageclasses',
      Ingress: 'ingresses',
    };
    const override = overrides[kind];
    if (override !== undefined) {
      return override;
    }
    return `${kind.toLowerCase()}s`;
  }
}
