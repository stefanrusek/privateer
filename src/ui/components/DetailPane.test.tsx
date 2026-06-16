import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { Text } from 'ink';
import { DetailPane, getAvailableTabs } from './DetailPane.js';
import type { DetailPaneProps, TabId } from './DetailPane.js';
import type { ResourceObject } from '../../core/types.js';

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
// Re-exported getAvailableTabs (sourced from detail-tabs.ts)
// ---------------------------------------------------------------------------

describe('getAvailableTabs (re-export)', () => {
  it('Pod has overview/yaml/events/logs/metrics', () => {
    const ids = getAvailableTabs('Pod', false).map((t) => t.id);
    expect(ids).toContain('logs');
    expect(ids).toContain('metrics');
  });

  it('Deployment does not have Logs', () => {
    expect(
      getAvailableTabs('Deployment', false).map((t) => t.id),
    ).not.toContain('logs');
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

  it('renders the agent tab as active', () => {
    const { lastFrame } = render(
      React.createElement(
        DetailPane,
        defaultProps('Pod', { activeTab: 'agent' }),
      ),
    );
    expect(lastFrame()).toContain('content:agent');
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
// DetailPane no longer owns keyboard input (chunk 01)
// ---------------------------------------------------------------------------

describe('DetailPane is presentational', () => {
  it('renders with focused=true without registering input', () => {
    const { lastFrame } = render(
      React.createElement(DetailPane, defaultProps('Pod', { focused: true })),
    );
    expect(lastFrame()).toContain('✕');
  });

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
