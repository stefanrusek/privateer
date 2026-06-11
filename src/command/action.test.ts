/**
 * Tests for AgentAction type — structural verification that all variants
 * are properly discriminated and assignable.
 */

import { describe, it, expect } from 'vitest';
import { AGENT_ACTION_TYPES } from './action.js';
import type { AgentAction } from './action.js';

describe('AgentAction variants', () => {
  it('navigate action has action=navigate and resource field', () => {
    const a: AgentAction = { action: 'navigate', resource: 'Pod' };
    expect(a).toEqual({ action: 'navigate', resource: 'Pod' });
  });

  it('filter action with namespace only', () => {
    const a: AgentAction = { action: 'filter', namespace: 'default' };
    expect(a).toEqual({ action: 'filter', namespace: 'default' });
  });

  it('filter action with search only', () => {
    const a: AgentAction = { action: 'filter', search: 'order' };
    expect(a).toEqual({ action: 'filter', search: 'order' });
  });

  it('filter action with both namespace and search', () => {
    const a: AgentAction = {
      action: 'filter',
      namespace: 'staging',
      search: 'api',
    };
    expect(a).toEqual({
      action: 'filter',
      namespace: 'staging',
      search: 'api',
    });
  });

  it('filter action with no fields is valid', () => {
    const a: AgentAction = { action: 'filter' };
    expect(a.action).toBe('filter');
  });

  it('answer action has text field', () => {
    const a: AgentAction = { action: 'answer', text: 'hello' };
    expect(a).toEqual({ action: 'answer', text: 'hello' });
  });

  it('multi action has steps array', () => {
    const steps: AgentAction[] = [
      { action: 'navigate', resource: 'Pod' },
      { action: 'filter', namespace: 'default' },
    ];
    const a: AgentAction = { action: 'multi', steps };
    expect(a).toEqual({ action: 'multi', steps });
  });

  it('unknown action has raw field', () => {
    const a: AgentAction = {
      action: 'unknown',
      raw: 'what is kubernetes',
    };
    expect(a).toEqual({ action: 'unknown', raw: 'what is kubernetes' });
  });

  it('multi can contain nested steps', () => {
    const inner: AgentAction = { action: 'navigate', resource: 'Pod' };
    const steps: AgentAction[] = [inner];
    const outer: AgentAction = { action: 'multi', steps };
    expect(outer).toEqual({ action: 'multi', steps: [inner] });
  });

  it('all five action discriminants are distinct', () => {
    const actions: AgentAction[] = [
      { action: 'navigate', resource: 'Pod' },
      { action: 'filter' },
      { action: 'answer', text: 'x' },
      { action: 'multi', steps: [] },
      { action: 'unknown', raw: 'x' },
    ];
    const discriminants = actions.map((a) => a.action);
    expect(new Set(discriminants).size).toBe(5);
  });

  it('AGENT_ACTION_TYPES contains all five discriminants', () => {
    expect(AGENT_ACTION_TYPES).toHaveLength(5);
    expect(AGENT_ACTION_TYPES).toContain('navigate');
    expect(AGENT_ACTION_TYPES).toContain('filter');
    expect(AGENT_ACTION_TYPES).toContain('answer');
    expect(AGENT_ACTION_TYPES).toContain('multi');
    expect(AGENT_ACTION_TYPES).toContain('unknown');
  });
});
