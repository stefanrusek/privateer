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
  /**
   * Maximum number of lines to render. When the total row count exceeds it,
   * only a window of `viewportHeight - 2` rows (two lines reserved for the
   * `↑ …`/`↓ …` clip indicators) is shown, centered on the cursor row and
   * clamped to the list bounds, so the cursor row is always visible.
   */
  viewportHeight?: number;
}

/** A sidebar row tagged with its cursor key for window positioning. */
interface SidebarRow {
  key: string;
  node: React.ReactElement;
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
  viewportHeight,
}: SidebarProps): React.ReactElement {
  const rows: SidebarRow[] = [];

  rows.push({
    key: 'Overview',
    node:
      cursorKind === 'Overview' ? (
        <Text key="Overview" inverse={focusActive} bold={!focusActive}>
          {'  '}Overview
        </Text>
      ) : focusActive ? (
        <Text key="Overview" bold color="cyan">
          {'  '}Overview
        </Text>
      ) : (
        <Text key="Overview">{'  '}Overview</Text>
      ),
  });

  for (const cat of items) {
    const collapsed = collapsedCategories.has(cat.id);
    const indicator = collapsed ? '▶' : '▼';
    const catIsCursor = cursorKind === cat.id;
    rows.push({
      key: cat.id,
      node: (
        <Text key={cat.id} bold inverse={catIsCursor && focusActive}>
          {indicator} {cat.label}
        </Text>
      ),
    });
    if (!collapsed) {
      for (const leaf of cat.children) {
        const isActive = leaf.resourceKind === activeKind;
        const count = badgeCounts.get(leaf.resourceKind);
        const isDimmed = dimmedKinds.has(leaf.resourceKind);
        const isForbidden = forbiddenKinds.has(leaf.resourceKind);
        const isCursor = cursorKind === leaf.resourceKind;
        rows.push({
          key: leaf.resourceKind,
          node: (
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
          ),
        });
      }
    }
  }

  const total = rows.length;
  let visible = rows;
  let showTop = false;
  let showBottom = false;

  if (viewportHeight !== undefined && total > viewportHeight) {
    // Reserve 2 lines for the clip indicators, leaving viewportHeight - 2
    // content rows. The window is centered on the cursor and clamped to the
    // list bounds, so at most viewportHeight lines are ever rendered (one
    // fewer when only one side is clipped) and the cursor is always inside.
    const content = viewportHeight - 2;
    const cursorIdx = Math.max(
      0,
      rows.findIndex((r) => r.key === cursorKind),
    );
    const maxOffset = Math.max(0, total - content);
    const offset = Math.min(
      Math.max(0, cursorIdx - Math.floor(content / 2)),
      maxOffset,
    );
    visible = rows.slice(offset, offset + content);
    showTop = offset > 0;
    showBottom = offset + content < total;
  }

  return (
    <Box flexDirection="column">
      {showTop && <Text dimColor>↑ …</Text>}
      {visible.map((r) => r.node)}
      {showBottom && <Text dimColor>↓ …</Text>}
    </Box>
  );
}
