/**
 * Kind-alias dictionary shared by the fast-path parser and ! commands.
 *
 * Maps every recognized short form (and canonical plural/singular) to the
 * canonical PascalCase resource kind used by the State Store.
 *
 * Spec 07 §8 — the same alias table used by both the fast-path parser and
 * !<resource> commands.
 */

/**
 * Full alias table: alias (lowercased) → canonical kind.
 *
 * Entries cover:
 *   - canonical plural forms  (pods → Pod)
 *   - canonical singular forms (pod → Pod)
 *   - kubectl short aliases    (deploy → Deployment)
 *   - Kafka CRD short aliases  (topics → KafkaTopic)
 */
export const KIND_ALIASES: ReadonlyMap<string, string> = new Map<
  string,
  string
>([
  // Pods
  ['pod', 'Pod'],
  ['pods', 'Pod'],

  // Deployments
  ['deployment', 'Deployment'],
  ['deployments', 'Deployment'],
  ['deploy', 'Deployment'],
  ['deploys', 'Deployment'],

  // StatefulSets
  ['statefulset', 'StatefulSet'],
  ['statefulsets', 'StatefulSet'],
  ['sts', 'StatefulSet'],

  // DaemonSets
  ['daemonset', 'DaemonSet'],
  ['daemonsets', 'DaemonSet'],
  ['ds', 'DaemonSet'],

  // ReplicaSets
  ['replicaset', 'ReplicaSet'],
  ['replicasets', 'ReplicaSet'],
  ['rs', 'ReplicaSet'],

  // Jobs
  ['job', 'Job'],
  ['jobs', 'Job'],

  // CronJobs
  ['cronjob', 'CronJob'],
  ['cronjobs', 'CronJob'],

  // Services
  ['service', 'Service'],
  ['services', 'Service'],
  ['svc', 'Service'],
  ['svcs', 'Service'],

  // Ingresses
  ['ingress', 'Ingress'],
  ['ingresses', 'Ingress'],
  ['ing', 'Ingress'],

  // NetworkPolicies
  ['networkpolicy', 'NetworkPolicy'],
  ['networkpolicies', 'NetworkPolicy'],

  // ConfigMaps
  ['configmap', 'ConfigMap'],
  ['configmaps', 'ConfigMap'],
  ['cm', 'ConfigMap'],

  // Secrets
  ['secret', 'Secret'],
  ['secrets', 'Secret'],

  // HorizontalPodAutoscalers
  ['horizontalpodautoscaler', 'HorizontalPodAutoscaler'],
  ['horizontalpodautoscalers', 'HorizontalPodAutoscaler'],
  ['hpa', 'HorizontalPodAutoscaler'],
  ['hpas', 'HorizontalPodAutoscaler'],

  // PersistentVolumeClaims
  ['persistentvolumeclaim', 'PersistentVolumeClaim'],
  ['persistentvolumeclaims', 'PersistentVolumeClaim'],
  ['pvc', 'PersistentVolumeClaim'],
  ['pvcs', 'PersistentVolumeClaim'],

  // PersistentVolumes
  ['persistentvolume', 'PersistentVolume'],
  ['persistentvolumes', 'PersistentVolume'],
  ['pv', 'PersistentVolume'],
  ['pvs', 'PersistentVolume'],

  // StorageClasses
  ['storageclass', 'StorageClass'],
  ['storageclasses', 'StorageClass'],
  ['sc', 'StorageClass'],

  // Nodes
  ['node', 'Node'],
  ['nodes', 'Node'],

  // Namespaces
  ['namespace', 'Namespace'],
  ['namespaces', 'Namespace'],
  ['ns', 'Namespace'],

  // ServiceAccounts
  ['serviceaccount', 'ServiceAccount'],
  ['serviceaccounts', 'ServiceAccount'],
  ['sa', 'ServiceAccount'],

  // Roles
  ['role', 'Role'],
  ['roles', 'Role'],

  // RoleBindings
  ['rolebinding', 'RoleBinding'],
  ['rolebindings', 'RoleBinding'],

  // ClusterRoles
  ['clusterrole', 'ClusterRole'],
  ['clusterroles', 'ClusterRole'],

  // ClusterRoleBindings
  ['clusterrolebinding', 'ClusterRoleBinding'],
  ['clusterrolebindings', 'ClusterRoleBinding'],

  // Kafka (Strimzi)
  ['kafka', 'Kafka'],
  ['kafkas', 'Kafka'],

  ['kafkatopic', 'KafkaTopic'],
  ['kafkatopics', 'KafkaTopic'],
  ['topic', 'KafkaTopic'],
  ['topics', 'KafkaTopic'],

  ['kafkauser', 'KafkaUser'],
  ['kafkausers', 'KafkaUser'],

  ['kafkaconnect', 'KafkaConnect'],
  ['kafkaconnects', 'KafkaConnect'],

  ['kafkabridge', 'KafkaBridge'],
  ['kafkabridges', 'KafkaBridge'],

  // DopplerSecrets
  ['dopplersecret', 'DopplerSecret'],
  ['dopplersecrets', 'DopplerSecret'],

  // Prometheus Operator
  ['prometheusrule', 'PrometheusRule'],
  ['prometheusrules', 'PrometheusRule'],

  ['servicemonitor', 'ServiceMonitor'],
  ['servicemonitors', 'ServiceMonitor'],

  ['podmonitor', 'PodMonitor'],
  ['podmonitors', 'PodMonitor'],

  ['alertmanager', 'Alertmanager'],
  ['alertmanagers', 'Alertmanager'],
]);

/**
 * Look up a canonical kind by alias. Case-insensitive.
 * Returns undefined if no match.
 */
export function resolveKind(alias: string): string | undefined {
  return KIND_ALIASES.get(alias.toLowerCase());
}
