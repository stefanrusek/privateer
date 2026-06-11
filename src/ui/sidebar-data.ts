/**
 * Static sidebar category/leaf data for Privateer TUI (Spec 02 §4).
 * Pure constants — no IO, no side effects.
 */

import type { SidebarCategory } from './types.js';

/**
 * The 8 canonical sidebar category groups with their leaf resource kinds.
 * Order matches the spec sidebar layout.
 */
export const SIDEBAR_CATEGORIES: readonly SidebarCategory[] = [
  {
    kind: 'category',
    id: 'workloads',
    label: 'Workloads',
    children: [
      { kind: 'leaf', label: 'Deployments', resourceKind: 'Deployments' },
      { kind: 'leaf', label: 'StatefulSets', resourceKind: 'StatefulSets' },
      { kind: 'leaf', label: 'DaemonSets', resourceKind: 'DaemonSets' },
      { kind: 'leaf', label: 'ReplicaSets', resourceKind: 'ReplicaSets' },
      { kind: 'leaf', label: 'Jobs', resourceKind: 'Jobs' },
      { kind: 'leaf', label: 'CronJobs', resourceKind: 'CronJobs' },
      { kind: 'leaf', label: 'Pods', resourceKind: 'Pods' },
    ],
  },
  {
    kind: 'category',
    id: 'networking',
    label: 'Networking',
    children: [
      { kind: 'leaf', label: 'Services', resourceKind: 'Services' },
      { kind: 'leaf', label: 'Ingresses', resourceKind: 'Ingresses' },
      {
        kind: 'leaf',
        label: 'NetworkPolicies',
        resourceKind: 'NetworkPolicies',
      },
      { kind: 'leaf', label: 'Endpoints', resourceKind: 'Endpoints' },
    ],
  },
  {
    kind: 'category',
    id: 'configuration',
    label: 'Configuration',
    children: [
      { kind: 'leaf', label: 'ConfigMaps', resourceKind: 'ConfigMaps' },
      { kind: 'leaf', label: 'Secrets', resourceKind: 'Secrets' },
      { kind: 'leaf', label: 'ResourceQuotas', resourceKind: 'ResourceQuotas' },
      { kind: 'leaf', label: 'LimitRanges', resourceKind: 'LimitRanges' },
      {
        kind: 'leaf',
        label: 'HorizontalPodAutoscalers',
        resourceKind: 'HorizontalPodAutoscalers',
      },
    ],
  },
  {
    kind: 'category',
    id: 'storage',
    label: 'Storage',
    children: [
      {
        kind: 'leaf',
        label: 'PersistentVolumes',
        resourceKind: 'PersistentVolumes',
      },
      {
        kind: 'leaf',
        label: 'PersistentVolumeClaims',
        resourceKind: 'PersistentVolumeClaims',
      },
      { kind: 'leaf', label: 'StorageClasses', resourceKind: 'StorageClasses' },
    ],
  },
  {
    kind: 'category',
    id: 'access-control',
    label: 'Access Control',
    children: [
      {
        kind: 'leaf',
        label: 'ServiceAccounts',
        resourceKind: 'ServiceAccounts',
      },
      { kind: 'leaf', label: 'Roles', resourceKind: 'Roles' },
      { kind: 'leaf', label: 'RoleBindings', resourceKind: 'RoleBindings' },
      { kind: 'leaf', label: 'ClusterRoles', resourceKind: 'ClusterRoles' },
      {
        kind: 'leaf',
        label: 'ClusterRoleBindings',
        resourceKind: 'ClusterRoleBindings',
      },
    ],
  },
  {
    kind: 'category',
    id: 'nodes',
    label: 'Nodes',
    children: [{ kind: 'leaf', label: 'Nodes', resourceKind: 'Nodes' }],
  },
  {
    kind: 'category',
    id: 'namespaces',
    label: 'Namespaces',
    children: [
      { kind: 'leaf', label: 'Namespaces', resourceKind: 'Namespaces' },
    ],
  },
  {
    kind: 'category',
    id: 'custom-resources',
    label: 'Custom Resources',
    children: [
      {
        kind: 'leaf',
        label: 'CustomResourceDefinitions',
        resourceKind: 'CustomResourceDefinitions',
      },
    ],
  },
];

/**
 * Build the sidebar tree from the canonical category list.
 * Returns the static SIDEBAR_CATEGORIES array (pure function, no mutation).
 */
export function buildSidebarTree(): readonly SidebarCategory[] {
  return SIDEBAR_CATEGORIES;
}
