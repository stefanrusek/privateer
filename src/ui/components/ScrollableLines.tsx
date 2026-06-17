/**
 * ScrollableLines — the shared presentational renderer for a read-only detail
 * tab's scroll viewport (navigation-overhaul chunk 03).
 *
 * Given the tab's already-projected `ViewLine[]` (from `detail-view.ts`), an
 * offset, and a viewport height, it renders only the visible window
 * (`visibleSlice`) plus a one-column scrollbar gutter when the content overflows
 * (`scrollbar`). All offset math lives in the pure `scroll-viewport` module; this
 * component just maps the windowed lines to styled `<Text>` rows.
 *
 * When `viewportHeight` is omitted the component renders **all** lines (the
 * non-windowed path used by the static component tests and any non-measured
 * host), so callers can adopt the viewport incrementally.
 */

import React from 'react';
import { Box, Text } from 'ink';
import { visibleSlice, scrollbar, type ViewLine } from '../scroll-viewport.js';

export interface ScrollableLinesProps {
  /** The full projected content; the viewport windows over it. */
  readonly lines: readonly ViewLine[];
  /** Topmost visible row (0 = top). Ignored when `viewportHeight` is omitted. */
  readonly offset?: number;
  /** Rows the viewport can show; when omitted every line renders. */
  readonly viewportHeight?: number;
}

function LineText({ line }: { line: ViewLine }): React.ReactElement {
  return (
    <Text
      {...(line.color !== undefined ? { color: line.color } : {})}
      {...(line.bold !== undefined ? { bold: line.bold } : {})}
      {...(line.dim !== undefined ? { dimColor: line.dim } : {})}
    >
      {line.text === '' ? ' ' : line.text}
    </Text>
  );
}

export function ScrollableLines({
  lines,
  offset = 0,
  viewportHeight,
}: ScrollableLinesProps): React.ReactElement {
  if (viewportHeight === undefined) {
    return (
      <Box flexDirection="column">
        {lines.map((line, i) => (
          <LineText key={i} line={line} />
        ))}
      </Box>
    );
  }

  const visible = visibleSlice(lines, offset, viewportHeight);
  const bar = scrollbar(offset, lines.length, viewportHeight);
  if (bar === null) {
    return (
      <Box flexDirection="column">
        {visible.map((line, i) => (
          <LineText key={i} line={line} />
        ))}
      </Box>
    );
  }

  // One-column scrollbar gutter: `█` over the thumb rows, `│` elsewhere.
  return (
    <Box flexDirection="row">
      <Box flexDirection="column">
        {visible.map((line, i) => (
          <LineText key={i} line={line} />
        ))}
      </Box>
      <Box flexDirection="column" marginLeft={1}>
        {Array.from({ length: viewportHeight }, (_, i) => {
          const onThumb =
            i >= bar.thumbStart && i < bar.thumbStart + bar.thumbSize;
          return (
            <Text key={i} dimColor>
              {onThumb ? '█' : '│'}
            </Text>
          );
        })}
      </Box>
    </Box>
  );
}
