import { describe, it, expect } from 'vitest';
import { selectContainer } from './container-picker.js';
import type { ContainerEntry } from './container-picker.js';

const running = (name: string): ContainerEntry => ({
  name,
  phase: 'running',
  init: false,
});
const waiting = (name: string): ContainerEntry => ({
  name,
  phase: 'waiting',
  init: false,
});
const terminated = (name: string): ContainerEntry => ({
  name,
  phase: 'terminated',
  init: false,
});

describe('selectContainer', () => {
  it('auto-selects a single running container when it is the only one', () => {
    const result = selectContainer([running('api')]);
    expect(result.kind).toBe('autoSelected');
    if (result.kind === 'autoSelected') {
      expect(result.container).toBe('api');
    }
  });

  it('shows a picker when there are two running containers', () => {
    const result = selectContainer([running('api'), running('sidecar')]);
    expect(result.kind).toBe('picker');
  });

  it('shows a picker when there is a running and a waiting container', () => {
    const result = selectContainer([running('api'), waiting('sidecar')]);
    expect(result.kind).toBe('picker');
    if (result.kind === 'picker') {
      expect(result.defaultContainer).toBe('api');
    }
  });

  it('defaults to the first running container when there are multiple', () => {
    const result = selectContainer([running('api'), running('envoy')]);
    expect(result.kind).toBe('picker');
    if (result.kind === 'picker') {
      expect(result.defaultContainer).toBe('api');
    }
  });

  it('shows a picker with null default when all containers are terminated', () => {
    const result = selectContainer([terminated('api'), terminated('old')]);
    expect(result.kind).toBe('picker');
    if (result.kind === 'picker') {
      expect(result.defaultContainer).toBeNull();
    }
  });

  it('includes terminated containers in the picker entries', () => {
    const result = selectContainer([running('api'), terminated('old')]);
    expect(result.kind).toBe('picker');
    if (result.kind === 'picker') {
      const names = result.entries.map((e) => e.name);
      expect(names).toContain('old');
    }
  });

  it('shows a picker (not auto-select) for a single running container when there are also terminated ones', () => {
    const result = selectContainer([running('api'), terminated('old')]);
    expect(result.kind).toBe('picker');
  });

  it('returns a picker with empty entries and null default for an empty list', () => {
    const result = selectContainer([]);
    expect(result.kind).toBe('picker');
    if (result.kind === 'picker') {
      expect(result.entries).toHaveLength(0);
      expect(result.defaultContainer).toBeNull();
    }
  });
});
