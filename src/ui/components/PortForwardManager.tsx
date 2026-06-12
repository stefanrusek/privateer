/**
 * PortForwardManager overlay component — shows active and recent port-forwards.
 * Spec 05 §5.2–§5.5.
 *
 * Purely display-driven; all actions are communicated via callback props and
 * dispatched by the parent (which wires keyboard input via useInput).
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { PortForward, RecentForward } from '../../portforward/types.js';

// ---------------------------------------------------------------------------
// PortForwardManager overlay
// ---------------------------------------------------------------------------

export interface PortForwardManagerProps {
  forwards: readonly PortForward[];
  recents: readonly RecentForward[];
  onStop: (id: string) => void;
  onRetry: (id: string) => void;
  onNewForward: () => void;
  onClose: () => void;
}

function statusIndicator(status: PortForward['status']): string {
  switch (status) {
    case 'active':
      return '●';
    case 'starting':
      return '●';
    case 'failed':
      return '✕';
  }
}

function statusColor(status: PortForward['status']): string {
  switch (status) {
    case 'active':
      return 'green';
    case 'starting':
      return 'yellow';
    case 'failed':
      return 'red';
  }
}

function ForwardRow({ forward }: { forward: PortForward }): React.ReactElement {
  const indicator = statusIndicator(forward.status);
  const color = statusColor(forward.status);

  return (
    <Box flexDirection="row" gap={1}>
      <Text color={color}>{indicator}</Text>
      <Text>localhost:{String(forward.localPort)}</Text>
      <Text dimColor>→</Text>
      <Text>
        {forward.podName}:{String(forward.remotePort)}
      </Text>
      <Text dimColor>{forward.namespace}</Text>
      {forward.status === 'failed' ? (
        <Box flexDirection="row" gap={1}>
          {forward.failReason !== undefined && (
            <Text dimColor>{forward.failReason}</Text>
          )}
          <Text color="cyan">[retry]</Text>
        </Box>
      ) : (
        <Text color="red">[✕]</Text>
      )}
    </Box>
  );
}

function RecentRow({ recent }: { recent: RecentForward }): React.ReactElement {
  return (
    <Box flexDirection="row" gap={1}>
      <Text dimColor>localhost:{String(recent.localPort)}</Text>
      <Text dimColor>→</Text>
      <Text dimColor>
        {recent.podName}:{String(recent.remotePort)}
      </Text>
      <Text dimColor>{recent.namespace}</Text>
      <Text color="cyan">[Restore]</Text>
    </Box>
  );
}

export function PortForwardManager({
  forwards,
  recents,
}: PortForwardManagerProps): React.ReactElement {
  return (
    <Box flexDirection="column" borderStyle="double" padding={1}>
      <Text bold>Port Forwards</Text>
      <Text> </Text>
      {forwards.map((fwd) => (
        <ForwardRow key={fwd.id} forward={fwd} />
      ))}
      {recents.length > 0 && (
        <Box flexDirection="column">
          <Text> </Text>
          <Text bold>RECENT</Text>
          {recents.map((r) => (
            <RecentRow
              key={`${r.podName}-${String(r.remotePort)}-${String(r.localPort)}`}
              recent={r}
            />
          ))}
        </Box>
      )}
      <Text> </Text>
      <Box flexDirection="row" gap={2}>
        <Text color="cyan">[+ New Forward]</Text>
        <Text>[Close]</Text>
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// ForwardCountIndicator — shows in the status bar
// ---------------------------------------------------------------------------

export interface ForwardCountIndicatorProps {
  activeCount: number;
  onPress?: () => void;
}

export function ForwardCountIndicator({
  activeCount,
}: ForwardCountIndicatorProps): React.ReactElement | null {
  if (activeCount === 0) {
    return null;
  }
  return <Text color="cyan">⇄ {String(activeCount)}</Text>;
}

// ---------------------------------------------------------------------------
// QuitGuardPrompt — inline confirmation when port-forwards are active
// ---------------------------------------------------------------------------

export interface QuitGuardPromptProps {
  activeCount: number;
  onQuit: () => void;
  onCancel: () => void;
}

export function QuitGuardPrompt({
  activeCount,
}: QuitGuardPromptProps): React.ReactElement {
  const label =
    activeCount === 1
      ? '1 port-forward active'
      : `${String(activeCount)} port-forwards active`;
  return (
    <Box flexDirection="row" gap={2}>
      <Text>{label}. Quit anyway?</Text>
      <Text color="red">[Quit]</Text>
      <Text color="cyan">[Cancel]</Text>
    </Box>
  );
}
