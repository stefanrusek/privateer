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
}: SidebarProps): React.ReactElement {
  return (
    <Box flexDirection="column">
      {focusActive ? (
        <Text bold color="cyan">
          {'  '}Overview
        </Text>
      ) : (
        <Text>{'  '}Overview</Text>
      )}
      {items.map((cat) => {
        const collapsed = collapsedCategories.has(cat.id);
        const indicator = collapsed ? '▶' : '▼';
        return (
          <Box key={cat.id} flexDirection="column">
            <Text bold>
              {indicator} {cat.label}
            </Text>
            {!collapsed &&
              cat.children.map((leaf) => {
                const isActive = leaf.resourceKind === activeKind;
                const count = badgeCounts.get(leaf.resourceKind);
                const isDimmed = dimmedKinds.has(leaf.resourceKind);
                const isForbidden = forbiddenKinds.has(leaf.resourceKind);
                return (
                  <Box key={leaf.resourceKind} flexDirection="row">
                    {isActive ? (
                      <Text color="green">
                        {'> '}
                        {leaf.label}
                      </Text>
                    ) : (
                      <Text>
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
