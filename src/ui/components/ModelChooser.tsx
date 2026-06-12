/**
 * ModelChooser — first-run model selection screen.
 *
 * Pure and prop-driven: no useInput — the adapter routes keys. Renders the
 * logo, a bold prompt, one row per model option (selected row inverse with
 * a "❯ " prefix, dim detail line below, cyan "recommended" suffix), and a
 * dim key-hint footer.
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Logo } from './Logo.js';

export interface ModelOption {
  /** Stable identifier, e.g. 'gemma' | 'qwen' | 'none'. */
  readonly id: string;
  /** Display title, e.g. "Gemma 3n E2B". */
  readonly title: string;
  /** One-line summary, e.g. "Best answers · ~3GB download · CPU inference". */
  readonly detail: string;
  /** Tag the option as the best fit for this machine. */
  readonly recommended?: boolean;
}

export interface ModelChooserProps {
  readonly options: readonly ModelOption[];
  /** Highlighted row. */
  readonly selectedIndex: number;
}

export function ModelChooser({
  options,
  selectedIndex,
}: ModelChooserProps): React.ReactElement {
  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Logo />
      <Box height={1} />
      <Text bold>
        Choose your agent model — runs fully local, nothing leaves your machine.
      </Text>
      <Box height={1} />
      {options.map((option, index) => (
        <Box key={option.id} flexDirection="column">
          <Box flexDirection="row">
            <Text bold inverse={index === selectedIndex}>
              {index === selectedIndex ? '❯ ' : '  '}
              {option.title}
            </Text>
            {option.recommended === true && (
              <Text color="cyan"> (recommended for this machine)</Text>
            )}
          </Box>
          <Text dimColor>
            {'    '}
            {option.detail}
          </Text>
        </Box>
      ))}
      <Box height={1} />
      <Text dimColor>
        ↑/↓ select · Enter confirm · you can change this later in
        ~/.config/p9r/config.yaml
      </Text>
    </Box>
  );
}
