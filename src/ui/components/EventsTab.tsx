/**
 * EventsTab — on-demand Kubernetes events view.
 * Spec 04 §8. Fetches via KubeClient.listEvents (field-selector LIST, not watch).
 * Spec 01 §3.1: Normal events are never watched, always fetched on-demand.
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { KubeClient } from '../../boundaries/kube-client.js';
import type { KubernetesObject } from '../../core/types.js';
import { formatAge } from '../../resources/age.js';
import { projectEventsLines } from '../detail-view.js';
import { ScrollableLines } from './ScrollableLines.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single row in the events table. */
export interface EventRow {
  type: string;
  reason: string;
  lastTimestamp: string;
  count: number;
  message: string;
}

/** Props for the EventsTab display component (pure, prop-driven). */
export interface EventsTabProps {
  /** Events already filtered to the current showAll setting, sorted desc. */
  events: EventRow[];
  /** Total number of warning events (used in label). */
  warningCount: number;
  /** Whether All events are shown (true) or only Warnings (false). */
  showAll: boolean;
  /** Callback to toggle the showAll filter. */
  onToggleShowAll: () => void;
  /** Current time in epoch ms — for age formatting. */
  nowMs: number;
  /** Detail pane inner width — rows clip here (chunk 02/03). */
  width?: number;
  /** Topmost visible row in the scroll viewport (chunk 03). */
  offset?: number;
  /** Viewport height; when set the body scrolls instead of rendering all rows. */
  viewportHeight?: number;
}

// ---------------------------------------------------------------------------
// Async fetcher — pure function (not a hook) so it can be called in tests
// ---------------------------------------------------------------------------

export interface EventsFetcherOptions {
  kubeClient: KubeClient;
  resourceName: string;
  resourceKind: string;
  namespace: string;
  /** When true fetch all types; when false fetch only Warning. */
  showAll: boolean;
  nowMs: number;
}

export interface EventsFetcherResult {
  /** Rows matching the current filter, sorted by lastTimestamp desc. */
  events: EventRow[];
  /** Count of Warning events (regardless of showAll). */
  warningCount: number;
}

/** Fetch and process events. Called by tests and by the async hook. */
export async function useEventsFetcher(
  options: EventsFetcherOptions,
): Promise<EventsFetcherResult> {
  const { kubeClient, resourceName, resourceKind, namespace, showAll } =
    options;

  // Always fetch all events for this object so we can compute warningCount.
  const allResult = await kubeClient.listEvents({
    involvedObjectName: resourceName,
    involvedObjectKind: resourceKind,
    namespace,
  });

  const allRaw: KubernetesObject[] = allResult.ok ? allResult.value : [];

  const warningCount = allRaw.filter((e) => e.type === 'Warning').length;

  const sourceRaw = showAll
    ? allRaw
    : allRaw.filter((e) => e.type === 'Warning');

  const rows: EventRow[] = sourceRaw.map((e) => ({
    type: typeof e.type === 'string' ? e.type : '',
    reason: typeof e.reason === 'string' ? e.reason : '',
    lastTimestamp: typeof e.lastTimestamp === 'string' ? e.lastTimestamp : '',
    count: typeof e.count === 'number' ? e.count : 0,
    message: typeof e.message === 'string' ? e.message : '',
  }));

  // Sort by lastTimestamp descending (most recent first).
  rows.sort((a, b) => {
    const ta = a.lastTimestamp === '' ? 0 : new Date(a.lastTimestamp).getTime();
    const tb = b.lastTimestamp === '' ? 0 : new Date(b.lastTimestamp).getTime();
    return tb - ta;
  });

  return { events: rows, warningCount };
}

// ---------------------------------------------------------------------------
// Column widths (Spec 04 §8.3)
// ---------------------------------------------------------------------------

const COL_TYPE = 8;
const COL_REASON = 20;
const COL_AGE = 10;
const COL_COUNT = 6;

function padRight(s: string, w: number): string {
  if (s.length >= w) {
    return s.slice(0, w);
  }
  return s + ' '.repeat(w - s.length);
}

function padLeft(s: string, w: number): string {
  if (s.length >= w) {
    return s.slice(0, w);
  }
  return ' '.repeat(w - s.length) + s;
}

// ---------------------------------------------------------------------------
// EventsTab component
// ---------------------------------------------------------------------------

export function EventsTab({
  events,
  warningCount,
  showAll,
  onToggleShowAll: _onToggleShowAll,
  nowMs,
  width = 80,
  offset = 0,
  viewportHeight,
}: EventsTabProps): React.ReactElement {
  if (viewportHeight !== undefined) {
    return (
      <ScrollableLines
        lines={projectEventsLines(events, warningCount, showAll, nowMs, width)}
        offset={offset}
        viewportHeight={viewportHeight}
      />
    );
  }

  // Empty states (Spec 04 §8.4)
  if (events.length === 0 && !showAll) {
    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" gap={2}>
          <Text bold>[Warning ✓]</Text>
          <Text dimColor>[All]</Text>
        </Box>
        <Box flexDirection="row" gap={2}>
          <Text>No warning events</Text>
          <Text color="cyan" underline>
            [Show all events]
          </Text>
        </Box>
      </Box>
    );
  }

  if (events.length === 0 && showAll) {
    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" gap={2}>
          <Text dimColor>[Warning]</Text>
          <Text bold>[All ✓]</Text>
        </Box>
        <Text>No events</Text>
      </Box>
    );
  }

  // Toggle bar
  const toggleBar = showAll ? (
    <Box flexDirection="row" gap={2}>
      <Text dimColor>[Warning]</Text>
      <Text bold>[All ✓]</Text>
      {warningCount > 0 && (
        <Text dimColor>{String(warningCount)} warnings</Text>
      )}
    </Box>
  ) : (
    <Box flexDirection="row" gap={2}>
      <Text bold>[Warning ✓]</Text>
      <Text dimColor>[All]</Text>
      <Text dimColor>
        {String(events.length)} events ({String(warningCount)} warnings)
      </Text>
    </Box>
  );

  // Header row
  const header = (
    <Box flexDirection="row">
      <Text bold>{padRight('Type', COL_TYPE)}</Text>
      <Text bold>{padRight('Reason', COL_REASON)}</Text>
      <Text bold>{padRight('Age', COL_AGE)}</Text>
      <Text bold>{padLeft('Count', COL_COUNT)}</Text>
      <Text bold> Message</Text>
    </Box>
  );

  // Divider
  const divider = (
    <Text dimColor>
      {'─'.repeat(COL_TYPE + COL_REASON + COL_AGE + COL_COUNT + 20)}
    </Text>
  );

  // Event rows
  const rows = events.map((row, i) => {
    const age =
      row.lastTimestamp === '' ? '' : formatAge(row.lastTimestamp, nowMs);
    const isWarning = row.type === 'Warning';
    return (
      <Box key={i} flexDirection="row">
        {isWarning ? (
          <Text color="yellow">{padRight(row.type, COL_TYPE)}</Text>
        ) : (
          <Text>{padRight(row.type, COL_TYPE)}</Text>
        )}
        <Text>{padRight(row.reason, COL_REASON)}</Text>
        <Text>{padRight(age, COL_AGE)}</Text>
        <Text>{padLeft(String(row.count), COL_COUNT)}</Text>
        <Text> {row.message}</Text>
      </Box>
    );
  });

  return (
    <Box flexDirection="column">
      {toggleBar}
      <Box flexDirection="column">
        {header}
        {divider}
        {rows}
      </Box>
    </Box>
  );
}
