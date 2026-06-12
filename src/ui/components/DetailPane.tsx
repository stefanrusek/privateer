/**
 * DetailPane — tabbed detail container.
 * Spec 04 §4. Tab availability by resource kind, Agent tab always present.
 */

import React from 'react';
import { Box, Text, useInput } from 'ink';
import type { ResourceObject } from '../../core/types.js';

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

export type TabId =
  | 'overview'
  | 'yaml'
  | 'events'
  | 'logs'
  | 'metrics'
  | 'agent';

export interface TabDef {
  id: TabId;
  label: string;
}

const ALL_TABS: readonly TabDef[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'yaml', label: 'YAML' },
  { id: 'events', label: 'Events' },
  { id: 'logs', label: 'Logs' },
  { id: 'metrics', label: 'Metrics' },
];

const AGENT_TAB: TabDef = { id: 'agent', label: 'Agent' };

// ---------------------------------------------------------------------------
// Tab availability matrix (Spec 04 §4.2)
// ---------------------------------------------------------------------------

function getAvailableTabs(kind: string, hasPrometheus: boolean): TabDef[] {
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
      // All others: Overview, YAML, Events, and Metrics only if Prometheus available
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

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface DetailPaneProps {
  resource: ResourceObject;
  activeTab: TabId;
  /** Warning event count for "Events (N)" label. */
  warningCount: number;
  /** Whether Prometheus is available (affects Metrics tab visibility for generic kinds). */
  hasPrometheus: boolean;
  /** Whether the detail pane has keyboard focus. */
  focused: boolean;
  onClose: () => void;
  onTabChange: (tab: TabId) => void;
  /** Called when the Agent tab should auto-open (Spec 04 §4.1 / Spec 07 §6). */
  onAgentTabRequest?: () => void;
  renderTabContent: (tab: TabId) => React.ReactNode;
}

// ---------------------------------------------------------------------------
// DetailPane component
// ---------------------------------------------------------------------------

export function DetailPane({
  resource,
  activeTab,
  warningCount,
  hasPrometheus,
  focused,
  onClose: _onClose,
  onTabChange,
  renderTabContent,
}: DetailPaneProps): React.ReactElement {
  const availableTabs = getAvailableTabs(resource.kind, hasPrometheus);

  // All navigable tabs: available content tabs + agent (always present)
  const navigableTabs: TabDef[] = [...availableTabs, AGENT_TAB];

  // Keyboard navigation (Spec 04 §4.1)
  useInput(
    (input, key) => {
      const next = navigateTab(
        input,
        key.tab,
        key.shift,
        activeTab,
        navigableTabs,
      );
      if (next !== null) {
        onTabChange(next);
      }
    },
    { isActive: focused },
  );

  // Tab label builder
  function tabLabel(tab: TabDef): string {
    if (tab.id === 'events' && warningCount > 0) {
      return `Events (${String(warningCount)})`;
    }
    return tab.label;
  }

  // Render tab bar
  const contentTabs = availableTabs.map((tab, i) => {
    const isActive = activeTab === tab.id;
    const label = tabLabel(tab);
    return (
      <Box key={tab.id} flexDirection="row">
        {i > 0 && <Text> </Text>}
        <Text bold={isActive} underline={isActive}>
          [{label}]
        </Text>
      </Box>
    );
  });

  const isAgentActive = activeTab === 'agent';

  return (
    <Box flexDirection="column">
      {/* Tab bar */}
      <Box flexDirection="row" gap={1}>
        {/* Resource name */}
        <Text bold>{resource.name}</Text>
        <Text> </Text>

        {/* Content tabs */}
        <Box flexDirection="row">{contentTabs}</Box>

        {/* Divider before agent */}
        <Text dimColor> · </Text>

        {/* Agent tab — always present */}
        <Text bold={isAgentActive} underline={isAgentActive}>
          [Agent]
        </Text>

        {/* Close button */}
        <Text> </Text>
        <Text>✕</Text>
      </Box>

      {/* Tab content */}
      <Box flexDirection="column">{renderTabContent(activeTab)}</Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Exported helper — compute available tabs for a given kind
// (used by tests and container components)
// ---------------------------------------------------------------------------

export { getAvailableTabs };

/**
 * Pure keyboard navigation helper — compute the next tab ID for a given input.
 * Exposed for unit testing and reuse.
 */
export function navigateTab(
  input: string,
  isTab: boolean,
  isShift: boolean,
  activeTab: TabId,
  navigableTabs: readonly TabDef[],
): TabId | null {
  // Number keys 1–6
  const numMatch = /^[1-6]$/.exec(input);
  if (numMatch !== null) {
    const idx = parseInt(input, 10) - 1;
    const tab = navigableTabs[idx];
    return tab !== undefined ? tab.id : null;
  }

  // Tab / Shift+Tab cycling
  if (isTab) {
    const currentIdx = navigableTabs.findIndex((t) => t.id === activeTab);
    const nextIdx = isShift
      ? (currentIdx - 1 + navigableTabs.length) % navigableTabs.length
      : (currentIdx + 1) % navigableTabs.length;
    const next = navigableTabs[nextIdx];
    return next !== undefined ? next.id : null;
  }

  return null;
}
