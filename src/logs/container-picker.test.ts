import { describe, it, expect } from 'vitest';
import { buildContainerPicker } from './container-picker.js';
import type { KubernetesObject } from '../core/types.js';

function running(name: string, restartCount = 0): Record<string, unknown> {
  return {
    name,
    state: { running: { startedAt: '2026-06-10T00:00:00Z' } },
    restartCount,
  };
}
function waiting(name: string): Record<string, unknown> {
  return { name, state: { waiting: { reason: 'PodInitializing' } } };
}
function terminated(name: string, restartCount = 0): Record<string, unknown> {
  return {
    name,
    state: { terminated: { exitCode: 0 } },
    restartCount,
  };
}

function pod(
  containerStatuses: unknown,
  initContainerStatuses?: unknown,
): KubernetesObject {
  const status: Record<string, unknown> = { containerStatuses };
  if (initContainerStatuses !== undefined) {
    status.initContainerStatuses = initContainerStatuses;
  }
  return { apiVersion: 'v1', kind: 'Pod', status };
}

describe('buildContainerPicker', () => {
  it('auto-opens a single running container with no picker', () => {
    const result = buildContainerPicker(pod([running('order-api')]));
    expect(result.autoOpen).toBe(true);
    expect(result.defaultIndex).toBe(0);
    expect(result.options).toHaveLength(1);
    expect(result.options[0]?.phase).toBe('running');
  });

  it('shows a picker for multiple containers, defaulting to the running one', () => {
    const result = buildContainerPicker(
      pod([running('order-api'), terminated('config-reloader')]),
    );
    expect(result.autoOpen).toBe(false);
    expect(result.defaultIndex).toBe(0);
    expect(result.options).toHaveLength(2);
  });

  it('defaults to the first running container when several run', () => {
    const result = buildContainerPicker(
      pod([waiting('init-thing'), running('a'), running('b')]),
    );
    expect(result.autoOpen).toBe(false);
    expect(result.defaultIndex).toBe(1);
  });

  it('gives no default when all containers are terminated', () => {
    const result = buildContainerPicker(
      pod([terminated('a'), terminated('b')]),
    );
    expect(result.defaultIndex).toBe(-1);
    expect(result.autoOpen).toBe(false);
    expect(result.options.every((o) => o.phase === 'terminated')).toBe(true);
  });

  it('classifies waiting containers', () => {
    const result = buildContainerPicker(pod([waiting('a'), waiting('b')]));
    expect(result.options[0]?.phase).toBe('waiting');
    expect(result.defaultIndex).toBe(-1);
  });

  it('lists init containers after regular ones, labeled (init)', () => {
    const result = buildContainerPicker(
      pod([running('app')], [terminated('init-db')]),
    );
    expect(result.options).toHaveLength(2);
    expect(result.options[0]?.name).toBe('app');
    expect(result.options[0]?.isInit).toBe(false);
    expect(result.options[1]?.name).toBe('init-db');
    expect(result.options[1]?.isInit).toBe(true);
    expect(result.options[1]?.label).toBe('init-db (init)');
  });

  it('flags hasPrevious when restartCount is positive', () => {
    const result = buildContainerPicker(pod([running('app', 3)]));
    expect(result.options[0]?.hasPrevious).toBe(true);
  });

  it('does not flag hasPrevious when restartCount is zero', () => {
    const result = buildContainerPicker(pod([running('app', 0)]));
    expect(result.options[0]?.hasPrevious).toBe(false);
  });

  it('treats a missing status as no containers', () => {
    const result = buildContainerPicker({ apiVersion: 'v1', kind: 'Pod' });
    expect(result.options).toEqual([]);
    expect(result.defaultIndex).toBe(-1);
    expect(result.autoOpen).toBe(false);
  });

  it('treats a null status as no containers', () => {
    const nullStatus: KubernetesObject = { apiVersion: 'v1', kind: 'Pod' };
    nullStatus.status = null as unknown as Record<string, unknown>;
    const result = buildContainerPicker(nullStatus);
    expect(result.options).toEqual([]);
  });

  it('ignores non-array containerStatuses', () => {
    const result = buildContainerPicker(pod('not-an-array'));
    expect(result.options).toEqual([]);
  });

  it('skips status entries that are not objects', () => {
    const result = buildContainerPicker(pod([null, 'str', running('app')]));
    expect(result.options).toHaveLength(1);
    expect(result.options[0]?.name).toBe('app');
  });

  it('skips status entries with a non-string name', () => {
    const result = buildContainerPicker(pod([{ name: 42 }, running('app')]));
    expect(result.options).toHaveLength(1);
    expect(result.options[0]?.name).toBe('app');
  });

  it('treats a missing state as waiting', () => {
    const result = buildContainerPicker(pod([{ name: 'app' }]));
    expect(result.options[0]?.phase).toBe('waiting');
  });

  it('treats a null state as waiting', () => {
    const result = buildContainerPicker(pod([{ name: 'app', state: null }]));
    expect(result.options[0]?.phase).toBe('waiting');
  });

  it('treats a non-numeric restartCount as zero', () => {
    const result = buildContainerPicker(
      pod([{ name: 'app', state: { running: {} }, restartCount: 'x' }]),
    );
    expect(result.options[0]?.hasPrevious).toBe(false);
  });

  it('treats an explicitly empty running state object as waiting', () => {
    const result = buildContainerPicker(
      pod([{ name: 'app', state: { running: undefined } }]),
    );
    expect(result.options[0]?.phase).toBe('waiting');
  });

  it('treats an explicitly empty terminated state object as waiting', () => {
    const result = buildContainerPicker(
      pod([{ name: 'app', state: { terminated: undefined } }]),
    );
    expect(result.options[0]?.phase).toBe('waiting');
  });
});
