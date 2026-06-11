import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { Text } from 'ink';
import { AppRoot } from './AppRoot.js';
import type { AppState } from './types.js';

function noop(): void {
  return;
}

const defaultState: AppState = {
  context: 'test-cluster',
  namespace: 'default',
  allNamespaces: ['default', 'kube-system'],
  allContexts: ['test-cluster', 'prod-cluster'],
  activeKind: 'Deployments',
  search: '',
  mode: 'normal',
  focus: 'sidebar',
  collapsedCategories: new Set(),
  badgeCounts: new Map(),
  dimmedKinds: new Set(),
  forbiddenKinds: new Set(),
  showDetail: false,
  contextSwitcherOpen: false,
  helpOpen: false,
  sidebarRatio: 0.2,
  verticalRatio: 0.6,
  hints: ['? help'],
  headerFocus: null,
};

const defaultCallbacks = {
  onSelectKind: noop,
  onToggleCategory: noop,
  onNamespaceChange: noop,
  onSearchChange: noop,
  onContextSelect: noop,
  onContextSwitcherClose: noop,
  onHelpClose: noop,
  onFocusChange: noop,
};

describe('AppRoot', () => {
  it('renders the sidebar with categories', () => {
    const { lastFrame } = render(
      React.createElement(AppRoot, {
        state: defaultState,
        callbacks: defaultCallbacks,
        contextFilter: '',
      }),
    );
    expect(lastFrame()).toContain('Workloads');
  });

  it('renders the header with namespace', () => {
    const { lastFrame } = render(
      React.createElement(AppRoot, {
        state: defaultState,
        callbacks: defaultCallbacks,
        contextFilter: '',
      }),
    );
    expect(lastFrame()).toContain('default');
  });

  it('renders the command bar with context', () => {
    const { lastFrame } = render(
      React.createElement(AppRoot, {
        state: defaultState,
        callbacks: defaultCallbacks,
        contextFilter: '',
      }),
    );
    expect(lastFrame()).toContain('test-cluster');
  });

  it('renders help overlay when helpOpen is true', () => {
    const state = { ...defaultState, helpOpen: true };
    const { lastFrame } = render(
      React.createElement(AppRoot, {
        state,
        callbacks: defaultCallbacks,
        contextFilter: '',
      }),
    );
    expect(lastFrame()).toContain('Keyboard Reference');
  });

  it('does not render help overlay when helpOpen is false', () => {
    const { lastFrame } = render(
      React.createElement(AppRoot, {
        state: defaultState,
        callbacks: defaultCallbacks,
        contextFilter: '',
      }),
    );
    expect(lastFrame()).not.toContain('Keyboard Reference');
  });

  it('renders context switcher when contextSwitcherOpen is true', () => {
    const state = { ...defaultState, contextSwitcherOpen: true };
    const { lastFrame } = render(
      React.createElement(AppRoot, {
        state,
        callbacks: defaultCallbacks,
        contextFilter: '',
      }),
    );
    expect(lastFrame()).toContain('Switch Context');
  });

  it('does not render context switcher when closed', () => {
    const { lastFrame } = render(
      React.createElement(AppRoot, {
        state: defaultState,
        callbacks: defaultCallbacks,
        contextFilter: '',
      }),
    );
    expect(lastFrame()).not.toContain('Switch Context');
  });

  it('shows > marker for active kind in sidebar', () => {
    const { lastFrame } = render(
      React.createElement(AppRoot, {
        state: defaultState,
        callbacks: defaultCallbacks,
        contextFilter: '',
      }),
    );
    expect(lastFrame()).toContain('>');
  });

  it('renders with showDetail true', () => {
    const state = { ...defaultState, showDetail: true };
    const { lastFrame } = render(
      React.createElement(AppRoot, {
        state,
        callbacks: defaultCallbacks,
        contextFilter: '',
      }),
    );
    expect(lastFrame()).toContain('Workloads');
  });

  it('renders list pane content via renderList', () => {
    const { lastFrame } = render(
      React.createElement(AppRoot, {
        state: defaultState,
        callbacks: defaultCallbacks,
        contextFilter: '',
        renderList: () => React.createElement(Text, null, 'LIST-CONTENT'),
      }),
    );
    expect(lastFrame()).toContain('LIST-CONTENT');
  });

  it('renders detail pane content via renderDetail when showDetail is true', () => {
    const state = { ...defaultState, showDetail: true };
    const { lastFrame } = render(
      React.createElement(AppRoot, {
        state,
        callbacks: defaultCallbacks,
        contextFilter: '',
        renderDetail: () => React.createElement(Text, null, 'DETAIL-CONTENT'),
      }),
    );
    expect(lastFrame()).toContain('DETAIL-CONTENT');
  });

  it('passes cursorKind through to the sidebar', () => {
    const { lastFrame } = render(
      React.createElement(AppRoot, {
        state: defaultState,
        callbacks: defaultCallbacks,
        contextFilter: '',
        cursorKind: 'Pods',
      }),
    );
    expect(lastFrame()).toContain('Pods');
  });

  it('passes inputText through to the command bar when focused', () => {
    const state = { ...defaultState, focus: 'commandbar' as const };
    const { lastFrame } = render(
      React.createElement(AppRoot, {
        state,
        callbacks: defaultCallbacks,
        contextFilter: '',
        inputText: 'get pods',
      }),
    );
    expect(lastFrame()).toContain('get pods');
  });
});
