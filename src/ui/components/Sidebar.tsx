/**
 * Sidebar component — displays collapsible category groups with resource kinds.
 * Spec 02 §4.
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { SidebarCategory } from '../types.js';

export interface SidebarProps {
  items: readonly SidebarCategory[];
  activeKind: string;
  badgeCounts: ReadonlyMap<string, number>;
  dimmedKinds: ReadonlySet<string>;
  forbiddenKinds: ReadonlySet<string>;
  focusActive: boolean;
  onSelect: (kind: string) => void;
  onToggleCategory: (cat: string) => void;
  collapsedCategories: ReadonlySet<string>;
  /** Keyboard cursor target: 'Overview', a category id, or a leaf resourceKind. */
  cursorKind?: string | null;
}

export function Sidebar({
  items,
  activeKind,
  badgeCounts,
  dimmedKinds,
  forbiddenKinds,
  focusActive,
  onSelect: _onSelect,
  onToggleCategory: _onToggleCategory,
  collapsedCategories,
  cursorKind,
}: SidebarProps): React.ReactElement {
  return (
    <Box flexDirection="column">
      {cursorKind === 'Overview' ? (
        <Text inverse={focusActive} bold={!focusActive}>
          {'  '}Overview
        </Text>
      ) : focusActive ? (
        <Text bold color="cyan">
          {'  '}Overview
        </Text>
      ) : (
        <Text>{'  '}Overview</Text>
      )}
      {items.map((cat) => {
        const collapsed = collapsedCategories.has(cat.id);
        const indicator = collapsed ? '▶' : '▼';
        const catIsCursor = cursorKind === cat.id;
        return (
          <Box key={cat.id} flexDirection="column">
            <Text bold inverse={catIsCursor && focusActive}>
              {indicator} {cat.label}
            </Text>
            {!collapsed &&
              cat.children.map((leaf) => {
                const isActive = leaf.resourceKind === activeKind;
                const count = badgeCounts.get(leaf.resourceKind);
                const isDimmed = dimmedKinds.has(leaf.resourceKind);
                const isForbidden = forbiddenKinds.has(leaf.resourceKind);
                const isCursor = cursorKind === leaf.resourceKind;
                return (
                  <Box key={leaf.resourceKind} flexDirection="row">
                    {isActive ? (
                      <Text
                        color="green"
                        inverse={isCursor && focusActive}
                        bold={isCursor && !focusActive}
                      >
                        {'> '}
                        {leaf.label}
                      </Text>
                    ) : (
                      <Text
                        inverse={isCursor && focusActive}
                        bold={isCursor && !focusActive}
                      >
                        {'  '}
                        {leaf.label}
                      </Text>
                    )}
                    {isForbidden && <Text color="red"> [!]</Text>}
                    {!isForbidden && count !== undefined && (
                      <Text color={isDimmed ? 'gray' : 'white'}> {count}</Text>
                    )}
                  </Box>
                );
              })}
          </Box>
        );
      })}
    </Box>
  );
}
