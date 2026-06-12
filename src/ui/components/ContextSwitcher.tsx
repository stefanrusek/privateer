/**
 * ContextSwitcher overlay component — full-screen context picker.
 * Spec 02 §4.
 */

import React from 'react';
import { Box, Text } from 'ink';

export interface ContextSwitcherProps {
  open: boolean;
  contexts: readonly string[];
  currentContext: string;
  filter: string;
  onSelect: (ctx: string) => void;
  onClose: () => void;
}

export function ContextSwitcher({
  open,
  contexts,
  currentContext,
  filter,
  onSelect: _onSelect,
  onClose: _onClose,
}: ContextSwitcherProps): React.ReactElement | null {
  if (!open) {
    return null;
  }

  const filtered = contexts.filter((c) =>
    c.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <Box flexDirection="column" borderStyle="single" padding={1}>
      <Text bold>Switch Context</Text>
      <Box>
        <Text>filter: [{filter}]</Text>
      </Box>
      {filtered.map((ctx) => (
        <Box key={ctx} flexDirection="row">
          {ctx === currentContext ? (
            <Text color="green">● {ctx}</Text>
          ) : (
            <Text>
              {'  '}
              {ctx}
            </Text>
          )}
        </Box>
      ))}
      {filtered.length === 0 && <Text dimColor>No matching contexts</Text>}
    </Box>
  );
}
