/**
 * Detail-pane tab model — the single source of truth for which tabs a resource
 * kind exposes and how `←` / `→` / `1`–`6` navigate between them.
 *
 * Spec 04 §4.1/§4.2 + navigation-overhaul chunk 01: tab switching moved off
 * `Tab` (which now cycles regions) onto `←` (previous) / `→` (next), with
 * number keys `1`–`6` jumping directly. Extracted as a pure module so both the
 * controller and `DetailPane.tsx` derive the same navigable-tab list.
 */

export type TabId =
  | 'overview'
  | 'yaml'
  | 'events'
  | 'logs'
  | 'metrics'
  | 'agent';

export interface TabDef {
  readonly id: TabId;
  readonly label: string;
}

const ALL_TABS: readonly TabDef[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'yaml', label: 'YAML' },
  { id: 'events', label: 'Events' },
  { id: 'logs', label: 'Logs' },
  { id: 'metrics', label: 'Metrics' },
];

/** The Agent tab is always present, separated by a divider (Spec 04 §4.2). */
export const AGENT_TAB: TabDef = { id: 'agent', label: 'Agent' };

/**
 * Content tabs available for a resource kind (Spec 04 §4.2). Does NOT include
 * the always-present Agent tab — see {@link navigableTabsFor} for the full
 * navigable set.
 */
export function getAvailableTabs(
  kind: string,
  hasPrometheus: boolean,
): TabDef[] {
  switch (kind) {
    case 'Pod':
      return ALL_TABS.filter((t) =>
        ['overview', 'yaml', 'events', 'logs', 'metrics'].includes(t.id),
      );
    case 'Deployment':
    case 'StatefulSet':
    case 'DaemonSet':
    case 'Node':
    case 'KafkaTopic':
    case 'Kafka':
      return ALL_TABS.filter((t) =>
        ['overview', 'yaml', 'events', 'metrics'].includes(t.id),
      );
    default:
      // All others: Overview, YAML, Events, and Metrics only if Prometheus.
      return ALL_TABS.filter((t) => {
        if (['overview', 'yaml', 'events'].includes(t.id)) {
          return true;
        }
        if (t.id === 'metrics' && hasPrometheus) {
          return true;
        }
        return false;
      });
  }
}

/**
 * The full ordered list of navigable tabs for a kind: the available content
 * tabs followed by the always-present Agent tab. This is the list `←`/`→` cycle
 * through and that number keys index into.
 */
export function navigableTabsFor(
  kind: string,
  hasPrometheus: boolean,
): TabDef[] {
  return [...getAvailableTabs(kind, hasPrometheus), AGENT_TAB];
}

/**
 * Resolve the neighbouring tab `step` positions from the active tab, wrapping
 * around. Returns `null` if the active tab is not in the list (so the caller
 * leaves it unchanged). Shared by {@link prevTab} / {@link nextTab}.
 */
function neighbourTab(
  tabs: readonly TabDef[],
  active: TabId,
  step: 1 | -1,
): TabId | null {
  const idx = tabs.findIndex((t) => t.id === active);
  // idx === -1 (active absent) makes `target` land back on a non-active slot,
  // but we only ever index when idx is in range — `slice` from a negative or
  // out-of-range `target` yields an empty list, so `picked` is undefined and we
  // return null. This keeps the absent-active branch genuinely reachable.
  const target =
    idx < 0 ? tabs.length : (idx + step + tabs.length) % tabs.length;
  const [picked] = tabs.slice(target);
  return picked ? picked.id : null;
}

/**
 * Resolve the tab to the left of (`←`) the active tab, wrapping around. Returns
 * `null` if the active tab is not in the list.
 */
export function prevTab(tabs: readonly TabDef[], active: TabId): TabId | null {
  return neighbourTab(tabs, active, -1);
}

/**
 * Resolve the tab to the right of (`→`) the active tab, wrapping around.
 * Returns `null` if the active tab is not in the list.
 */
export function nextTab(tabs: readonly TabDef[], active: TabId): TabId | null {
  return neighbourTab(tabs, active, 1);
}

/**
 * Resolve a `1`–`6` number-key jump to a tab id. Returns `null` for a
 * non-number key or an out-of-range index.
 */
export function jumpTab(tabs: readonly TabDef[], input: string): TabId | null {
  if (!/^[1-6]$/.test(input)) {
    return null;
  }
  const tab = tabs[Number.parseInt(input, 10) - 1];
  return tab !== undefined ? tab.id : null;
}
