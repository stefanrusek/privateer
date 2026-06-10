/**
 * Core domain types shared across every layer (Spec 01 §3.2, Spec 03 §2).
 * These are plain data — no behavior — so they are importable everywhere
 * without crossing the boundary-adapter rule.
 */

/** A minimal structural view of a Kubernetes object body. */
export interface KubernetesObject {
  apiVersion?: string;
  kind?: string;
  metadata?: ObjectMeta;
  spec?: Record<string, unknown>;
  status?: Record<string, unknown>;
  // Some resources (ConfigMap, Secret, Role, etc.) carry top-level fields.
  [key: string]: unknown;
}

export interface ObjectMeta {
  name?: string;
  namespace?: string;
  uid?: string;
  resourceVersion?: string;
  creationTimestamp?: string;
  deletionTimestamp?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  ownerReferences?: OwnerReference[];
  managedFields?: unknown[];
}

export interface OwnerReference {
  apiVersion: string;
  kind: string;
  name: string;
  uid: string;
  controller?: boolean;
}

export type StatusColor = 'green' | 'yellow' | 'red' | 'grey';

export interface ResourceStatus {
  color: StatusColor;
  /** Human-readable, e.g. "Running", "CrashLoopBackOff". */
  label: string;
  /** e.g. "3/3" for deployments. */
  ready?: string;
  /** Error message if applicable. */
  message?: string;
}

/** Normalized in-store representation of a cluster resource (Spec 03 §2). */
export interface ResourceObject {
  uid: string;
  kind: string;
  apiVersion: string;
  name: string;
  namespace: string | null;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  creationTimestamp: string;
  resourceVersion: string;
  status: ResourceStatus;
  /** Full body for YAML view and detail rendering. */
  raw: KubernetesObject;
}

export type WatchEventType = 'ADDED' | 'MODIFIED' | 'DELETED';

/** Normalized watch event fanned out by the Watch Aggregator (Spec 01 §3.2). */
export interface ResourceEvent {
  type: WatchEventType;
  apiVersion: string;
  kind: string;
  namespace: string | null;
  name: string;
  object: KubernetesObject;
  /** Receipt time in epoch ms, stamped via the injected Clock. */
  receivedAt: number;
}
