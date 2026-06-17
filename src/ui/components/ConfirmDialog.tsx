/**
 * ConfirmDialog component — inline destructive-action confirmation.
 * Rendered in the command-bar area. Spec 04 §12, Spec 05 §6.2.
 *
 * The keyboard-handler logic is exported as pure functions so they can be
 * unit-tested without relying on ink's async useEffect registration.
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { Key } from 'ink';

export type ConfirmSelection = 'confirm' | 'cancel';

/**
 * Renders one button label. The adapter injects a measured, clickable `Button`
 * here (B3b); the default plain-`<Text>` renderer keeps the component testable
 * under ink-testing-library without the adapter's measure/register glue.
 */
export type ConfirmButtonRenderer = (args: {
  which: ConfirmSelection;
  label: string;
  selected: boolean;
  destructive: boolean;
  onClick: () => void;
}) => React.ReactNode;

export interface ConfirmDialogProps {
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
  /**
   * Highlighted button (controlled by the controller so keyboard and mouse
   * share one source of truth). Defaults to `cancel` for safety when omitted.
   */
  selection?: ConfirmSelection;
  /** Injected by the adapter to render clickable measured Buttons. */
  renderButton?: ConfirmButtonRenderer;
}

export type ConfirmKeyAction =
  | { kind: 'confirm' }
  | { kind: 'cancel' }
  | { kind: 'toggle' }
  | { kind: 'none' };

/**
 * Pure keyboard-action reducer for the ConfirmDialog.
 * Maps (input, key) → a typed action that the component can dispatch.
 * Exported for direct unit testing.
 */
export function confirmDialogKeyAction(
  input: string,
  key: Key,
): ConfirmKeyAction {
  if (key.escape) {
    return { kind: 'cancel' };
  }
  if (key.return) {
    return { kind: 'confirm' };
  }
  if (key.rightArrow || key.leftArrow || input === '\t') {
    return { kind: 'toggle' };
  }
  return { kind: 'none' };
}

/**
 * Given a key action and the current selection, compute the next selection.
 * Exported for direct unit testing.
 */
export function applyConfirmKeyAction(
  action: ConfirmKeyAction,
  current: ConfirmSelection,
): ConfirmSelection {
  if (action.kind === 'toggle') {
    return current === 'cancel' ? 'confirm' : 'cancel';
  }
  return current;
}

/**
 * Dispatch a key action — calls the right callback or toggles selection.
 * Exported for direct unit testing of the dispatch logic.
 */
export function dispatchConfirmAction(
  action: ConfirmKeyAction,
  selection: ConfirmSelection,
  onConfirm: () => void,
  onCancel: () => void,
  setSelection: (s: ConfirmSelection) => void,
): void {
  if (action.kind === 'cancel') {
    onCancel();
    return;
  }
  if (action.kind === 'confirm') {
    if (selection === 'confirm') {
      onConfirm();
    } else {
      onCancel();
    }
    return;
  }
  if (action.kind === 'toggle') {
    setSelection(applyConfirmKeyAction(action, selection));
  }
}

/** Default (test-mode) renderer: a styled, non-clickable `<Text>` label. */
function defaultRenderButton({
  label,
  selected,
  destructive,
}: {
  label: string;
  selected: boolean;
  destructive: boolean;
}): React.ReactNode {
  return (
    <Text
      bold={selected}
      underline={selected}
      {...(destructive ? { color: 'red' as const } : {})}
    >
      [{label}]
    </Text>
  );
}

export function ConfirmDialog({
  message,
  confirmLabel = 'Confirm',
  onConfirm,
  onCancel,
  destructive = false,
  selection = 'cancel',
  renderButton = defaultRenderButton,
}: ConfirmDialogProps): React.ReactElement {
  // Input is owned by the controller (single source of truth — see
  // controller.handleConfirmInput); this component is purely presentational so
  // keyboard and the clickable buttons never race (B3b).
  return (
    <Box flexDirection="row" gap={1}>
      <Text>{message}</Text>
      {renderButton({
        which: 'confirm',
        label: confirmLabel,
        selected: selection === 'confirm',
        destructive,
        onClick: onConfirm,
      })}
      {renderButton({
        which: 'cancel',
        label: 'Cancel',
        selected: selection === 'cancel',
        destructive: false,
        onClick: onCancel,
      })}
    </Box>
  );
}
