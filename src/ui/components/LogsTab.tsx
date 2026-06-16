/**
 * LogsTab — pod log streaming view (Spec 05 §3.2–§3.4). Pure, prop-driven: the
 * parent owns the LogStream subscription, ring buffer, search state, and
 * toolbar toggles; this component renders the toolbar, the (colorized,
 * optionally searched) log lines, the resume-live-tail affordance, and the
 * search bar. Frame-tested to 100%.
 */

import React, { type ReactNode } from 'react';
import { Box, Text } from 'ink';
import { colorizeLine } from '../../logs/colorize.js';
import type { LogLineColor } from '../../logs/colorize.js';
import type { SearchState } from '../../logs/search.js';
import { currentMatchLine } from '../../logs/search.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LogsTabProps {
  /** Pod name (shown in the title bar). */
  podName: string;
  /** Currently selected container name. */
  container: string;
  /** Buffered log lines, oldest first. */
  lines: readonly string[];
  /** Whether the stream is live (tailing) or paused. */
  live: boolean;
  /** Whether timestamp prefixes are shown. */
  timestamps: boolean;
  /** Whether long lines wrap at pane width. */
  wrap: boolean;
  /** The toolbar button label for the line-limit selection (e.g. "100 lines"). */
  lineLimitLabel: string;
  /** Whether to read the previous terminated instance. */
  previous: boolean;
  /** Current search state (drives match highlight and the search bar). */
  search: SearchState;
  /** Whether the search bar is focused for input. */
  searchFocused: boolean;
  /**
   * When paused and new lines are available downstream, show the
   * [Resume live tail ↓] button.
   */
  newLinesAvailable: boolean;
  /** A transient confirmation message (e.g. "✓ Saved to ~/Downloads/…"). */
  confirmation?: string;
  /**
   * The interactive toolbar (B06): the measured `<DropdownButton>` /
   * `<Button>` widgets the live app injects. When omitted, a static
   * (non-interactive) toolbar is rendered — used by frame tests.
   */
  toolbar?: ReactNode;
}

// ---------------------------------------------------------------------------
// Color mapping
// ---------------------------------------------------------------------------

const INK_COLOR: Record<LogLineColor, string> = {
  red: 'red',
  yellow: 'yellow',
  grey: 'gray',
  white: 'white',
};

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

function Toolbar(props: {
  container: string;
  live: boolean;
  lineLimitLabel: string;
  previous: boolean;
}): React.ReactElement {
  const { container, live, lineLimitLabel, previous } = props;
  return (
    <Box flexDirection="row" gap={1}>
      <Text>
        [{container}
        {previous ? ' (previous)' : ''} ▾]
      </Text>
      {live ? (
        <Text color="green">[● Live]</Text>
      ) : (
        <Text dimColor>[○ Paused]</Text>
      )}
      <Text>[Timestamps]</Text>
      <Text>[Wrap]</Text>
      <Text>[{lineLimitLabel} ▾]</Text>
      <Text>[Download]</Text>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Log line rendering
// ---------------------------------------------------------------------------

function LogLine(props: {
  line: string;
  isCurrentMatch: boolean;
}): React.ReactElement {
  const { line, isCurrentMatch } = props;
  const color = INK_COLOR[colorizeLine(line)];
  if (isCurrentMatch) {
    return (
      <Text color={color} inverse>
        {line}
      </Text>
    );
  }
  return <Text color={color}>{line}</Text>;
}

// ---------------------------------------------------------------------------
// LogsTab component
// ---------------------------------------------------------------------------

export function LogsTab(props: LogsTabProps): React.ReactElement {
  const {
    podName,
    container,
    lines,
    live,
    timestamps,
    wrap,
    lineLimitLabel,
    previous,
    search,
    searchFocused,
    newLinesAvailable,
    confirmation,
    toolbar,
  } = props;

  const matchLine = currentMatchLine(search);
  const title = `Logs — ${podName} / ${container}`;

  // A subtle reminder of the toggle states, so persisted on/off is visible.
  const stateHints: string[] = [];
  stateHints.push(timestamps ? 'Timestamps: on' : 'Timestamps: off');
  stateHints.push(wrap ? 'Wrap: on' : 'Wrap: off');

  return (
    <Box flexDirection="column">
      <Text bold>{title}</Text>
      {toolbar !== undefined ? (
        toolbar
      ) : (
        <Toolbar
          container={container}
          live={live}
          lineLimitLabel={lineLimitLabel}
          previous={previous}
        />
      )}
      <Text dimColor>{stateHints.join('  ')}</Text>
      <Text dimColor>{'─'.repeat(40)}</Text>
      <Box flexDirection="column">
        {lines.length === 0 ? (
          <Text dimColor>No log lines</Text>
        ) : (
          lines.map((line, i) => (
            <LogLine key={i} line={line} isCurrentMatch={i === matchLine} />
          ))
        )}
      </Box>
      {!live && newLinesAvailable && (
        <Text color="cyan">[Resume live tail ↓]</Text>
      )}
      {searchFocused ? (
        <Text>
          [Search logs: /{search.query}
          {search.matches.length > 0
            ? `  ${String(search.current + 1)}/${String(search.matches.length)}`
            : search.query === ''
              ? ''
              : '  no matches'}
          ]
        </Text>
      ) : (
        search.query !== '' && (
          <Text dimColor>
            /{search.query}{' '}
            {search.matches.length > 0
              ? `${String(search.current + 1)}/${String(search.matches.length)}`
              : 'no matches'}
          </Text>
        )
      )}
      {confirmation !== undefined && <Text color="green">{confirmation}</Text>}
    </Box>
  );
}
