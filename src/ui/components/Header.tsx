/**
 * Header component — displays namespace selector and search bar.
 * Spec 02 §4.
 */

import React from 'react';
import { Box, Text } from 'ink';

export interface HeaderProps {
  namespace: string;
  allNamespaces: readonly string[];
  search: string;
  onNamespaceChange: (ns: string) => void;
  onSearchChange: (s: string) => void;
  focused: 'namespace' | 'search' | null;
}

export function Header({
  namespace,
  allNamespaces: _allNamespaces,
  search,
  onNamespaceChange: _onNamespaceChange,
  onSearchChange: _onSearchChange,
  focused,
}: HeaderProps): React.ReactElement {
  return (
    <Box flexDirection="row" gap={2}>
      <Box>
        <Text>ns: </Text>
        {focused === 'namespace' ? (
          <Text color="cyan" underline>
            [{namespace} ▾]
          </Text>
        ) : (
          <Text>[{namespace} ▾]</Text>
        )}
      </Box>
      <Box>
        <Text>search: </Text>
        {focused === 'search' ? (
          <Text color="cyan" underline>
            [{search}]
          </Text>
        ) : (
          <Text>[{search}]</Text>
        )}
      </Box>
    </Box>
  );
}
