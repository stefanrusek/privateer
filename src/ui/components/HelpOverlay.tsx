/**
 * HelpOverlay component — full-screen keyboard reference.
 * Spec 02 §4.
 */

import React from 'react';
import { Box, Text } from 'ink';

export interface HelpOverlayProps {
  open: boolean;
  onClose: () => void;
}

const KEYBINDINGS: readonly { keys: string; description: string }[] = [
  { keys: 'Tab / Shift+Tab', description: 'Cycle focus between panes' },
  { keys: 'j / k', description: 'Move down / up in list' },
  { keys: 'g g', description: 'Jump to top' },
  { keys: 'G', description: 'Jump to bottom' },
  { keys: '/', description: 'Enter search mode' },
  { keys: ':', description: 'Enter command mode' },
  { keys: 'Escape', description: 'Return to normal mode' },
  { keys: '?', description: 'Toggle this help overlay' },
  { keys: 'c', description: 'Open context switcher' },
  { keys: 'q', description: 'Quit' },
];

export function HelpOverlay({
  open,
  onClose: _onClose,
}: HelpOverlayProps): React.ReactElement | null {
  if (!open) {
    return null;
  }

  return (
    <Box flexDirection="column" borderStyle="double" padding={1}>
      <Text bold>Keyboard Reference</Text>
      <Text> </Text>
      {KEYBINDINGS.map((binding) => (
        <Box key={binding.keys} flexDirection="row" gap={2}>
          <Text color="cyan" bold>
            {binding.keys}
          </Text>
          <Text>{binding.description}</Text>
        </Box>
      ))}
      <Text> </Text>
      <Text dimColor>Press ? or Escape to close</Text>
    </Box>
  );
}
