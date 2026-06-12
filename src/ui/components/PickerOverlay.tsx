/**
 * PickerOverlay component — generic full-screen selection list.
 * Used for the namespace dropdown (Spec 02 §4.1) and the logs/exec
 * container picker (Spec 05 §3.1).
 *
 * Pure and prop-driven: no useInput — the adapter routes keys.
 */

import React from 'react';
import { Box, Text } from 'ink';

export interface PickerItem {
  /** Value returned on selection. */
  readonly value: string;
  /** Display label (may differ from value, e.g. "(all namespaces)"). */
  readonly label: string;
  /** Dim + annotate the row (e.g. terminated containers). */
  readonly note?: string;
}

export interface PickerOverlayProps {
  readonly title: string;
  readonly items: readonly PickerItem[];
  /** Highlighted row. */
  readonly selectedIndex: number;
  /** Optional filter text shown under the title; rows are NOT filtered here. */
  readonly filter?: string;
  /** Max rows to render; windows around selectedIndex like the sidebar. */
  readonly maxRows?: number;
}

/** A picker row paired with its absolute index for window positioning. */
interface PickerRow {
  item: PickerItem;
  index: number;
}

export function PickerOverlay({
  title,
  items,
  selectedIndex,
  filter,
  maxRows = 12,
}: PickerOverlayProps): React.ReactElement {
  const total = items.length;
  const rows: PickerRow[] = items.map((item, index) => ({ item, index }));

  let visible = rows;
  let showTop = false;
  let showBottom = false;

  if (total > maxRows) {
    // Reserve 2 lines for the clip indicators, leaving maxRows - 2 content
    // rows. The window is centered on the selected row and clamped to the
    // list bounds, so the selected row is always visible.
    const content = maxRows - 2;
    const maxOffset = Math.max(0, total - content);
    const offset = Math.min(
      Math.max(0, selectedIndex - Math.floor(content / 2)),
      maxOffset,
    );
    visible = rows.slice(offset, offset + content);
    showTop = offset > 0;
    showBottom = offset + content < total;
  }

  return (
    <Box flexDirection="column" borderStyle="round" padding={1}>
      <Text bold>{title}</Text>
      {filter !== undefined && (
        <Text>
          filter: {filter}
          {'█'}
        </Text>
      )}
      {total === 0 && <Text dimColor>No matches.</Text>}
      {showTop && <Text dimColor>↑ …</Text>}
      {visible.map(({ item, index }) => (
        <Box key={item.value} flexDirection="row">
          <Text inverse={index === selectedIndex}>{item.label}</Text>
          {item.note !== undefined && (
            <Text dimColor>
              {'  ('}
              {item.note}
              {')'}
            </Text>
          )}
        </Box>
      ))}
      {showBottom && <Text dimColor>↓ …</Text>}
      <Text dimColor>↑/↓ select · Enter confirm · Esc cancel</Text>
    </Box>
  );
}
