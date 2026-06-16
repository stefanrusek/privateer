/**
 * DetailPane — tabbed detail container.
 * Spec 04 §4. Tab availability by resource kind, Agent tab always present.
 *
 * Navigation-overhaul chunk 01: tab switching is driven entirely by the
 * controller (`←`/`→` switch tabs, `1`–`6` jump, `Tab` cycles regions). This
 * component is now purely presentational — it no longer owns a `useInput`. The
 * navigable-tab logic lives in the pure `src/ui/detail-tabs.ts` module, which
 * this component re-exports for existing importers.
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { ResourceObject } from '../../core/types.js';
import { getAvailableTabs, type TabId, type TabDef } from '../detail-tabs.js';

export type { TabId, TabDef };
export { getAvailableTabs };

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
  onClose: _onClose,
  onTabChange: _onTabChange,
  renderTabContent,
}: DetailPaneProps): React.ReactElement {
  const availableTabs = getAvailableTabs(resource.kind, hasPrometheus);

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
