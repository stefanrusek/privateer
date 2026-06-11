/**
 * CRD discovery → sidebar grouping (Spec 03 §7). Pure function over
 * CrdDefinition[] — no I/O, no side effects. Tested 100% with unit tests.
 */

import type { CrdDefinition } from '../boundaries/kube-client.js';

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

/**
 * Transform a flat list of CrdDefinitions into groups keyed by API group,
 * each sorted by kind name ascending.
 */
export function groupCrds(crds: CrdDefinition[]): CrdGroup[] {
  const byGroup = new Map<string, CrdKindEntry[]>();

  for (const crd of crds) {
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
