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

  it('renders a measured headerSlot in place of the default Header', () => {
    const { lastFrame } = render(
      React.createElement(AppRoot, {
        state: defaultState,
        callbacks: defaultCallbacks,
        contextFilter: '',
        headerSlot: React.createElement(Text, null, 'MEASURED-HEADER'),
      }),
    );
    const frame = lastFrame();
    expect(frame).toContain('MEASURED-HEADER');
    // The default inline namespace chip is replaced by the slot.
    expect(frame).not.toContain('[default ▾]');
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
    // The bordered chrome clips the sidebar to the body height, so give it a
    // tall terminal where every leaf (and its active-kind marker) is visible.
    const { lastFrame } = render(
      React.createElement(AppRoot, {
        state: defaultState,
        callbacks: defaultCallbacks,
        contextFilter: '',
        terminalSize: { columns: 120, rows: 200 },
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
        terminalSize: { columns: 120, rows: 200 },
      }),
    );
    expect(lastFrame()).toContain('Pods');
  });

  it('sizes the sidebar from terminalSize and windows the sidebar rows', () => {
    // rows: 12 → sidebar viewportHeight = max(5, 9) = 9, fewer than the
    // 36 expanded sidebar rows, so the bottom clip indicator appears.
    const { lastFrame } = render(
      React.createElement(AppRoot, {
        state: defaultState,
        callbacks: defaultCallbacks,
        contextFilter: '',
        terminalSize: { columns: 120, rows: 12 },
      }),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Workloads');
    expect(frame).toContain('↓ …');
  });

  it('clamps the sidebar width to 16 columns on narrow terminals', () => {
    const { lastFrame } = render(
      React.createElement(AppRoot, {
        state: defaultState,
        callbacks: defaultCallbacks,
        contextFilter: '',
        terminalSize: { columns: 40, rows: 200 },
      }),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Workloads');
    expect(frame).not.toContain('↓ …');
  });

  it('renders unwindowed at 80 columns when terminalSize is absent', () => {
    const { lastFrame } = render(
      React.createElement(AppRoot, {
        state: defaultState,
        callbacks: defaultCallbacks,
        contextFilter: '',
      }),
    );
    const frame = lastFrame() ?? '';
    // All rows render (the narrow sidebar wraps 'Custom Resources').
    expect(frame).toContain('Resources');
    expect(frame).toContain('Namespaces');
    expect(frame).not.toContain('↓ …');
    expect(frame).not.toContain('↑ …');
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

  it('replaces the command bar with commandBarContent when provided', () => {
    const { lastFrame } = render(
      React.createElement(AppRoot, {
        state: defaultState,
        callbacks: defaultCallbacks,
        contextFilter: '',
        commandBarContent: React.createElement(Text, null, 'Delete it? [y/n]'),
      }),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Delete it? [y/n]');
    expect(frame).not.toContain('ctx:');
  });

  it('renders the help overlay exclusively when helpOpen', () => {
    const state = { ...defaultState, helpOpen: true };
    const { lastFrame } = render(
      React.createElement(AppRoot, {
        state,
        callbacks: defaultCallbacks,
        contextFilter: '',
      }),
    );
    expect(lastFrame() ?? '').not.toContain('Workloads');
  });

  it('renders the context switcher exclusively when open', () => {
    const state = { ...defaultState, contextSwitcherOpen: true };
    const { lastFrame } = render(
      React.createElement(AppRoot, {
        state,
        callbacks: defaultCallbacks,
        contextFilter: '',
      }),
    );
    expect(lastFrame() ?? '').not.toContain('Workloads');
  });
});
