/**
 * CommandBar component — renders context, mode indicator, and hints.
 * Spec 02 §4.
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { Mode } from '../types.js';

export interface CommandBarProps {
  context: string;
  namespace: string;
  resourceKind: string;
  mode: Mode;
  focused: boolean;
  hints: readonly string[];
}

interface ModeDisplay {
  label: string;
  color: string;
}

function modeDisplay(mode: Mode): ModeDisplay {
  switch (mode) {
    case 'normal':
      return { label: '·', color: 'gray' };
    case 'search':
      return { label: '/', color: 'white' };
    case 'command':
      return { label: '!', color: 'cyan' };
    case 'edit':
      return { label: 'EDIT', color: 'yellow' };
  }
}

export function CommandBar({
  context,
  namespace,
  resourceKind,
  mode,
  focused,
  hints,
}: CommandBarProps): React.ReactElement {
  const md = modeDisplay(mode);
  return (
    <Box flexDirection="row" gap={2}>
      <Text>ctx: {context}</Text>
      <Text>ns: {namespace}</Text>
      <Text>{resourceKind}</Text>
      <Text color={md.color} bold={focused}>
        [{md.label}]
      </Text>
      {!focused &&
        hints.map((hint, i) => (
          <Text key={i} dimColor>
            {hint}
          </Text>
        ))}
    </Box>
  );
}
