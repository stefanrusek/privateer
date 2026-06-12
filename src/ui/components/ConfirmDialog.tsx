/**
 * ConfirmDialog component — inline destructive-action confirmation.
 * Rendered in the command-bar area. Spec 04 §12, Spec 05 §6.2.
 *
 * The keyboard-handler logic is exported as pure functions so they can be
 * unit-tested without relying on ink's async useEffect registration.
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Key } from 'ink';

export interface ConfirmDialogProps {
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
}

export type ConfirmSelection = 'confirm' | 'cancel';

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

export function ConfirmDialog({
  message,
  confirmLabel = 'Confirm',
  onConfirm,
  onCancel,
  destructive = false,
}: ConfirmDialogProps): React.ReactElement {
  const [selection, setSelection] = useState<ConfirmSelection>('cancel');

  useInput((input, key) => {
    const action = confirmDialogKeyAction(input, key);
    dispatchConfirmAction(action, selection, onConfirm, onCancel, setSelection);
  });

  const confirmProps = {
    bold: selection === 'confirm',
    underline: selection === 'confirm',
    ...(destructive ? { color: 'red' as const } : {}),
  };

  return (
    <Box flexDirection="row" gap={1}>
      <Text>{message}</Text>
      <Text {...confirmProps}>[{confirmLabel}]</Text>
      <Text bold={selection === 'cancel'} underline={selection === 'cancel'}>
        [Cancel]
      </Text>
    </Box>
  );
}
