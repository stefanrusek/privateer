/**
 * CRD discovery → sidebar grouping (Spec 03 §7). Pure function over
 * CrdDefinition[] — no I/O, no side effects. Tested 100% with unit tests.
 */

import type {
  CrdDefinition,
  CrdPrinterColumn,
} from '../boundaries/kube-client.js';
import type { KubernetesObject } from '../core/types.js';

export type { CrdPrinterColumn } from '../boundaries/kube-client.js';

export interface CrdGroup {
  group: string;
  kinds: CrdKindEntry[];
}

export interface CrdKindEntry {
  kind: string;
  plural: string;
  namespaced: boolean;
  versions: string[];
  printerColumns: CrdPrinterColumn[];
}

/** Sidebar-facing descriptor for a CR kind — the seam the instance list
 * (story 2) resolves group/version/plural/namespaced/printerColumns from. */
export interface CrKindDescriptor {
  kind: string;
  group: string;
  /** Storage/served version to address the instance API with. */
  version: string;
  plural: string;
  namespaced: boolean;
  printerColumns: CrdPrinterColumn[];
}

/**
 * The sidebar leaf label for a CR kind — a naive plural (kind + "s"),
 * matching the precedent set by the Kafka/KafkaTopic sidebar labels
 * (Spec 03 §7). Shared between the sidebar tree builder and the label→kind
 * resolution the instance list (story 2) uses, so both sides derive the
 * same string without duplicating the pluralization convention.
 */
export function crKindLabel(kind: string): string {
  return `${kind}s`;
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
      printerColumns: [...crd.printerColumns],
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
        printerColumns: entry.printerColumns,
      });
    }
  }
  return byKind;
}

/**
 * Flatten grouped CRDs into a map keyed by the sidebar leaf *label*
 * (`crKindLabel(kind)`) instead of the bare kind — the seam story 2 uses to
 * resolve a selected sidebar leaf back to its descriptor when the kind isn't
 * one of the static built-ins in `LABEL_TO_KIND`.
 */
export function descriptorsByLabel(
  groups: readonly CrdGroup[],
): Map<string, CrKindDescriptor> {
  const byKind = descriptorsForGroups(groups);
  const byLabel = new Map<string, CrKindDescriptor>();
  for (const descriptor of byKind.values()) {
    byLabel.set(crKindLabel(descriptor.kind), descriptor);
  }
  return byLabel;
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
  let printerColumns: CrdPrinterColumn[] = [];
  if (Array.isArray(rawVersions)) {
    interface RawVersion {
      name: string;
      served?: boolean;
      storage?: boolean;
      additionalPrinterColumns?: unknown;
    }
    const served = rawVersions.filter(
      (v): v is RawVersion =>
        typeof v === 'object' &&
        v !== null &&
        typeof (v as { name?: unknown }).name === 'string' &&
        (v as { served?: unknown }).served !== false,
    );
    served.sort((a, b) => Number(b.storage) - Number(a.storage));
    versions.push(...served.map((v) => v.name));
    printerColumns = parsePrinterColumns(served[0]?.additionalPrinterColumns);
  }

  const status = object.status as
    | { conditions?: { type?: unknown; status?: unknown }[] }
    | undefined;
  const established =
    status?.conditions?.some(
      (c) => c.type === 'Established' && c.status === 'True',
    ) ?? false;

  return {
    group,
    kind,
    plural,
    namespaced,
    versions,
    established,
    printerColumns,
  };
}

/**
 * Parse a version's raw `additionalPrinterColumns` array into
 * `CrdPrinterColumn[]`, sorted priority 0 first (Spec 03 §7). Malformed
 * entries are skipped rather than failing the whole CRD parse.
 */
function parsePrinterColumns(raw: unknown): CrdPrinterColumn[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const columns: CrdPrinterColumn[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }
    const name = (entry as { name?: unknown }).name;
    const jsonPath = (entry as { jsonPath?: unknown }).jsonPath;
    const priority = (entry as { priority?: unknown }).priority;
    if (typeof name !== 'string' || typeof jsonPath !== 'string') {
      continue;
    }
    columns.push({
      name,
      jsonPath,
      priority: typeof priority === 'number' ? priority : 0,
    });
  }
  columns.sort((a, b) => a.priority - b.priority);
  return columns;
}
