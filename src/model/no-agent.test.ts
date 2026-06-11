import { describe, it, expect } from 'vitest';
import {
  NO_AGENT_FLAG,
  NO_AGENT_COMMAND_BAR_HINT,
  isAgentEnabled,
  agentTabVisible,
  commandBarIsCommandOnly,
  spaceOpensMode,
  normalizeNoAgentInput,
} from './no-agent.js';

describe('isAgentEnabled', () => {
  it('disables the agent when --no-agent is present', () => {
    expect(isAgentEnabled(['--no-agent'])).toBe(false);
  });

  it('disables the agent when --no-agent appears among other flags', () => {
    expect(isAgentEnabled(['--namespace', 'default', '--no-agent'])).toBe(
      false,
    );
  });

  it('enables the agent with no flags', () => {
    expect(isAgentEnabled([])).toBe(true);
  });

  it('enables the agent with unrelated flags', () => {
    expect(isAgentEnabled(['--namespace', 'default'])).toBe(true);
  });

  it('exposes the flag constant', () => {
    expect(NO_AGENT_FLAG).toBe('--no-agent');
  });
});

describe('agentTabVisible', () => {
  it('hides the AgentTab when the agent is disabled', () => {
    expect(agentTabVisible(false)).toBe(false);
  });

  it('shows the AgentTab when the agent is enabled', () => {
    expect(agentTabVisible(true)).toBe(true);
  });
});

describe('commandBarIsCommandOnly', () => {
  it('is command-only when the agent is disabled', () => {
    expect(commandBarIsCommandOnly(false)).toBe(true);
  });

  it('accepts agent prompts when the agent is enabled', () => {
    expect(commandBarIsCommandOnly(true)).toBe(false);
  });

  it('exposes the no-agent hint constant', () => {
    expect(NO_AGENT_COMMAND_BAR_HINT).toBe('·  !command');
  });
});

describe('spaceOpensMode', () => {
  it('opens command mode in no-agent mode', () => {
    expect(spaceOpensMode(false)).toBe('command');
  });

  it('opens agent mode when the agent is enabled', () => {
    expect(spaceOpensMode(true)).toBe('agent');
  });
});

describe('normalizeNoAgentInput', () => {
  it('keeps bare command text as-is', () => {
    expect(normalizeNoAgentInput('scale deploy/api 3')).toBe(
      'scale deploy/api 3',
    );
  });

  it('strips a single leading bang', () => {
    expect(normalizeNoAgentInput('!scale deploy/api 3')).toBe(
      'scale deploy/api 3',
    );
  });

  it('strips the bang and trims surrounding whitespace', () => {
    expect(normalizeNoAgentInput('  ! restart  ')).toBe('restart');
  });

  it('normalizes blank input to empty', () => {
    expect(normalizeNoAgentInput('   ')).toBe('');
  });

  it('strips only the first bang', () => {
    expect(normalizeNoAgentInput('!!double')).toBe('!double');
  });
});
