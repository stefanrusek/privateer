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
 *
 * `width`, when supplied, is the pane's measured inner width (P9R-0006): each
 * line is space-padded out to it so the content column is always exactly
 * `width` wide, regardless of how short the actual text is. Content whose
 * natural length happens to fall short of the pane (a shallow YAML manifest, a
 * narrow chart) previously left the row's `<Box>` auto-sized to the longest
 * *rendered* line, so the scrollbar gutter sat wherever that line ended
 * instead of hugging the pane's right border. Padding to `width` is the single
 * source of truth that keeps every tab's content column — and its scrollbar —
 * flush with the measured pane, independent of content length.
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
  /**
   * The pane's measured inner width. When supplied, every rendered line is
   * padded to exactly this many columns so the content fills the pane and the
   * scrollbar hugs the right border (P9R-0006).
   */
  readonly width?: number;
}

/** Space-pad `text` to `width` columns (no-op when already that long or `width` is unset). */
function padToWidth(text: string, width: number | undefined): string {
  if (width === undefined || text.length >= width) {
    return text;
  }
  return text + ' '.repeat(width - text.length);
}

function LineText({
  line,
  width,
}: {
  line: ViewLine;
  width: number | undefined;
}): React.ReactElement {
  const text = line.text === '' ? ' ' : line.text;
  return (
    <Text
      {...(line.color !== undefined ? { color: line.color } : {})}
      {...(line.bold !== undefined ? { bold: line.bold } : {})}
      {...(line.dim !== undefined ? { dimColor: line.dim } : {})}
    >
      {padToWidth(text, width)}
    </Text>
  );
}

export function ScrollableLines({
  lines,
  offset = 0,
  viewportHeight,
  width,
}: ScrollableLinesProps): React.ReactElement {
  if (viewportHeight === undefined) {
    return (
      <Box flexDirection="column">
        {lines.map((line, i) => (
          <LineText key={i} line={line} width={width} />
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
          <LineText key={i} line={line} width={width} />
        ))}
      </Box>
    );
  }

  // One-column scrollbar gutter: `█` over the thumb rows, `│` elsewhere. The
  // content column is a fixed `width` box so the gutter always hugs the
  // pane's right border, not wherever the longest visible line happens to end.
  return (
    <Box flexDirection="row">
      <Box flexDirection="column" width={width}>
        {visible.map((line, i) => (
          <LineText key={i} line={line} width={width} />
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
