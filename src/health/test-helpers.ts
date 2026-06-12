/**
 * Test helpers for building State Store snapshots for health rule tests.
 * Not exported from the main health package — test-only.
 */

import { StateStore } from '../store/state-store.js';
import type {
  ResourceEvent,
  ResourceObject,
  KubernetesObject,
  StatusColor,
} from '../core/types.js';

export const TEST_CONTEXT = 'test-ctx';

/** Create a minimal StateStore pre-populated by calling the seeder. */
export function makeStore(
  seed: (store: StateStore, ctx: string) => void = () => undefined,
  statusLabel = 'Running',
  statusColor: StatusColor = 'green',
): StateStore {
  const store = new StateStore((event: ResourceEvent): ResourceObject => {
    const meta = event.object.metadata ?? {};
    const uid =
      meta.uid ?? `${event.kind}/${meta.namespace ?? '~'}/${meta.name ?? ''}`;
    return {
      uid,
      kind: event.kind,
      apiVersion: event.apiVersion,
      name: meta.name ?? '',
      namespace: event.namespace,
      labels: meta.labels ?? {},
      annotations: meta.annotations ?? {},
      creationTimestamp: meta.creationTimestamp ?? '2026-01-01T00:00:00Z',
      resourceVersion: meta.resourceVersion ?? '1',
      status: { color: statusColor, label: statusLabel },
      raw: event.object,
    };
  });

  seed(store, TEST_CONTEXT);
  return store;
}

/** Seed a resource into the store. */
export function seedResource(
  store: StateStore,
  ctx: string,
  kind: string,
  name: string,
  namespace: string | null,
  raw: KubernetesObject,
): void {
  const baseMeta = {
    name,
    uid: `uid-${kind}-${namespace ?? 'cluster'}-${name}`,
    ...raw.metadata,
  };
  const metaWithNs = namespace !== null ? { ...baseMeta, namespace } : baseMeta;

  const event: ResourceEvent = {
    type: 'ADDED',
    apiVersion: raw.apiVersion ?? 'v1',
    kind,
    namespace,
    name,
    object: {
      ...raw,
      kind,
      metadata: metaWithNs,
    },
    receivedAt: 0,
  };
  store.applyEvent(ctx, event);
}

/** Build a pod raw object with containers. */
export function makePodRaw(opts: {
  name: string;
  namespace?: string;
  annotations?: Record<string, string>;
  labels?: Record<string, string>;
  containers?: {
    name: string;
    image?: string;
    resources?: {
      requests?: { cpu?: string; memory?: string };
      limits?: { cpu?: string; memory?: string };
    };
    livenessProbe?: object;
    readinessProbe?: object;
    startupProbe?: object;
    securityContext?: Record<string, unknown>;
    env?: Record<string, unknown>[];
    envFrom?: Record<string, unknown>[];
  }[];
  securityContext?: Record<string, unknown>;
  volumes?: Record<string, unknown>[];
  serviceAccountName?: string;
}): KubernetesObject {
  return {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: {
      name: opts.name,
      namespace: opts.namespace ?? 'default',
      annotations: opts.annotations ?? {},
      labels: opts.labels ?? {},
    },
    spec: {
      containers: (opts.containers ?? [{ name: 'main' }]).map((c) => ({
        name: c.name,
        image: c.image ?? 'nginx',
        resources: c.resources,
        livenessProbe: c.livenessProbe,
        readinessProbe: c.readinessProbe,
        startupProbe: c.startupProbe,
        securityContext: c.securityContext,
        env: c.env,
        envFrom: c.envFrom,
      })),
      securityContext: opts.securityContext,
      volumes: opts.volumes,
      serviceAccountName: opts.serviceAccountName,
    },
  };
}
