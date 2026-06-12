// Sidebar label ↔ Kubernetes kind mapping for the live composition layer
// (coverage-excluded glue, Spec 08 §5.2). The sidebar tree uses plural display
// labels ("Pods"); the KubeClient/StateStore use singular kinds ("Pod").

/** Sidebar leaf label → singular Kubernetes kind. */
export const LABEL_TO_KIND: ReadonlyMap<string, string> = new Map([
  ['Pods', 'Pod'],
  ['Deployments', 'Deployment'],
  ['StatefulSets', 'StatefulSet'],
  ['DaemonSets', 'DaemonSet'],
  ['ReplicaSets', 'ReplicaSet'],
  ['Jobs', 'Job'],
  ['CronJobs', 'CronJob'],
  ['Services', 'Service'],
  ['Ingresses', 'Ingress'],
  ['NetworkPolicies', 'NetworkPolicy'],
  ['Endpoints', 'Endpoints'],
  ['ConfigMaps', 'ConfigMap'],
  ['Secrets', 'Secret'],
  ['ResourceQuotas', 'ResourceQuota'],
  ['LimitRanges', 'LimitRange'],
  ['HorizontalPodAutoscalers', 'HorizontalPodAutoscaler'],
  ['PersistentVolumes', 'PersistentVolume'],
  ['PersistentVolumeClaims', 'PersistentVolumeClaim'],
  ['StorageClasses', 'StorageClass'],
  ['ServiceAccounts', 'ServiceAccount'],
  ['Roles', 'Role'],
  ['RoleBindings', 'RoleBinding'],
  ['ClusterRoles', 'ClusterRole'],
  ['ClusterRoleBindings', 'ClusterRoleBinding'],
  ['Nodes', 'Node'],
  ['Namespaces', 'Namespace'],
  ['CustomResourceDefinitions', 'CustomResourceDefinition'],
  ['Kafkas', 'Kafka'],
  ['KafkaTopics', 'KafkaTopic'],
]);

/** Singular kind → sidebar leaf label. */
export const KIND_TO_LABEL: ReadonlyMap<string, string> = new Map(
  [...LABEL_TO_KIND.entries()].map(([label, kind]) => [kind, label]),
);

/** Kinds whose watch streams are always open (StreamManager core set). */
export const CORE_KINDS: ReadonlySet<string> = new Set([
  'Pod',
  'Deployment',
  'StatefulSet',
  'DaemonSet',
  'Node',
  'Namespace',
]);

/** Cluster-scoped kinds (no namespace filtering applies). */
export const CLUSTER_SCOPED_KINDS: ReadonlySet<string> = new Set([
  'Node',
  'Namespace',
  'PersistentVolume',
  'StorageClass',
  'ClusterRole',
  'ClusterRoleBinding',
  'CustomResourceDefinition',
]);

export function labelToKind(label: string): string | undefined {
  return LABEL_TO_KIND.get(label);
}

export function kindToLabel(kind: string): string {
  return KIND_TO_LABEL.get(kind) ?? kind;
}
