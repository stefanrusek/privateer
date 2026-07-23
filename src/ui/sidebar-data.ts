/**
 * Static sidebar category/leaf data for Privateer TUI (Spec 02 §4).
 * Pure constants — no IO, no side effects.
 */

import type { SidebarCategory, SidebarSubgroup } from './types.js';
import { crKindLabel, type CrdGroup } from '../k8s/crd-grouping.js';

/** Collapse-key prefix for a Custom Resources API-group subgroup. */
export const CR_GROUP_ID_PREFIX = 'cr-group:';

export function crGroupId(group: string): string {
  return `${CR_GROUP_ID_PREFIX}${group}`;
}

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

/**
 * Build the Custom Resources subgroups (one per established CRD API group)
 * from the discovered/grouped CRD data. Each kind's sidebar label follows
 * the existing built-in convention of a naive plural (kind + "s", matching
 * the precedent set by the Kafka/KafkaTopic sidebar labels) so it can share
 * the badgeCounts/dimmedKinds/forbiddenKinds machinery used by every other
 * kind (Spec 03 §7).
 */
export function buildCrSubgroups(
  crdGroups: readonly CrdGroup[],
): readonly SidebarSubgroup[] {
  return crdGroups.map((g) => ({
    kind: 'subgroup' as const,
    id: crGroupId(g.group),
    label: g.group,
    children: g.kinds.map((k) => {
      const label = crKindLabel(k.kind);
      return { kind: 'leaf' as const, label, resourceKind: label };
    }),
  }));
}

/**
 * Returns SIDEBAR_CATEGORIES with the Custom Resources category's children
 * extended by one collapsible subgroup per established CRD API group,
 * beneath the existing CustomResourceDefinitions leaf (Spec 03 §7). Pure —
 * `crdGroups` is caller-owned state (populated by the live controller).
 */
export function sidebarCategoriesWithCr(
  crdGroups: readonly CrdGroup[],
): readonly SidebarCategory[] {
  if (crdGroups.length === 0) {
    return SIDEBAR_CATEGORIES;
  }
  const subgroups = buildCrSubgroups(crdGroups);
  return SIDEBAR_CATEGORIES.map((cat) =>
    cat.id === 'custom-resources'
      ? { ...cat, children: [...cat.children, ...subgroups] }
      : cat,
  );
}

/** A single keyboard-navigable sidebar row. */
export type SidebarNavEntry =
  | { readonly type: 'overview' }
  | { readonly type: 'category'; readonly id: string }
  | { readonly type: 'subgroup'; readonly id: string }
  | { readonly type: 'leaf'; readonly resourceKind: string };

/**
 * Flatten the sidebar tree into the ordered list of keyboard-navigable rows:
 * Overview first, then each category header followed by its children
 * (children are omitted when the category id is in `collapsed`; a nested
 * subgroup's own leaves are likewise omitted when its id is collapsed).
 */
export function flattenSidebarNav(
  items: readonly SidebarCategory[],
  collapsed: ReadonlySet<string>,
): SidebarNavEntry[] {
  const entries: SidebarNavEntry[] = [{ type: 'overview' }];
  for (const cat of items) {
    entries.push({ type: 'category', id: cat.id });
    if (collapsed.has(cat.id)) {
      continue;
    }
    for (const child of cat.children) {
      if (child.kind === 'subgroup') {
        entries.push({ type: 'subgroup', id: child.id });
        if (!collapsed.has(child.id)) {
          for (const leaf of child.children) {
            entries.push({ type: 'leaf', resourceKind: leaf.resourceKind });
          }
        }
      } else {
        entries.push({ type: 'leaf', resourceKind: child.resourceKind });
      }
    }
  }
  return entries;
}
