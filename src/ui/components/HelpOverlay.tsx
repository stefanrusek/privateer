/**
 * HelpOverlay — the `?` keyboard reference (navigation-overhaul chunk 09 / B09).
 *
 * Spec: `specs/002-navigation-overhaul/09-help-overlay-revamp.md` +
 * `specs/001-initial-features/spec-02-navigation-layout.md` §11.
 *
 * The overlay is **prop-driven glue** over the pure `keymap` registry: it renders
 * `KEYMAP` grouped with headings, leads with the group for the user's current
 * region/tab (then Global, then the rest), and underlines each accelerator letter
 * so the key matches its measured `[Co̲ntainer ▾]` button. It is scrollable — the
 * flattened lines are windowed through the shared scroll-viewport seam — and is
 * dismissed with `?`/`Esc` by the controller (which owns the scroll offset). All
 * the ordering/flattening decisions live in `keymap.ts`; this only renders.
 */

import React from 'react';
import { Box, Text } from 'ink';
import {
  helpLines,
  scopeForFocus,
  type HelpLine,
  type KeyBinding,
} from '../keymap.js';
import { clampOffset, scrollbar } from '../scroll-viewport.js';
import { renderAccelerator } from '../accelerator.js';

export interface HelpOverlayProps {
  open: boolean;
  onClose: () => void;
  /** The currently focused region; the overlay leads with its group. */
  focus?: string | null;
  /** The active detail tab (when the detail pane is focused). */
  tab?: string | null;
  /** First visible line (controller-owned scroll position; 0 = top). */
  scrollOffset?: number;
  /** Number of body rows to show before scrolling kicks in. */
  viewportHeight?: number;
}

/** Default body height when the host does not measure the terminal. */
const DEFAULT_VIEWPORT = 20;

/** Render a binding row: underlined-accelerator key column + description. */
function BindingRow({ binding }: { binding: KeyBinding }): React.ReactElement {
  const segments =
    binding.accelerator !== undefined
      ? renderAccelerator(binding.keys, binding.accelerator)
      : [{ text: binding.keys, underline: false }];
  return (
    <Box flexDirection="row">
      <Box width={22} flexDirection="row">
        {segments.map((seg, i) => (
          <Text key={i} color="cyan" bold underline={seg.underline}>
            {seg.text}
          </Text>
        ))}
      </Box>
      <Text>{binding.description}</Text>
    </Box>
  );
}

/** Render one flattened {@link HelpLine}. */
function LineRow({ line }: { line: HelpLine }): React.ReactElement {
  switch (line.kind) {
    case 'heading':
      return (
        <Text bold color="yellow">
          {line.text}
        </Text>
      );
    case 'binding':
      return <BindingRow binding={line.binding} />;
    case 'blank':
      return <Text> </Text>;
  }
}

export function HelpOverlay({
  open,
  onClose: _onClose,
  focus = null,
  tab = null,
  scrollOffset = 0,
  viewportHeight = DEFAULT_VIEWPORT,
}: HelpOverlayProps): React.ReactElement | null {
  if (!open) {
    return null;
  }

  const scope = scopeForFocus(focus, tab);
  const lines = helpLines(scope);
  // Window the flattened lines through the shared scroll-viewport seam: the
  // clamp + scrollbar math is reused verbatim (chunk 03), we just slice the
  // rich rows directly rather than projecting to ViewLines.
  const start = clampOffset(scrollOffset, lines.length, viewportHeight);
  const visible = lines.slice(start, start + viewportHeight);
  const bar = scrollbar(scrollOffset, lines.length, viewportHeight);

  return (
    <Box flexDirection="column" borderStyle="double" paddingX={1}>
      {/* Ink clips the first interior text cell of a bordered box, which dropped
          the title's leading "K". A sacrificial blank first row (its clipped
          leading space is invisible) keeps the title intact and doubles as the
          top padding (navigation-overhaul chunk 09). */}
      <Text> </Text>
      <Text bold>Keyboard Reference</Text>
      <Text> </Text>
      <Box flexDirection="row">
        <Box flexDirection="column" flexGrow={1}>
          {visible.map((line, i) => (
            <LineRow key={start + i} line={line} />
          ))}
        </Box>
        {bar !== null ? (
          <Box flexDirection="column" marginLeft={1}>
            {Array.from({ length: viewportHeight }, (_, row) => (
              <Text key={row} dimColor>
                {row >= bar.thumbStart && row < bar.thumbStart + bar.thumbSize
                  ? '█'
                  : '│'}
              </Text>
            ))}
          </Box>
        ) : null}
      </Box>
      <Text> </Text>
      <Text dimColor>↑/↓ scroll · ? or Escape to close</Text>
    </Box>
  );
}
