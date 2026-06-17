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

/**
 * Renders one clickable control. The adapter injects a measured, clickable
 * `Button` here (C3); the default plain-`<Text>` renderer keeps the component
 * testable under ink-testing-library without the adapter's measure/register
 * glue, mirroring {@link ConfirmDialog}'s `renderButton`.
 */
export type PfButtonRenderer = (args: {
  id: string;
  label: string;
  color?: string;
  onClick: () => void;
}) => React.ReactNode;

export interface PortForwardManagerProps {
  forwards: readonly PortForward[];
  recents: readonly RecentForward[];
  onStop: (id: string) => void;
  onRetry: (id: string) => void;
  onNewForward: () => void;
  onClose: () => void;
  /**
   * The active forward the keyboard cursor is on (controlled by the
   * controller). The selected row is marked so keyboard `x`/Enter/Delete act on
   * a visible target. Defaults to 0.
   */
  selectedIndex?: number;
  /** Injected by the adapter to render clickable measured Buttons. */
  renderButton?: PfButtonRenderer;
}

/** Default (test-mode) renderer: a styled, non-clickable `<Text>` label. */
function defaultRenderButton({
  label,
  color,
}: {
  label: string;
  color?: string;
}): React.ReactNode {
  return <Text {...(color !== undefined ? { color } : {})}>{label}</Text>;
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

function ForwardRow({
  forward,
  selected,
  onStop,
  onRetry,
  renderButton,
}: {
  forward: PortForward;
  selected: boolean;
  onStop: (id: string) => void;
  onRetry: (id: string) => void;
  renderButton: PfButtonRenderer;
}): React.ReactElement {
  const indicator = statusIndicator(forward.status);
  const color = statusColor(forward.status);

  return (
    <Box flexDirection="row" gap={1}>
      <Text bold={selected}>{selected ? '›' : ' '}</Text>
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
          {renderButton({
            id: `pfm.action.${forward.id}`,
            label: '[retry]',
            color: 'cyan',
            onClick: () => {
              onRetry(forward.id);
            },
          })}
        </Box>
      ) : (
        renderButton({
          id: `pfm.action.${forward.id}`,
          label: '[✕]',
          color: 'red',
          onClick: () => {
            onStop(forward.id);
          },
        })
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
  onStop,
  onRetry,
  onNewForward,
  onClose,
  selectedIndex = 0,
  renderButton = defaultRenderButton,
}: PortForwardManagerProps): React.ReactElement {
  return (
    <Box flexDirection="column" borderStyle="double" padding={1}>
      <Text bold>Port Forwards</Text>
      <Text> </Text>
      {forwards.map((fwd, i) => (
        <ForwardRow
          key={fwd.id}
          forward={fwd}
          selected={i === selectedIndex}
          onStop={onStop}
          onRetry={onRetry}
          renderButton={renderButton}
        />
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
        {renderButton({
          id: 'pfm.new',
          label: '[+ New Forward]',
          color: 'cyan',
          onClick: onNewForward,
        })}
        {renderButton({ id: 'pfm.close', label: '[Close]', onClick: onClose })}
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
