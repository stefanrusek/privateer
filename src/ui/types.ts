/**
 * UI layer types for Privateer TUI layout and navigation (Spec 02 §3).
 */

import type { Mode } from '../input/keyboard.js';
import type { SwitchStatus } from './context-switch.js';
import type { CrdGroup } from '../k8s/crd-grouping.js';

export type { Mode };

/** Which pane currently has keyboard focus. */
export type FocusRegion = 'sidebar' | 'list' | 'detail' | 'commandbar';

/** Badge tier determines visual weight of a resource count. */
export type BadgeTier = 'live' | 'dimmed';

/** A category group in the sidebar (e.g. "Workloads"). */
export interface SidebarCategory {
  readonly kind: 'category';
  readonly label: string;
  /** Unique identifier used as collapse key. */
  readonly id: string;
  readonly children: readonly (SidebarLeaf | SidebarSubgroup)[];
}

/**
 * A collapsible subgroup nested one level inside a category — currently
 * used only for Custom Resources API groups (e.g. "hub.traefik.io"), each
 * holding that group's established CRD kinds.
 */
export interface SidebarSubgroup {
  readonly kind: 'subgroup';
  readonly label: string;
  /** Unique identifier used as collapse key. */
  readonly id: string;
  readonly children: readonly SidebarLeaf[];
}

/** A leaf resource kind entry in the sidebar. */
export interface SidebarLeaf {
  readonly kind: 'leaf';
  readonly label: string;
  /** Kubernetes resource kind name, e.g. "Deployments". */
  readonly resourceKind: string;
}

/** Union of sidebar tree nodes. */
export type SidebarItem = SidebarCategory | SidebarSubgroup | SidebarLeaf;

/** The full prop shape for AppRoot. */
export interface AppState {
  /** Current context name from kubeconfig. */
  readonly context: string;
  /** Active namespace filter ("" for all namespaces). */
  readonly namespace: string;
  /** All available namespaces. */
  readonly allNamespaces: readonly string[];
  /** All available contexts. */
  readonly allContexts: readonly string[];
  /** Currently selected resource kind (e.g. "Deployments"). */
  readonly activeKind: string;
  /** Search filter text. */
  readonly search: string;
  /** Current modal mode. */
  readonly mode: Mode;
  /** Which region has keyboard focus. */
  readonly focus: FocusRegion;
  /** Categories that are collapsed. */
  readonly collapsedCategories: ReadonlySet<string>;
  /** Resource kinds with live badge counts. */
  readonly badgeCounts: ReadonlyMap<string, number>;
  /** Resource kinds with dimmed (stale) counts. */
  readonly dimmedKinds: ReadonlySet<string>;
  /** Resource kinds that returned 403. */
  readonly forbiddenKinds: ReadonlySet<string>;
  /**
   * Established CRDs grouped by API group, feeding the Custom Resources
   * sidebar subgroups. Instance counts for each kind still live in
   * `badgeCounts` (keyed by the same label convention as built-in kinds),
   * fetched lazily per group on subtree expand.
   */
  readonly crdGroups: readonly CrdGroup[];
  /** Whether the detail pane is visible. */
  readonly showDetail: boolean;
  /** Whether the context switcher overlay is open. */
  readonly contextSwitcherOpen: boolean;
  /**
   * In-flight context-switch status (chunk 08): `null` when settled,
   * `connecting` while a switch is reconnecting, `error` (with reason) when the
   * target could not be reached. Drives the header connecting hint and the
   * error banner with [Retry] / [Switch context].
   */
  readonly switchStatus: SwitchStatus;
  /** Whether the help overlay is open. */
  readonly helpOpen: boolean;
  /** Sidebar width ratio (0..1). */
  readonly sidebarRatio: number;
  /** Vertical split ratio (0..1). */
  readonly verticalRatio: number;
  /** Command bar hint strings. */
  readonly hints: readonly string[];
  /** Focused sub-element of header, or null. */
  readonly headerFocus: 'namespace' | 'search' | null;
}
