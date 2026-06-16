/**
 * Header component — displays namespace selector and search bar.
 * Spec 02 §4.
 */

import React from 'react';
import { Box, Text } from 'ink';

export interface HeaderProps {
  /**
   * Current kube context, shown as a distinct chip to the left of the namespace
   * (Spec 02 §"Header content"). Chunk 04 wraps it as a `<Button>` opening the
   * context switcher; rendering it as a separate inline element here is what
   * makes that wrap possible.
   */
  context: string;
  namespace: string;
  allNamespaces: readonly string[];
  search: string;
  onNamespaceChange: (ns: string) => void;
  onSearchChange: (s: string) => void;
  focused: 'context' | 'namespace' | 'search' | null;
}

export function Header({
  context,
  namespace,
  allNamespaces: _allNamespaces,
  search,
  onNamespaceChange: _onNamespaceChange,
  onSearchChange: _onSearchChange,
  focused,
}: HeaderProps): React.ReactElement {
  return (
    <Box flexDirection="row">
      {/* Context chip — left of the namespace (Spec 02 §"Header content"). */}
      <Box marginRight={1}>
        {focused === 'context' ? (
          <Text color="cyan" underline>
            {context}
          </Text>
        ) : (
          <Text bold>{context}</Text>
        )}
      </Box>
      <Box marginRight={2}>
        <Text>ns: </Text>
        {focused === 'namespace' ? (
          <Text color="cyan" underline>
            [{namespace} ▾]
          </Text>
        ) : (
          <Text>[{namespace} ▾]</Text>
        )}
      </Box>
      {/* Search — right-aligned (Spec 02 frame diagram). */}
      <Box flexGrow={1} justifyContent="flex-end">
        <Text>/</Text>
        {focused === 'search' ? (
          <Text color="cyan" underline>
            {search}
          </Text>
        ) : (
          <Text dimColor>{search}</Text>
        )}
      </Box>
    </Box>
  );
}
