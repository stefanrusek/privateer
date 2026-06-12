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

  it('renders cursor on Overview row when focusActive is true', () => {
    const props = {
      ...defaultProps,
      focusActive: true,
      cursorKind: 'Overview',
    };
    const { lastFrame } = render(React.createElement(Sidebar, props));
    expect(lastFrame()).toContain('Overview');
  });

  it('renders cursor on Overview row when focusActive is false', () => {
    const props = { ...defaultProps, cursorKind: 'Overview' };
    const { lastFrame } = render(React.createElement(Sidebar, props));
    expect(lastFrame()).toContain('Overview');
  });

  it('renders cursor on a category header when focusActive is true', () => {
    const props = {
      ...defaultProps,
      focusActive: true,
      cursorKind: 'workloads',
    };
    const { lastFrame } = render(React.createElement(Sidebar, props));
    expect(lastFrame()).toContain('Workloads');
  });

  it('renders cursor on a category header when focusActive is false', () => {
    const props = { ...defaultProps, cursorKind: 'workloads' };
    const { lastFrame } = render(React.createElement(Sidebar, props));
    expect(lastFrame()).toContain('Workloads');
  });

  it('renders cursor on a leaf row when focusActive is true', () => {
    const props = { ...defaultProps, focusActive: true, cursorKind: 'Pods' };
    const { lastFrame } = render(React.createElement(Sidebar, props));
    expect(lastFrame()).toContain('Pods');
  });

  it('renders cursor on a leaf row when focusActive is false', () => {
    const props = { ...defaultProps, cursorKind: 'Pods' };
    const { lastFrame } = render(React.createElement(Sidebar, props));
    expect(lastFrame()).toContain('Pods');
  });

  it('renders a row that is both active and cursor (focusActive true)', () => {
    const props = {
      ...defaultProps,
      focusActive: true,
      activeKind: 'Deployments',
      cursorKind: 'Deployments',
    };
    const { lastFrame } = render(React.createElement(Sidebar, props));
    const frame = lastFrame() ?? '';
    expect(frame).toContain('>');
    expect(frame).toContain('Deployments');
  });

  it('renders a row that is both active and cursor (focusActive false)', () => {
    const props = {
      ...defaultProps,
      activeKind: 'Deployments',
      cursorKind: 'Deployments',
    };
    const { lastFrame } = render(React.createElement(Sidebar, props));
    const frame = lastFrame() ?? '';
    expect(frame).toContain('>');
    expect(frame).toContain('Deployments');
  });

  it('renders identically with cursorKind null', () => {
    const props = { ...defaultProps, cursorKind: null };
    const { lastFrame } = render(React.createElement(Sidebar, props));
    const baseline = render(React.createElement(Sidebar, defaultProps));
    expect(lastFrame()).toBe(baseline.lastFrame());
  });
});

describe('Sidebar viewport windowing', () => {
  // With all categories expanded: 1 Overview + 8 headers + 27 leaves = 36 rows.

  function frameLines(frame: string | undefined): string[] {
    return (frame ?? '').split('\n');
  }

  it('renders identically to the unwindowed sidebar when rows fit', () => {
    const props = { ...defaultProps, viewportHeight: 100 };
    const { lastFrame } = render(React.createElement(Sidebar, props));
    const baseline = render(React.createElement(Sidebar, defaultProps));
    expect(lastFrame()).toBe(baseline.lastFrame());
    expect(lastFrame()).not.toContain('↑ …');
    expect(lastFrame()).not.toContain('↓ …');
  });

  it('clips the bottom when the cursor is at the top', () => {
    const props = {
      ...defaultProps,
      cursorKind: 'Overview',
      viewportHeight: 10,
    };
    const { lastFrame } = render(React.createElement(Sidebar, props));
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Overview');
    expect(frame).not.toContain('↑ …');
    expect(frame).toContain('↓ …');
    expect(frame).not.toContain('Custom Resources');
    expect(frameLines(frame).length).toBeLessThanOrEqual(10);
  });

  it('falls back to the top window when cursorKind matches no row', () => {
    const props = { ...defaultProps, cursorKind: null, viewportHeight: 10 };
    const { lastFrame } = render(React.createElement(Sidebar, props));
    const baseline = render(
      React.createElement(Sidebar, {
        ...defaultProps,
        cursorKind: 'Overview',
        viewportHeight: 10,
      }),
    );
    // cursorKind null highlights nothing, but the window position matches
    // the cursor-at-row-0 window aside from the Overview row styling.
    expect(lastFrame()).toContain('Overview');
    expect(lastFrame()).not.toContain('↑ …');
    expect(lastFrame()).toContain('↓ …');
    expect(frameLines(lastFrame()).length).toBe(
      frameLines(baseline.lastFrame()).length,
    );
  });

  it('clips both ends when the cursor is in the middle', () => {
    // 'Secrets' is row index 16 of 36; window of 8 rows centers on it.
    const props = {
      ...defaultProps,
      cursorKind: 'Secrets',
      viewportHeight: 10,
    };
    const { lastFrame } = render(React.createElement(Sidebar, props));
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Secrets');
    expect(frame).toContain('↑ …');
    expect(frame).toContain('↓ …');
    expect(frame).not.toContain('Overview');
    expect(frameLines(frame).length).toBeLessThanOrEqual(10);
  });

  it('clips the top when the cursor is at the bottom', () => {
    const props = {
      ...defaultProps,
      cursorKind: 'CustomResourceDefinitions',
      viewportHeight: 10,
    };
    const { lastFrame } = render(React.createElement(Sidebar, props));
    const frame = lastFrame() ?? '';
    expect(frame).toContain('CustomResourceDefinitions');
    expect(frame).toContain('↑ …');
    expect(frame).not.toContain('↓ …');
    expect(frame).not.toContain('Overview');
    expect(frameLines(frame).length).toBeLessThanOrEqual(10);
  });

  it('keeps a category-header cursor row inside the window', () => {
    const props = { ...defaultProps, cursorKind: 'storage', viewportHeight: 7 };
    const { lastFrame } = render(React.createElement(Sidebar, props));
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Storage');
    expect(frame).toContain('↑ …');
    expect(frame).toContain('↓ …');
    expect(frameLines(frame).length).toBeLessThanOrEqual(7);
  });
});
