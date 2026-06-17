import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { DiffView } from './DiffView.js';
import type { ApplyStatus } from '../yaml-apply.js';
import { safeWrite } from '../../../test/ink-stdin.js';

function noop(): void {
  return;
}

const CFG_OLD = 'kind: ConfigMap\ndata:\n  key: old\n';
const CFG_NEW = 'kind: ConfigMap\ndata:\n  key: new\n';

function renderDiff(
  status: ApplyStatus,
  handlers: Partial<{
    onApply: () => void;
    onCancel: () => void;
    onReloadAndRedit: () => void;
  }> = {},
): ReturnType<typeof render> {
  return render(
    React.createElement(DiffView, {
      originalYaml: CFG_OLD,
      modifiedYaml: CFG_NEW,
      title: 'ConfigMap/default/my-cfg',
      status,
      onApply: handlers.onApply ?? noop,
      onCancel: handlers.onCancel ?? noop,
      onReloadAndRedit: handlers.onReloadAndRedit ?? noop,
    }),
  );
}

describe('DiffView rendering', () => {
  it('renders the title in the header', () => {
    const { lastFrame } = renderDiff({ kind: 'diff' });
    expect(lastFrame()).toContain('my-cfg');
  });

  it('renders [Apply] and [Cancel] in the diff state', () => {
    const { lastFrame } = renderDiff({ kind: 'diff' });
    const frame = lastFrame() ?? '';
    expect(frame).toContain('[Apply]');
    expect(frame).toContain('[Cancel]');
  });

  it('shows added/removed diff lines', () => {
    const { lastFrame } = renderDiff({ kind: 'diff' });
    const frame = lastFrame() ?? '';
    expect(frame).toContain('+');
    expect(frame).toContain('-');
  });

  it('renders collapsed unchanged lines', () => {
    const many = Array.from(
      { length: 20 },
      (_, i) => `  k${String(i)}: v${String(i)}`,
    ).join('\n');
    const { lastFrame } = render(
      React.createElement(DiffView, {
        originalYaml: `data:\n${many}\n`,
        modifiedYaml: `data:\n${many.replace('k10: v10', 'k10: CHANGED')}\n`,
        title: 't',
        status: { kind: 'diff' },
        onApply: noop,
        onCancel: noop,
        onReloadAndRedit: noop,
      }),
    );
    expect(lastFrame()).toContain('unchanged lines');
  });

  it('shows [Applying…] in the applying state', () => {
    expect(renderDiff({ kind: 'applying' }).lastFrame()).toContain('[Applying');
  });

  it('shows [Reloading…] in the reloading state', () => {
    expect(renderDiff({ kind: 'reloading' }).lastFrame()).toContain(
      '[Reloading',
    );
  });

  it('shows the error message in the error state', () => {
    const { lastFrame } = renderDiff({ kind: 'error', message: 'forbidden' });
    expect(lastFrame()).toContain('forbidden');
  });

  it('shows the conflict bar with Reload and Discard', () => {
    const { lastFrame } = renderDiff({ kind: 'conflict' });
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Conflict');
    expect(frame).toContain('[Reload');
    expect(frame).toContain('[Discard]');
  });
});

describe('DiffView keyboard routing', () => {
  it('Enter in diff fires onApply', async () => {
    const onApply = vi.fn();
    const { stdin } = renderDiff({ kind: 'diff' }, { onApply });
    await safeWrite(stdin, '\r');
    expect(onApply).toHaveBeenCalledOnce();
  });

  it('Enter in error fires onApply (retry)', async () => {
    const onApply = vi.fn();
    const { stdin } = renderDiff({ kind: 'error', message: 'x' }, { onApply });
    await safeWrite(stdin, '\r');
    expect(onApply).toHaveBeenCalledOnce();
  });

  it('Escape in diff fires onCancel', async () => {
    const onCancel = vi.fn();
    const { stdin } = renderDiff({ kind: 'diff' }, { onCancel });
    await safeWrite(stdin, '\x1B');
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('ignores keys while applying', async () => {
    const onApply = vi.fn();
    const onCancel = vi.fn();
    const { stdin } = renderDiff({ kind: 'applying' }, { onApply, onCancel });
    await safeWrite(stdin, '\r');
    await safeWrite(stdin, '\x1B');
    expect(onApply).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('ignores keys while reloading', async () => {
    const onReloadAndRedit = vi.fn();
    const { stdin } = renderDiff({ kind: 'reloading' }, { onReloadAndRedit });
    await safeWrite(stdin, 'r');
    expect(onReloadAndRedit).not.toHaveBeenCalled();
  });

  it('r in conflict fires onReloadAndRedit', async () => {
    const onReloadAndRedit = vi.fn();
    const { stdin } = renderDiff({ kind: 'conflict' }, { onReloadAndRedit });
    await safeWrite(stdin, 'r');
    expect(onReloadAndRedit).toHaveBeenCalledOnce();
  });

  it('R (uppercase) in conflict also fires onReloadAndRedit', async () => {
    const onReloadAndRedit = vi.fn();
    const { stdin } = renderDiff({ kind: 'conflict' }, { onReloadAndRedit });
    await safeWrite(stdin, 'R');
    expect(onReloadAndRedit).toHaveBeenCalledOnce();
  });

  it('Escape in conflict fires onCancel (discard)', async () => {
    const onCancel = vi.fn();
    const { stdin } = renderDiff({ kind: 'conflict' }, { onCancel });
    await safeWrite(stdin, '\x1B');
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('a non-Enter, non-Escape key in diff does nothing', async () => {
    const onApply = vi.fn();
    const onCancel = vi.fn();
    const { stdin } = renderDiff({ kind: 'diff' }, { onApply, onCancel });
    await safeWrite(stdin, 'x');
    expect(onApply).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('a non-r, non-Escape key in conflict does nothing', async () => {
    const onReloadAndRedit = vi.fn();
    const onCancel = vi.fn();
    const { stdin } = renderDiff(
      { kind: 'conflict' },
      { onReloadAndRedit, onCancel },
    );
    await safeWrite(stdin, 'x');
    expect(onReloadAndRedit).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });
});
