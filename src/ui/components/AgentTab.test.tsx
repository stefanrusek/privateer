import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { AgentTab } from './AgentTab.js';
import type { AgentExchange } from './AgentTab.js';
import type { AgentAction } from '../../command/action.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function noop(): void {
  return;
}

function makeExchange(
  query: string,
  action: AgentAction | null = null,
  overrides?: Partial<AgentExchange>,
): AgentExchange {
  return { query, action, ...overrides };
}

// ---------------------------------------------------------------------------
// Tests — empty state
// ---------------------------------------------------------------------------

describe('AgentTab empty state', () => {
  it('renders help text when no exchanges', () => {
    const { lastFrame } = render(
      React.createElement(AgentTab, {
        exchanges: [],
        onClearHistory: noop,
      }),
    );
    expect(lastFrame()).toContain('Ask anything');
    expect(lastFrame()).toContain('[Clear history]');
  });

  it('renders Clear history button always', () => {
    const { lastFrame } = render(
      React.createElement(AgentTab, {
        exchanges: [],
        onClearHistory: noop,
      }),
    );
    expect(lastFrame()).toContain('[Clear history]');
  });
});

// ---------------------------------------------------------------------------
// Tests — query display
// ---------------------------------------------------------------------------

describe('AgentTab query display', () => {
  it('shows query with > prefix', () => {
    const exchanges = [makeExchange('show me erroring pods')];
    const { lastFrame } = render(
      React.createElement(AgentTab, {
        exchanges,
        onClearHistory: noop,
      }),
    );
    expect(lastFrame()).toContain('> show me erroring pods');
  });

  it('shows multiple queries', () => {
    const exchanges = [
      makeExchange('show pods'),
      makeExchange('how many deployments'),
    ];
    const { lastFrame } = render(
      React.createElement(AgentTab, {
        exchanges,
        onClearHistory: noop,
      }),
    );
    expect(lastFrame()).toContain('> show pods');
    expect(lastFrame()).toContain('> how many deployments');
  });
});

// ---------------------------------------------------------------------------
// Tests — action rendering
// ---------------------------------------------------------------------------

describe('AgentTab navigate action', () => {
  it('shows navigation action label', () => {
    const exchanges = [
      makeExchange('show pods', { action: 'navigate', resource: 'Pod' }),
    ];
    const { lastFrame } = render(
      React.createElement(AgentTab, {
        exchanges,
        onClearHistory: noop,
      }),
    );
    expect(lastFrame()).toContain('Navigated to Pod');
  });

  it('shows ↳ prefix for action label', () => {
    const exchanges = [
      makeExchange('show pods', { action: 'navigate', resource: 'Pod' }),
    ];
    const { lastFrame } = render(
      React.createElement(AgentTab, {
        exchanges,
        onClearHistory: noop,
      }),
    );
    expect(lastFrame()).toContain('↳');
  });
});

describe('AgentTab filter action', () => {
  it('shows filter with namespace', () => {
    const exchanges = [
      makeExchange('go to default', {
        action: 'filter',
        namespace: 'default',
      }),
    ];
    const { lastFrame } = render(
      React.createElement(AgentTab, {
        exchanges,
        onClearHistory: noop,
      }),
    );
    expect(lastFrame()).toContain('namespace: default');
  });

  it('shows filter with search', () => {
    const exchanges = [
      makeExchange('find order', {
        action: 'filter',
        search: 'order',
      }),
    ];
    const { lastFrame } = render(
      React.createElement(AgentTab, {
        exchanges,
        onClearHistory: noop,
      }),
    );
    expect(lastFrame()).toContain('search: order');
  });

  it('shows "Filter applied" for empty filter', () => {
    const exchanges = [
      makeExchange('reset filter', {
        action: 'filter',
      }),
    ];
    const { lastFrame } = render(
      React.createElement(AgentTab, {
        exchanges,
        onClearHistory: noop,
      }),
    );
    expect(lastFrame()).toContain('Filter applied');
  });
});

describe('AgentTab answer action', () => {
  it('shows answer text', () => {
    const exchanges = [
      makeExchange('how many pods', {
        action: 'answer',
        text: 'There are 5 running pods.',
      }),
    ];
    const { lastFrame } = render(
      React.createElement(AgentTab, {
        exchanges,
        onClearHistory: noop,
      }),
    );
    expect(lastFrame()).toContain('There are 5 running pods.');
  });
});

describe('AgentTab unknown action', () => {
  it("shows I couldn't understand that message", () => {
    const exchanges = [
      makeExchange('xyzzy plugh', {
        action: 'unknown',
        raw: 'xyzzy plugh',
      }),
    ];
    const { lastFrame } = render(
      React.createElement(AgentTab, {
        exchanges,
        onClearHistory: noop,
      }),
    );
    expect(lastFrame()).toContain("I couldn't understand that");
  });

  it('shows suggested commands in unknown response', () => {
    const exchanges = [
      makeExchange('?', {
        action: 'unknown',
        raw: '?',
      }),
    ];
    const { lastFrame } = render(
      React.createElement(AgentTab, {
        exchanges,
        onClearHistory: noop,
      }),
    );
    expect(lastFrame()).toContain('show me erroring pods');
  });
});

describe('AgentTab multi action', () => {
  it('shows multi action labels', () => {
    const exchanges = [
      makeExchange('show erroring pods in default', {
        action: 'multi',
        steps: [
          { action: 'navigate', resource: 'Pod' },
          { action: 'filter', namespace: 'default', search: 'error' },
        ],
      }),
    ];
    const { lastFrame } = render(
      React.createElement(AgentTab, {
        exchanges,
        onClearHistory: noop,
      }),
    );
    expect(lastFrame()).toContain('Navigated to Pod');
    expect(lastFrame()).toContain('namespace: default');
  });

  it('shows answer text from multi action', () => {
    const exchanges = [
      makeExchange('find pods', {
        action: 'multi',
        steps: [
          { action: 'navigate', resource: 'Pod' },
          { action: 'answer', text: 'Found 3 pods.' },
        ],
      }),
    ];
    const { lastFrame } = render(
      React.createElement(AgentTab, {
        exchanges,
        onClearHistory: noop,
      }),
    );
    expect(lastFrame()).toContain('Found 3 pods.');
  });
});

// ---------------------------------------------------------------------------
// Tests — pending and error states
// ---------------------------------------------------------------------------

describe('AgentTab pending state', () => {
  it('shows thinking indicator for pending exchanges', () => {
    const exchanges = [makeExchange('show pods', null, { pending: true })];
    const { lastFrame } = render(
      React.createElement(AgentTab, {
        exchanges,
        onClearHistory: noop,
      }),
    );
    expect(lastFrame()).toContain('thinking…');
  });
});

describe('AgentTab error/timeout state', () => {
  it('shows error message', () => {
    const exchanges = [
      makeExchange('show pods', null, {
        errorMessage: 'Query timed out. The model took too long to respond.',
      }),
    ];
    const { lastFrame } = render(
      React.createElement(AgentTab, {
        exchanges,
        onClearHistory: noop,
      }),
    );
    expect(lastFrame()).toContain('Query timed out');
  });
});

// ---------------------------------------------------------------------------
// Tests — history limits
// ---------------------------------------------------------------------------

describe('AgentTab history limit', () => {
  it('shows last 20 exchanges when more are provided', () => {
    const exchanges = Array.from({ length: 25 }, (_, i) =>
      makeExchange(`query ${String(i)}`),
    );
    const { lastFrame } = render(
      React.createElement(AgentTab, {
        exchanges,
        onClearHistory: noop,
      }),
    );
    // Should show last 20 (indices 5-24)
    expect(lastFrame()).toContain('query 24');
    expect(lastFrame()).toContain('query 5');
    // Should NOT show first 5
    expect(lastFrame()).not.toContain('query 4');
    expect(lastFrame()).not.toContain('query 0');
  });

  it('shows all exchanges when fewer than 20', () => {
    const exchanges = Array.from({ length: 5 }, (_, i) =>
      makeExchange(`query ${String(i)}`),
    );
    const { lastFrame } = render(
      React.createElement(AgentTab, {
        exchanges,
        onClearHistory: noop,
      }),
    );
    for (let i = 0; i < 5; i++) {
      expect(lastFrame()).toContain(`query ${String(i)}`);
    }
  });
});

// ---------------------------------------------------------------------------
// Tests — Clear history
// ---------------------------------------------------------------------------

describe('AgentTab Clear history', () => {
  it('shows Clear history button with exchanges', () => {
    const exchanges = [makeExchange('show pods')];
    const { lastFrame } = render(
      React.createElement(AgentTab, {
        exchanges,
        onClearHistory: noop,
      }),
    );
    expect(lastFrame()).toContain('[Clear history]');
  });
});

// ---------------------------------------------------------------------------
// Tests — null action
// ---------------------------------------------------------------------------

describe('AgentTab null action', () => {
  it('renders exchange with null action (just query)', () => {
    const exchanges = [makeExchange('hello', null)];
    const { lastFrame } = render(
      React.createElement(AgentTab, {
        exchanges,
        onClearHistory: noop,
      }),
    );
    expect(lastFrame()).toContain('> hello');
  });
});
