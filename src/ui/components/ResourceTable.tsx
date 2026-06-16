/**
 * ResourceTable component — virtual-scroll list view for Kubernetes resources.
 * Spec 04 §3.
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { ColumnDef } from '../../resources/columns.js';
import type { TableModel, TableRow } from '../resource-table-model.js';
import {
  getSortedFilteredRows,
  getVisibleRows,
} from '../resource-table-model.js';
import {
  naturalWidths,
  pinnedCount,
  resolveRowWindow,
} from '../list-horizontal.js';

export interface ResourceTableProps {
  model: TableModel;
  columns: ColumnDef[];
  visibleHeight: number;
  nowMs: number;
  namespace: string;
  onScrollDown: (delta: number) => void;
  onScrollUp: (delta: number) => void;
  onScrollToStart: () => void;
  onScrollToEnd: () => void;
  onPageDown: () => void;
  onPageUp: () => void;
  /** Absolute index (into the full sorted/filtered row list) of the selected row. */
  selectedIndex?: number;
  /** When false, the selected row renders bold instead of inverse. Default true. */
  focused?: boolean;
  /** Total table width in columns used to resolve percentage widths. Default 120. */
  totalWidth?: number;
}

// ---------------------------------------------------------------------------
// Column width resolution
// ---------------------------------------------------------------------------

function truncate(text: string, maxWidth: number): string {
  if (text.length <= maxWidth) {
    return text;
  }
  return text.slice(0, maxWidth - 1) + '…';
}

function padRight(text: string, width: number): string {
  if (text.length >= width) {
    return text.slice(0, width);
  }
  return text + ' '.repeat(width - text.length);
}

function padLeft(text: string, width: number): string {
  return ' '.repeat(Math.max(0, width - text.length)) + text.slice(0, width);
}

// ---------------------------------------------------------------------------
// Sort indicator
// ---------------------------------------------------------------------------

function sortIndicator(
  header: string,
  model: TableModel,
  colIndex: number,
): string {
  const isNameCol = header === 'Name';
  const isStatusCol = colIndex === 0 && header === '';

  const activeOnName = model.sortKey === 'name' && isNameCol;
  const activeOnStatus = model.sortKey === 'status' && isStatusCol;

  if (activeOnName || activeOnStatus) {
    return model.sortDir === 'asc' ? '▲' : '▼';
  }

  return '';
}

// ---------------------------------------------------------------------------
// Status dot color
// ---------------------------------------------------------------------------

type InkColor = 'green' | 'yellow' | 'red' | 'grey' | 'white';

function statusDotColor(color: string): InkColor {
  if (color === 'green') return 'green';
  if (color === 'yellow') return 'yellow';
  if (color === 'red') return 'red';
  return 'white';
}

// ---------------------------------------------------------------------------
// Row rendering
// ---------------------------------------------------------------------------

function renderCell(
  col: ColumnDef,
  row: TableRow,
  colWidth: number,
  nowMs: number,
): React.ReactElement {
  if (col.header === '' && colWidth <= 3) {
    // Status column — render colored dot
    const dotColor = statusDotColor(row.resource.status.color);
    return (
      <Text color={dotColor} key="status">
        {'● '}
      </Text>
    );
  }

  const raw = row.resource.raw;
  const cellText = col.accessor(raw, nowMs);

  if (col.align === 'right') {
    return <Text key={col.header}>{padLeft(cellText, colWidth)}</Text>;
  }

  return (
    <Text key={col.header}>
      {padRight(truncate(cellText, colWidth), colWidth)}
    </Text>
  );
}

function rowColor(row: TableRow): InkColor | undefined {
  if (row.state === 'new') return 'green';
  if (row.state === 'modified') return 'yellow';
  return undefined;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ResourceTable(props: ResourceTableProps): React.ReactElement {
  const {
    model,
    columns,
    visibleHeight,
    nowMs,
    namespace,
    selectedIndex,
    focused = true,
    totalWidth = 120,
  } = props;

  // Natural (stable, data-independent) widths and the horizontal window for the
  // current offset (Spec nav-05). The status dot + Name columns are pinned and
  // never scroll; the rest pan together. Each visible column renders at its
  // natural width minus any right-edge clip.
  const widths = naturalWidths(columns);
  const pinned = pinnedCount(columns);
  const window = resolveRowWindow(
    columns,
    widths,
    pinned,
    model.horizontalOffset,
    totalWidth,
  );
  const visibleCols: { col: ColumnDef; width: number }[] = [
    ...window.pinned.map((p) => ({ col: p.col, width: p.width })),
    ...window.scrollable.map((s) => ({ col: s.col, width: s.width - s.clip })),
  ];

  // Empty/error/loading states
  if (model.loadState === 'loading') {
    return (
      <Box flexDirection="column">
        <Text>Loading {model.kind}…</Text>
      </Box>
    );
  }

  if (model.loadState === 'forbidden') {
    return (
      <Box flexDirection="column">
        <Text>Permission denied — cannot list {model.kind}</Text>
      </Box>
    );
  }

  if (model.loadState === 'connection-error') {
    return (
      <Box flexDirection="column">
        <Text>
          Connection error — retrying… ({String(model.connectionAttempt)}/
          {String(model.connectionMax)})
        </Text>
      </Box>
    );
  }

  const sortedRows = getSortedFilteredRows(model);

  if (sortedRows.length === 0 && model.search.length === 0) {
    return (
      <Box flexDirection="column">
        <Text>
          No {model.kind} found in {namespace}
        </Text>
      </Box>
    );
  }

  if (sortedRows.length === 0) {
    return (
      <Box flexDirection="column">
        <Text>No results for &quot;{model.search}&quot;</Text>
      </Box>
    );
  }

  // Header row. The `‹`/`›` "more columns" markers (Spec nav-05) are overlaid
  // onto the header cells without changing any column width, so the header row
  // stays the same width as the data rows and nothing shifts.
  const firstScrollableIndex = window.pinned.length;
  const lastVisibleIndex = visibleCols.length - 1;

  const headerCells = visibleCols.map(({ col, width }, i) => {
    const indicator = sortIndicator(col.header, model, i);
    const headerText =
      col.header.length === 0
        ? '  '
        : col.header + (indicator.length > 0 ? indicator : ' ');

    // `width` is always >= 1 here (pinned widths are >= 2; a windowed scrollable
    // column is only emitted when at least one cell of it fits), so overwriting
    // one edge cell with a marker never shifts the column.
    let cellText = padRight(truncate(headerText, width), width);
    if (window.leftMore && i === firstScrollableIndex) {
      cellText = '‹' + cellText.slice(1);
    }
    if (window.rightMore && i === lastVisibleIndex) {
      cellText = cellText.slice(0, width - 1) + '›';
    }

    return (
      <Text key={`hdr-${String(i)}`} bold>
        {cellText}
      </Text>
    );
  });

  // Visible rows
  const visible = getVisibleRows(model, model.scrollOffset, visibleHeight);

  const rowElements = visible.map((row, vi) => {
    const cells = visibleCols.map(({ col, width: colWidth }) => {
      return renderCell(col, row, colWidth, nowMs);
    });

    const color = rowColor(row);
    const isDimmed = row.state === 'deleted';
    const isSelected = model.scrollOffset + vi === selectedIndex;

    return (
      <Box key={row.resource.uid} flexDirection="row">
        {isSelected
          ? cells.map((cell, ci) =>
              focused ? (
                <Text key={String(ci)} inverse>
                  {cell}
                </Text>
              ) : (
                <Text key={String(ci)} bold>
                  {cell}
                </Text>
              ),
            )
          : isDimmed
            ? cells.map((cell, ci) => (
                <Text key={String(ci)} dimColor>
                  {cell}
                </Text>
              ))
            : color !== undefined
              ? cells.map((cell, ci) => (
                  <Text key={String(ci)} color={color}>
                    {cell}
                  </Text>
                ))
              : cells}
      </Box>
    );
  });

  return (
    <Box flexDirection="column">
      <Box flexDirection="row">{headerCells}</Box>
      {rowElements}
    </Box>
  );
}
