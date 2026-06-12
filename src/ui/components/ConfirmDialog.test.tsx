import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import {
  ConfirmDialog,
  confirmDialogKeyAction,
  applyConfirmKeyAction,
  dispatchConfirmAction,
} from './ConfirmDialog.js';
import type { ConfirmSelection } from './ConfirmDialog.js';
import type { Key } from 'ink';
import { safeWrite } from '../../../test/ink-stdin.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function noop(): void {
  return;
}

/** Build a minimal Key object with all booleans false by default. */
function makeKey(overrides: Partial<Key> = {}): Key {
  return {
    upArrow: false,
    downArrow: false,
    leftArrow: false,
    rightArrow: false,
    pageDown: false,
    pageUp: false,
    return: false,
    escape: false,
    ctrl: false,
    shift: false,
    tab: false,
    backspace: false,
    delete: false,
    meta: false,
    ...overrides,
  };
}

const defaultProps = {
  message: 'Delete my-pod in default?',
  onConfirm: noop,
  onCancel: noop,
};

// ---------------------------------------------------------------------------
// confirmDialogKeyAction — pure key-to-action mapping
// ---------------------------------------------------------------------------

describe('confirmDialogKeyAction', () => {
  it('Escape returns cancel action', () => {
    const action = confirmDialogKeyAction('', makeKey({ escape: true }));
    expect(action.kind).toBe('cancel');
  });

  it('Enter returns confirm action', () => {
    const action = confirmDialogKeyAction('', makeKey({ return: true }));
    expect(action.kind).toBe('confirm');
  });

  it('right arrow returns toggle action', () => {
    const action = confirmDialogKeyAction('', makeKey({ rightArrow: true }));
    expect(action.kind).toBe('toggle');
  });

  it('left arrow returns toggle action', () => {
    const action = confirmDialogKeyAction('', makeKey({ leftArrow: true }));
    expect(action.kind).toBe('toggle');
  });

  it('tab character returns toggle action', () => {
    const action = confirmDialogKeyAction('\t', makeKey());
    expect(action.kind).toBe('toggle');
  });

  it('other input returns none action', () => {
    const action = confirmDialogKeyAction('a', makeKey());
    expect(action.kind).toBe('none');
  });

  it('empty input with no special key returns none action', () => {
    const action = confirmDialogKeyAction('', makeKey());
    expect(action.kind).toBe('none');
  });
});

// ---------------------------------------------------------------------------
// applyConfirmKeyAction — pure selection reducer
// ---------------------------------------------------------------------------

describe('applyConfirmKeyAction', () => {
  it('toggle from cancel returns confirm', () => {
    const current: ConfirmSelection = 'cancel';
    const result = applyConfirmKeyAction({ kind: 'toggle' }, current);
    expect(result).toBe('confirm');
  });

  it('toggle from confirm returns cancel', () => {
    const current: ConfirmSelection = 'confirm';
    const result = applyConfirmKeyAction({ kind: 'toggle' }, current);
    expect(result).toBe('cancel');
  });

  it('confirm action does not change selection', () => {
    expect(applyConfirmKeyAction({ kind: 'confirm' }, 'cancel')).toBe('cancel');
    expect(applyConfirmKeyAction({ kind: 'confirm' }, 'confirm')).toBe(
      'confirm',
    );
  });

  it('cancel action does not change selection', () => {
    expect(applyConfirmKeyAction({ kind: 'cancel' }, 'cancel')).toBe('cancel');
    expect(applyConfirmKeyAction({ kind: 'cancel' }, 'confirm')).toBe(
      'confirm',
    );
  });

  it('none action does not change selection', () => {
    expect(applyConfirmKeyAction({ kind: 'none' }, 'cancel')).toBe('cancel');
    expect(applyConfirmKeyAction({ kind: 'none' }, 'confirm')).toBe('confirm');
  });
});

// ---------------------------------------------------------------------------
// dispatchConfirmAction — glue between key action and callbacks
// ---------------------------------------------------------------------------

describe('dispatchConfirmAction', () => {
  it('cancel action calls onCancel', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const setSelection = vi.fn();
    dispatchConfirmAction(
      { kind: 'cancel' },
      'cancel',
      onConfirm,
      onCancel,
      setSelection,
    );
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(setSelection).not.toHaveBeenCalled();
  });

  it('confirm action with selection=confirm calls onConfirm', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const setSelection = vi.fn();
    dispatchConfirmAction(
      { kind: 'confirm' },
      'confirm',
      onConfirm,
      onCancel,
      setSelection,
    );
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onCancel).not.toHaveBeenCalled();
    expect(setSelection).not.toHaveBeenCalled();
  });

  it('confirm action with selection=cancel calls onCancel (default selection)', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const setSelection = vi.fn();
    dispatchConfirmAction(
      { kind: 'confirm' },
      'cancel',
      onConfirm,
      onCancel,
      setSelection,
    );
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(setSelection).not.toHaveBeenCalled();
  });

  it('toggle action calls setSelection with toggled value', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const setSelection = vi.fn();
    dispatchConfirmAction(
      { kind: 'toggle' },
      'cancel',
      onConfirm,
      onCancel,
      setSelection,
    );
    expect(setSelection).toHaveBeenCalledWith('confirm');
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('toggle action from confirm calls setSelection with cancel', () => {
    const setSelection = vi.fn();
    dispatchConfirmAction(
      { kind: 'toggle' },
      'confirm',
      noop,
      noop,
      setSelection,
    );
    expect(setSelection).toHaveBeenCalledWith('cancel');
  });

  it('none action does nothing', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const setSelection = vi.fn();
    dispatchConfirmAction(
      { kind: 'none' },
      'cancel',
      onConfirm,
      onCancel,
      setSelection,
    );
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    expect(setSelection).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// ConfirmDialog rendering tests
// ---------------------------------------------------------------------------

describe('ConfirmDialog rendering', () => {
  it('renders the message', () => {
    const { lastFrame } = render(
      React.createElement(ConfirmDialog, defaultProps),
    );
    expect(lastFrame()).toContain('Delete my-pod in default?');
  });

  it('renders Cancel button', () => {
    const { lastFrame } = render(
      React.createElement(ConfirmDialog, defaultProps),
    );
    expect(lastFrame()).toContain('[Cancel]');
  });

  it('renders default confirm label', () => {
    const { lastFrame } = render(
      React.createElement(ConfirmDialog, defaultProps),
    );
    expect(lastFrame()).toContain('[Confirm]');
  });

  it('renders custom confirm label', () => {
    const props = { ...defaultProps, confirmLabel: 'Delete' };
    const { lastFrame } = render(React.createElement(ConfirmDialog, props));
    expect(lastFrame()).toContain('[Delete]');
  });

  it('destructive prop — confirm button is present', () => {
    const props = {
      ...defaultProps,
      confirmLabel: 'Delete',
      destructive: true,
    };
    const { lastFrame } = render(React.createElement(ConfirmDialog, props));
    expect(lastFrame()).toContain('[Delete]');
  });

  it('non-destructive — confirm button is present', () => {
    const props = {
      ...defaultProps,
      confirmLabel: 'Confirm',
      destructive: false,
    };
    const { lastFrame } = render(React.createElement(ConfirmDialog, props));
    expect(lastFrame()).toContain('[Confirm]');
  });
});

// ---------------------------------------------------------------------------
// Default-selection semantic verification (pure logic path)
// ---------------------------------------------------------------------------

describe('ConfirmDialog default selection', () => {
  it('initial selection is Cancel — Enter on Cancel calls onCancel', () => {
    // Component starts with selection='cancel'. An Enter keypress produces
    // action.kind='confirm'. dispatchConfirmAction with selection='cancel'
    // calls onCancel. Verified via pure dispatch function.
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    dispatchConfirmAction(
      { kind: 'confirm' },
      'cancel',
      onConfirm,
      onCancel,
      noop,
    );
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('after toggle, Enter on Confirm calls onConfirm', () => {
    // After toggle, selection becomes 'confirm'. Enter → onConfirm.
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    dispatchConfirmAction(
      { kind: 'confirm' },
      'confirm',
      onConfirm,
      onCancel,
      noop,
    );
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('Escape always cancels regardless of selection', () => {
    // Escape → action.kind='cancel' → onCancel called unconditionally.
    const escAction = confirmDialogKeyAction('', makeKey({ escape: true }));
    expect(escAction.kind).toBe('cancel');
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    // Even when selection is 'confirm'
    dispatchConfirmAction(escAction, 'confirm', onConfirm, onCancel, noop);
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// useInput integration — exercises the component's useInput callback body.
// safeWrite waits for Ink's stdin 'readable' subscription before each write
// so keystrokes are never dropped while effects are still pending.
// ---------------------------------------------------------------------------

describe('ConfirmDialog useInput integration', () => {
  it('Enter on default (Cancel) selection calls onCancel', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const { stdin } = render(
      React.createElement(ConfirmDialog, {
        message: 'Delete?',
        onConfirm,
        onCancel,
      }),
    );
    await safeWrite(stdin, '\r');
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('right arrow then Enter calls onConfirm', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const { stdin } = render(
      React.createElement(ConfirmDialog, {
        message: 'Delete?',
        onConfirm,
        onCancel,
      }),
    );
    // ESC + [C = right arrow; triggers setSelection('confirm'). safeWrite
    // yields after the write so React commits the state update (and the
    // refreshed useInput handler) before Enter is written.
    await safeWrite(stdin, '\x1B[C');
    await safeWrite(stdin, '\r');
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onCancel).not.toHaveBeenCalled();
  });
});
