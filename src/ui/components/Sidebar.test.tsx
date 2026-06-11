import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { Sidebar } from './Sidebar.js';
import { SIDEBAR_CATEGORIES } from '../sidebar-data.js';

function noop(): void {
  return;
}

const defaultProps = {
  items: SIDEBAR_CATEGORIES,
  activeKind: '',
  badgeCounts: new Map<string, number>(),
  dimmedKinds: new Set<string>(),
  forbiddenKinds: new Set<string>(),
  focusActive: false,
  onSelect: noop,
  onToggleCategory: noop,
  collapsedCategories: new Set<string>(),
};

describe('Sidebar', () => {
  it('renders Overview at top', () => {
    const { lastFrame } = render(React.createElement(Sidebar, defaultProps));
    expect(lastFrame()).toContain('Overview');
  });

  it('renders all category labels', () => {
    const { lastFrame } = render(React.createElement(Sidebar, defaultProps));
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Workloads');
    expect(frame).toContain('Networking');
    expect(frame).toContain('Configuration');
    expect(frame).toContain('Storage');
    expect(frame).toContain('Access Control');
    expect(frame).toContain('Nodes');
    expect(frame).toContain('Namespaces');
    expect(frame).toContain('Custom Resources');
  });

  it('renders leaf items when category is expanded', () => {
    const { lastFrame } = render(React.createElement(Sidebar, defaultProps));
    expect(lastFrame()).toContain('Deployments');
  });

  it('hides leaf items when category is collapsed', () => {
    const props = {
      ...defaultProps,
      collapsedCategories: new Set(['workloads']),
    };
    const { lastFrame } = render(React.createElement(Sidebar, props));
    expect(lastFrame()).not.toContain('Deployments');
  });

  it('shows ▼ for expanded categories', () => {
    const { lastFrame } = render(React.createElement(Sidebar, defaultProps));
    expect(lastFrame()).toContain('▼');
  });

  it('shows ▶ for collapsed categories', () => {
    const props = {
      ...defaultProps,
      collapsedCategories: new Set(['workloads']),
    };
    const { lastFrame } = render(React.createElement(Sidebar, props));
    expect(lastFrame()).toContain('▶');
  });

  it('shows > for the active kind', () => {
    const props = { ...defaultProps, activeKind: 'Deployments' };
    const { lastFrame } = render(React.createElement(Sidebar, props));
    expect(lastFrame()).toContain('>');
  });

  it('shows badge count for resource kind', () => {
    const counts = new Map([['Deployments', 7]]);
    const props = { ...defaultProps, badgeCounts: counts };
    const { lastFrame } = render(React.createElement(Sidebar, props));
    expect(lastFrame()).toContain('7');
  });

  it('shows [!] for forbidden resource kinds', () => {
    const props = {
      ...defaultProps,
      forbiddenKinds: new Set(['Deployments']),
    };
    const { lastFrame } = render(React.createElement(Sidebar, props));
    expect(lastFrame()).toContain('[!]');
  });

  it('does not show badge count when kind is forbidden', () => {
    const counts = new Map([['Deployments', 3]]);
    const props = {
      ...defaultProps,
      badgeCounts: counts,
      forbiddenKinds: new Set(['Deployments']),
    };
    const { lastFrame } = render(React.createElement(Sidebar, props));
    expect(lastFrame()).toContain('[!]');
  });

  it('renders dimmed badge differently (dimmedKinds set)', () => {
    const counts = new Map([['Deployments', 3]]);
    const props = {
      ...defaultProps,
      badgeCounts: counts,
      dimmedKinds: new Set(['Deployments']),
    };
    const { lastFrame } = render(React.createElement(Sidebar, props));
    expect(lastFrame()).toContain('3');
  });

  it('renders Overview bold/cyan when focusActive is true', () => {
    const props = { ...defaultProps, focusActive: true };
    const { lastFrame } = render(React.createElement(Sidebar, props));
    expect(lastFrame()).toContain('Overview');
  });
});
