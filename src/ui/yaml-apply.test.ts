import { describe, it, expect } from 'vitest';
import {
  initialApplyStatus,
  pressApply,
  applyResolved,
  pressReload,
  reloadResolved,
  pressCancel,
  type ApplyStatus,
} from './yaml-apply.js';

describe('yaml-apply: initial status', () => {
  it('opens in the diff review', () => {
    expect(initialApplyStatus()).toEqual({ kind: 'diff' });
  });
});

describe('yaml-apply: apply (replace) flow', () => {
  it('diff → applying with a replace effect on Apply', () => {
    const step = pressApply({ kind: 'diff' });
    expect(step.status).toEqual({ kind: 'applying' });
    expect(step.effect).toEqual({ kind: 'replace' });
    expect(step.outcome).toEqual({ kind: 'none' });
  });

  it('error → applying on Apply (retry after a shown error)', () => {
    const step = pressApply({ kind: 'error', message: 'boom' });
    expect(step.status).toEqual({ kind: 'applying' });
    expect(step.effect).toEqual({ kind: 'replace' });
  });

  it('ignores Apply while already applying', () => {
    const step = pressApply({ kind: 'applying' });
    expect(step.status).toEqual({ kind: 'applying' });
    expect(step.effect).toEqual({ kind: 'none' });
  });

  it('ignores Apply from a conflict', () => {
    expect(pressApply({ kind: 'conflict' }).effect).toEqual({ kind: 'none' });
  });

  it('ignores Apply while reloading', () => {
    expect(pressApply({ kind: 'reloading' }).effect).toEqual({ kind: 'none' });
  });

  it('applying + ok → applied outcome, back to diff status', () => {
    const step = applyResolved({ kind: 'applying' }, { ok: true });
    expect(step.status).toEqual({ kind: 'diff' });
    expect(step.outcome).toEqual({ kind: 'applied' });
  });

  it('applying + 409 → conflict status, no outcome', () => {
    const step = applyResolved(
      { kind: 'applying' },
      { ok: false, conflict: true },
    );
    expect(step.status).toEqual({ kind: 'conflict' });
    expect(step.outcome).toEqual({ kind: 'none' });
  });

  it('applying + other error → error status with message', () => {
    const step = applyResolved(
      { kind: 'applying' },
      { ok: false, conflict: false, message: 'forbidden' },
    );
    expect(step.status).toEqual({ kind: 'error', message: 'forbidden' });
    expect(step.outcome).toEqual({ kind: 'none' });
  });

  it('ignores a stray replace result when not applying', () => {
    const step = applyResolved({ kind: 'diff' }, { ok: true });
    expect(step.status).toEqual({ kind: 'diff' });
    expect(step.outcome).toEqual({ kind: 'none' });
  });
});

describe('yaml-apply: conflict → reload-and-re-edit flow', () => {
  it('conflict → reloading with a reload effect on Reload', () => {
    const step = pressReload({ kind: 'conflict' });
    expect(step.status).toEqual({ kind: 'reloading' });
    expect(step.effect).toEqual({ kind: 'reload' });
  });

  it('ignores Reload from any non-conflict status', () => {
    expect(pressReload({ kind: 'diff' }).effect).toEqual({ kind: 'none' });
    expect(pressReload({ kind: 'applying' }).effect).toEqual({ kind: 'none' });
  });

  it('reloading + ok → reloaded outcome carrying the fresh YAML', () => {
    const step = reloadResolved(
      { kind: 'reloading' },
      { ok: true, yaml: 'kind: X\n' },
    );
    expect(step.outcome).toEqual({ kind: 'reloaded', yaml: 'kind: X\n' });
    expect(step.status).toEqual({ kind: 'diff' });
  });

  it('reloading + error → error status', () => {
    const step = reloadResolved(
      { kind: 'reloading' },
      { ok: false, message: 'gone' },
    );
    expect(step.status).toEqual({ kind: 'error', message: 'gone' });
    expect(step.outcome).toEqual({ kind: 'none' });
  });

  it('ignores a stray reload result when not reloading', () => {
    const step = reloadResolved({ kind: 'conflict' }, { ok: true, yaml: 'x' });
    expect(step.status).toEqual({ kind: 'conflict' });
    expect(step.outcome).toEqual({ kind: 'none' });
  });
});

describe('yaml-apply: cancel / discard flow', () => {
  it('diff Cancel → cancelled (keep edits)', () => {
    expect(pressCancel({ kind: 'diff' }).outcome).toEqual({
      kind: 'cancelled',
    });
  });

  it('error Cancel → cancelled', () => {
    expect(pressCancel({ kind: 'error', message: 'x' }).outcome).toEqual({
      kind: 'cancelled',
    });
  });

  it('conflict Cancel → discarded (throw edits away)', () => {
    expect(pressCancel({ kind: 'conflict' }).outcome).toEqual({
      kind: 'discarded',
    });
  });

  it('ignores Cancel while applying or reloading', () => {
    const statuses: ApplyStatus[] = [
      { kind: 'applying' },
      { kind: 'reloading' },
    ];
    for (const status of statuses) {
      expect(pressCancel(status).outcome).toEqual({ kind: 'none' });
    }
  });
});
