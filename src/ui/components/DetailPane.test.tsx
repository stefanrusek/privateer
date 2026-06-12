import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { Text } from 'ink';
import { DetailPane, getAvailableTabs, navigateTab } from './DetailPane.js';
import type { DetailPaneProps, TabId, TabDef } from './DetailPane.js';
import type { ResourceObject } from '../../core/types.js';
import { safeWrite, tick } from '../../../test/ink-stdin.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResource(kind: string, name = 'my-resource'): ResourceObject {
  return {
    uid: 'uid-1',
    kind,
    apiVersion: 'v1',
    name,
    namespace: 'default',
    labels: {},
    annotations: {},
    creationTimestamp: '2026-06-01T00:00:00Z',
    resourceVersion: '1',
    status: { color: 'green', label: 'Ready' },
    raw: { metadata: { name } },
  };
}

function noop(): void {
  return;
}

function defaultProps(
  kind: string,
  overrides: Partial<DetailPaneProps> = {},
): DetailPaneProps {
  return {
    resource: makeResource(kind),
    activeTab: 'overview',
    warningCount: 0,
    hasPrometheus: false,
    focused: false,
    onClose: noop,
    onTabChange: noop,
    renderTabContent: (tab: TabId) =>
      React.createElement(Text, null, `content:${tab}`),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// getAvailableTabs unit tests
// ---------------------------------------------------------------------------

describe('getAvailableTabs', () => {
  it('Pod has Overview YAML Events Logs Metrics', () => {
    const tabs = getAvailableTabs('Pod', false);
    const ids = tabs.map((t) => t.id);
    expect(ids).toContain('overview');
    expect(ids).toContain('yaml');
    expect(ids).toContain('events');
    expect(ids).toContain('logs');
    expect(ids).toContain('metrics');
  });

  it('Deployment does not have Logs', () => {
    const tabs = getAvailableTabs('Deployment', false);
    expect(tabs.map((t) => t.id)).not.toContain('logs');
  });

  it('Deployment has Metrics', () => {
    const tabs = getAvailableTabs('Deployment', false);
    expect(tabs.map((t) => t.id)).toContain('metrics');
  });

  it('StatefulSet has Overview YAML Events Metrics but not Logs', () => {
    const tabs = getAvailableTabs('StatefulSet', false);
    const ids = tabs.map((t) => t.id);
    expect(ids).toContain('overview');
    expect(ids).toContain('yaml');
    expect(ids).toContain('events');
    expect(ids).toContain('metrics');
    expect(ids).not.toContain('logs');
  });

  it('DaemonSet has Overview YAML Events Metrics but not Logs', () => {
    const tabs = getAvailableTabs('DaemonSet', false);
    const ids = tabs.map((t) => t.id);
    expect(ids).toContain('metrics');
    expect(ids).not.toContain('logs');
  });

  it('Node has Overview YAML Events Metrics but not Logs', () => {
    const tabs = getAvailableTabs('Node', false);
    const ids = tabs.map((t) => t.id);
    expect(ids).toContain('metrics');
    expect(ids).not.toContain('logs');
  });

  it('KafkaTopic has Overview YAML Events Metrics but not Logs', () => {
    const tabs = getAvailableTabs('KafkaTopic', false);
    const ids = tabs.map((t) => t.id);
    expect(ids).toContain('metrics');
    expect(ids).not.toContain('logs');
  });

  it('Kafka has Overview YAML Events Metrics but not Logs', () => {
    const tabs = getAvailableTabs('Kafka', false);
    const ids = tabs.map((t) => t.id);
    expect(ids).toContain('metrics');
    expect(ids).not.toContain('logs');
  });

  it('Generic without Prometheus has no Metrics tab', () => {
    const tabs = getAvailableTabs('ConfigMap', false);
    expect(tabs.map((t) => t.id)).not.toContain('metrics');
  });

  it('Generic with Prometheus has Metrics tab', () => {
    const tabs = getAvailableTabs('ConfigMap', true);
    expect(tabs.map((t) => t.id)).toContain('metrics');
  });

  it('Generic does not have Logs tab', () => {
    const tabs = getAvailableTabs('ServiceAccount', true);
    expect(tabs.map((t) => t.id)).not.toContain('logs');
  });
});

// ---------------------------------------------------------------------------
// Rendering tests
// ---------------------------------------------------------------------------

describe('DetailPane rendering', () => {
  it('renders resource name', () => {
    const { lastFrame } = render(
      React.createElement(DetailPane, defaultProps('Pod')),
    );
    expect(lastFrame()).toContain('my-resource');
  });

  it('renders close button', () => {
    const { lastFrame } = render(
      React.createElement(DetailPane, defaultProps('Pod')),
    );
    expect(lastFrame()).toContain('✕');
  });

  it('renders Agent tab divider and label', () => {
    const { lastFrame } = render(
      React.createElement(DetailPane, defaultProps('Pod')),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('·');
    expect(frame).toContain('Agent');
  });

  it('renders active tab underlined (Overview)', () => {
    const { lastFrame } = render(
      React.createElement(
        DetailPane,
        defaultProps('Pod', { activeTab: 'overview' }),
      ),
    );
    expect(lastFrame()).toContain('Overview');
  });

  it('renders tab content via renderTabContent', () => {
    const { lastFrame } = render(
      React.createElement(
        DetailPane,
        defaultProps('Pod', { activeTab: 'events' }),
      ),
    );
    expect(lastFrame()).toContain('content:events');
  });

  it('renders warning count in Events tab label', () => {
    const { lastFrame } = render(
      React.createElement(DetailPane, defaultProps('Pod', { warningCount: 3 })),
    );
    expect(lastFrame()).toContain('Events (3)');
  });

  it('does not show warning count when warningCount=0', () => {
    const { lastFrame } = render(
      React.createElement(DetailPane, defaultProps('Pod', { warningCount: 0 })),
    );
    const frame = lastFrame() ?? '';
    expect(frame).not.toContain('Events (0)');
    expect(frame).toContain('Events');
  });

  it('Pod tab bar contains Overview YAML Events Logs Metrics Agent', () => {
    const { lastFrame } = render(
      React.createElement(DetailPane, defaultProps('Pod')),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Overview');
    expect(frame).toContain('YAML');
    expect(frame).toContain('Events');
    expect(frame).toContain('Logs');
    expect(frame).toContain('Metrics');
    expect(frame).toContain('Agent');
  });

  it('Deployment tab bar does not contain Logs', () => {
    const { lastFrame } = render(
      React.createElement(DetailPane, defaultProps('Deployment')),
    );
    expect(lastFrame()).not.toContain('Logs');
  });

  it('Generic without Prometheus does not show Metrics tab', () => {
    const { lastFrame } = render(
      React.createElement(
        DetailPane,
        defaultProps('ConfigMap', { hasPrometheus: false }),
      ),
    );
    expect(lastFrame()).not.toContain('Metrics');
  });

  it('Generic with Prometheus shows Metrics tab', () => {
    const { lastFrame } = render(
      React.createElement(
        DetailPane,
        defaultProps('ConfigMap', { hasPrometheus: true }),
      ),
    );
    expect(lastFrame()).toContain('Metrics');
  });
});

// ---------------------------------------------------------------------------
// navigateTab pure function tests
// ---------------------------------------------------------------------------

describe('navigateTab', () => {
  const podTabs: TabDef[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'yaml', label: 'YAML' },
    { id: 'events', label: 'Events' },
    { id: 'logs', label: 'Logs' },
    { id: 'metrics', label: 'Metrics' },
    { id: 'agent', label: 'Agent' },
  ];

  it('number key 1 selects overview', () => {
    expect(navigateTab('1', false, false, 'yaml', podTabs)).toBe('overview');
  });

  it('number key 2 selects yaml', () => {
    expect(navigateTab('2', false, false, 'overview', podTabs)).toBe('yaml');
  });

  it('number key 6 selects agent for Pod', () => {
    expect(navigateTab('6', false, false, 'overview', podTabs)).toBe('agent');
  });

  it('Tab from overview goes to yaml', () => {
    expect(navigateTab('', true, false, 'overview', podTabs)).toBe('yaml');
  });

  it('Tab from yaml goes to events', () => {
    expect(navigateTab('', true, false, 'yaml', podTabs)).toBe('events');
  });

  it('Tab from agent wraps to overview', () => {
    expect(navigateTab('', true, false, 'agent', podTabs)).toBe('overview');
  });

  it('Shift+Tab from yaml goes to overview', () => {
    expect(navigateTab('', true, true, 'yaml', podTabs)).toBe('overview');
  });

  it('Shift+Tab from overview wraps to agent', () => {
    expect(navigateTab('', true, true, 'overview', podTabs)).toBe('agent');
  });

  it('returns null for out-of-range number key', () => {
    // Deployment has 5 navigable tabs (no logs), key '6' is out of range
    const deployTabs: TabDef[] = [
      { id: 'overview', label: 'Overview' },
      { id: 'yaml', label: 'YAML' },
      { id: 'events', label: 'Events' },
      { id: 'metrics', label: 'Metrics' },
      { id: 'agent', label: 'Agent' },
    ];
    expect(navigateTab('6', false, false, 'overview', deployTabs)).toBeNull();
  });

  it('returns null for non-navigation input', () => {
    expect(navigateTab('q', false, false, 'overview', podTabs)).toBeNull();
  });

  it('returns null for non-tab non-number input', () => {
    expect(navigateTab('a', false, false, 'overview', podTabs)).toBeNull();
  });

  it('returns null for Tab on empty tabs list (next is undefined)', () => {
    // With an empty navigableTabs, nextIdx becomes NaN so navigableTabs[NaN]
    // is undefined, exercising the `next !== undefined ? next.id : null`
    // null-branch at line 213.
    expect(navigateTab('', true, false, 'overview', [])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// DetailPane useInput integration — stateful wrapper
// ---------------------------------------------------------------------------

describe('DetailPane useInput integration', () => {
  it('calls onTabChange from useInput when key pressed and focused', async () => {
    // useInput registers via useEffect which is deferred by React's scheduler.
    // safeWrite waits for the 'readable' listener before writing so the
    // keystroke is never dropped.
    let tabChanged: TabId | null = null;
    const { stdin } = render(
      React.createElement(
        DetailPane,
        defaultProps('Pod', {
          focused: true,
          onTabChange: (t: TabId) => {
            tabChanged = t;
          },
        }),
      ),
    );
    await safeWrite(stdin, '3'); // Key '3' = events (index 2) for Pod
    expect(tabChanged).toBe('events');
  });

  it('does not call onTabChange when not focused', async () => {
    let tabChanged: TabId | null = null;
    const { stdin } = render(
      React.createElement(
        DetailPane,
        defaultProps('Pod', {
          focused: false,
          onTabChange: (t: TabId) => {
            tabChanged = t;
          },
        }),
      ),
    );
    // Intentionally a raw write: with focused=false, useInput is inactive
    // ({ isActive: focused }) so Ink never attaches a 'readable' listener —
    // safeWrite would spin its whole listener-wait budget. The write being
    // dropped IS the behavior under test (no tab change when unfocused).
    await tick();
    stdin.write('2');
    await tick();
    expect(tabChanged).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// DetailPane focus prop test
// ---------------------------------------------------------------------------

describe('DetailPane focus behavior', () => {
  it('renders ✕ close button', () => {
    const { lastFrame } = render(
      React.createElement(DetailPane, defaultProps('Pod', { focused: true })),
    );
    expect(lastFrame()).toContain('✕');
  });
});

// ---------------------------------------------------------------------------
// Auto-open-with-Agent-tab prop test
// ---------------------------------------------------------------------------

describe('DetailPane agent auto-open', () => {
  it('accepts onAgentTabRequest prop without error', () => {
    const onAgentTabRequest = (): void => {
      return;
    };
    expect(() => {
      render(
        React.createElement(
          DetailPane,
          defaultProps('Pod', { onAgentTabRequest }),
        ),
      );
    }).not.toThrow();
  });
});
