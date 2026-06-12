/**
 * Tests for the action executor (pure reducer).
 */

import { describe, it, expect } from 'vitest';
import { executeAction, type UiIntent } from './executor.js';
import type { AgentAction } from './action.js';

const BASE: UiIntent = { kind: 'Pod', namespace: '', search: '' };

describe('executeAction — navigate', () => {
  it('changes resource kind', () => {
    const result = executeAction(BASE, {
      action: 'navigate',
      resource: 'Deployment',
    });
    expect(result.kind).toBe('Deployment');
  });

  it('clears search on navigation', () => {
    const state: UiIntent = {
      kind: 'Pod',
      namespace: 'default',
      search: 'order',
    };
    const result = executeAction(state, {
      action: 'navigate',
      resource: 'Service',
    });
    expect(result.search).toBe('');
  });

  it('preserves namespace on navigation', () => {
    const state: UiIntent = { kind: 'Pod', namespace: 'default', search: '' };
    const result = executeAction(state, {
      action: 'navigate',
      resource: 'Service',
    });
    expect(result.namespace).toBe('default');
  });
});

describe('executeAction — filter', () => {
  it('updates namespace', () => {
    const result = executeAction(BASE, {
      action: 'filter',
      namespace: 'default',
    });
    expect(result.namespace).toBe('default');
    expect(result.kind).toBe('Pod');
  });

  it('updates search', () => {
    const result = executeAction(BASE, { action: 'filter', search: 'order' });
    expect(result.search).toBe('order');
    expect(result.kind).toBe('Pod');
  });

  it('updates both namespace and search', () => {
    const result = executeAction(BASE, {
      action: 'filter',
      namespace: 'staging',
      search: 'api',
    });
    expect(result.namespace).toBe('staging');
    expect(result.search).toBe('api');
  });

  it('preserves existing fields when filter fields are undefined', () => {
    const state: UiIntent = {
      kind: 'Pod',
      namespace: 'default',
      search: 'worker',
    };
    const result = executeAction(state, { action: 'filter' });
    expect(result.namespace).toBe('default');
    expect(result.search).toBe('worker');
    expect(result.kind).toBe('Pod');
  });

  it('does not change kind', () => {
    const result = executeAction(BASE, { action: 'filter', namespace: 'ns' });
    expect(result.kind).toBe('Pod');
  });
});

describe('executeAction — multi', () => {
  it('applies steps in sequence', () => {
    const state: UiIntent = {
      kind: 'Pod',
      namespace: 'default',
      search: 'old',
    };
    const action: AgentAction = {
      action: 'multi',
      steps: [
        { action: 'navigate', resource: 'Deployment' },
        { action: 'filter', namespace: 'staging' },
      ],
    };
    const result = executeAction(state, action);
    expect(result.kind).toBe('Deployment');
    expect(result.namespace).toBe('staging');
    expect(result.search).toBe('');
  });

  it('navigate then filter search', () => {
    const state: UiIntent = { kind: 'Service', namespace: '', search: '' };
    const action: AgentAction = {
      action: 'multi',
      steps: [
        { action: 'navigate', resource: 'Pod' },
        { action: 'filter', search: 'error' },
      ],
    };
    const result = executeAction(state, action);
    expect(result.kind).toBe('Pod');
    expect(result.search).toBe('error');
  });

  it('empty steps returns original state', () => {
    const result = executeAction(BASE, { action: 'multi', steps: [] });
    expect(result).toEqual(BASE);
  });
});

describe('executeAction — answer (no-op)', () => {
  it('returns state unchanged', () => {
    const state: UiIntent = { kind: 'Pod', namespace: 'default', search: 'x' };
    const result = executeAction(state, { action: 'answer', text: 'hello' });
    expect(result).toEqual(state);
  });
});

describe('executeAction — unknown (no-op)', () => {
  it('returns state unchanged', () => {
    const state: UiIntent = { kind: 'Pod', namespace: 'default', search: 'x' };
    const result = executeAction(state, {
      action: 'unknown',
      raw: 'gibberish',
    });
    expect(result).toEqual(state);
  });
});
