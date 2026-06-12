/**
 * Logo — the Privateer block-letter mark.
 *
 * Hand-crafted "P9R" in Unicode block characters, rendered one color per
 * line on a cyan → blue → magenta ramp with a dim tagline underneath.
 * Every line is padded to the same display width so the art stays crisp
 * in a monospace terminal; `LOGO_LINES` is exported so the README can
 * embed the art verbatim.
 */

import React from 'react';
import { Box, Text } from 'ink';

/** One line of logo art paired with its ramp color. */
interface LogoRow {
  readonly line: string;
  readonly color: string;
}

const LOGO_ROWS: readonly LogoRow[] = [
  { line: '██████╗   █████╗  ██████╗ ', color: 'cyanBright' },
  { line: '██╔══██╗ ██╔══██╗ ██╔══██╗', color: 'cyan' },
  { line: '██████╔╝ ╚██████║ ██████╔╝', color: 'blueBright' },
  { line: '██╔═══╝   ╚═══██║ ██╔══██╗', color: 'blue' },
  { line: '██║       █████╔╝ ██║  ██║', color: 'magentaBright' },
  { line: '╚═╝       ╚════╝  ╚═╝  ╚═╝', color: 'magenta' },
];

/** Block-letter logo lines (also reused verbatim in the README). */
export const LOGO_LINES: readonly string[] = LOGO_ROWS.map((row) => row.line);

export const LOGO_TAGLINE = 'P R I V A T E E R · the agentic Kubernetes TUI';

export function Logo(): React.ReactElement {
  return (
    <Box flexDirection="column">
      {LOGO_ROWS.map((row) => (
        <Text key={row.line} color={row.color}>
          {row.line}
        </Text>
      ))}
      <Text dimColor>{LOGO_TAGLINE}</Text>
    </Box>
  );
}
