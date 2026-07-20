/**
 * CRD discovery → sidebar grouping (Spec 03 §7). Pure function over
 * CrdDefinition[] — no I/O, no side effects. Tested 100% with unit tests.
 */

import type { CrdDefinition } from '../boundaries/kube-client.js';
import type { KubernetesObject } from '../core/types.js';

export interface CrdGroup {
  group: string;
  kinds: CrdKindEntry[];
}

export interface CrdKindEntry {
  kind: string;
  plural: string;
  namespaced: boolean;
  versions: string[];
}

/** Sidebar-facing descriptor for a CR kind — the seam the next story hooks its
 * instance list into (group/version/plural/namespaced). */
export interface CrKindDescriptor {
  kind: string;
  group: string;
  /** Storage/served version to address the instance API with. */
  version: string;
  plural: string;
  namespaced: boolean;
}

/**
 * Transform a flat list of CrdDefinitions into groups keyed by API group,
 * restricted to established CRDs (Established=True), each sorted by kind
 * name ascending, groups sorted by group name ascending.
 */
export function groupCrds(crds: CrdDefinition[]): CrdGroup[] {
  const byGroup = new Map<string, CrdKindEntry[]>();

  for (const crd of crds) {
    if (!crd.established) {
      continue;
    }
    let entries = byGroup.get(crd.group);
    if (entries === undefined) {
      entries = [];
      byGroup.set(crd.group, entries);
    }
    entries.push({
      kind: crd.kind,
      plural: crd.plural,
      namespaced: crd.namespaced,
      versions: [...crd.versions],
    });
  }

  const groups: CrdGroup[] = [];
  for (const [group, entries] of byGroup) {
    groups.push({
      group,
      kinds: entries.slice().sort((a, b) => a.kind.localeCompare(b.kind)),
    });
  }

  // Sort groups by group name for deterministic output
  groups.sort((a, b) => a.group.localeCompare(b.group));
  return groups;
}

/** Flatten grouped CRDs into per-kind descriptors, the seam story 2 (the
 * instance list) resolves group/version/plural/namespaced from. */
export function descriptorsForGroups(
  groups: readonly CrdGroup[],
): Map<string, CrKindDescriptor> {
  const byKind = new Map<string, CrKindDescriptor>();
  for (const group of groups) {
    for (const entry of group.kinds) {
      byKind.set(entry.kind, {
        kind: entry.kind,
        group: group.group,
        version: entry.versions[0] ?? '',
        plural: entry.plural,
        namespaced: entry.namespaced,
      });
    }
  }
  return byKind;
}

/**
 * Parse a raw watched CustomResourceDefinition object (list/watch event
 * body) into a CrdDefinition, or `undefined` if the object is missing
 * fields required to address it (group/kind/plural/scope). Used to keep
 * the sidebar's established-CRD groups live as CRDs are added/removed,
 * without a second discovery round-trip per event.
 */
export function crdFromObject(
  object: KubernetesObject,
): CrdDefinition | undefined {
  const spec = object.spec;
  const group = spec?.group;
  const names = spec?.names as { kind?: unknown; plural?: unknown } | undefined;
  const kind = names?.kind;
  const plural = names?.plural;
  const scope = spec?.scope;
  if (
    typeof group !== 'string' ||
    typeof kind !== 'string' ||
    typeof plural !== 'string' ||
    typeof scope !== 'string'
  ) {
    return undefined;
  }
  const namespaced = scope === 'Namespaced';

  const rawVersions = spec?.versions;
  const versions: string[] = [];
  if (Array.isArray(rawVersions)) {
    const served = rawVersions.filter(
      (v): v is { name: string; served?: boolean; storage?: boolean } =>
        typeof v === 'object' &&
        v !== null &&
        typeof (v as { name?: unknown }).name === 'string' &&
        (v as { served?: unknown }).served !== false,
    );
    served.sort((a, b) => Number(b.storage) - Number(a.storage));
    versions.push(...served.map((v) => v.name));
  }

  const status = object.status as
    | { conditions?: { type?: unknown; status?: unknown }[] }
    | undefined;
  const established =
    status?.conditions?.some(
      (c) => c.type === 'Established' && c.status === 'True',
    ) ?? false;

  return { group, kind, plural, namespaced, versions, established };
}
