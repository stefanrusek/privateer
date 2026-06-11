import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { Text } from 'ink';
import { Layout } from './Layout.js';

const defaultProps = {
  sidebarWidth: 20,
  verticalSplit: 0.6,
  showDetail: false,
  renderSidebar: () => React.createElement(Text, null, 'SIDEBAR'),
  renderList: () => React.createElement(Text, null, 'LIST'),
  renderDetail: () => React.createElement(Text, null, 'DETAIL'),
  renderHeader: () => React.createElement(Text, null, 'HEADER'),
  renderCommandBar: () => React.createElement(Text, null, 'CMDBAR'),
};

describe('Layout', () => {
  it('renders the header region', () => {
    const { lastFrame } = render(React.createElement(Layout, defaultProps));
    expect(lastFrame()).toContain('HEADER');
  });

  it('renders the sidebar region', () => {
    const { lastFrame } = render(React.createElement(Layout, defaultProps));
    expect(lastFrame()).toContain('SIDEBAR');
  });

  it('renders the list region', () => {
    const { lastFrame } = render(React.createElement(Layout, defaultProps));
    expect(lastFrame()).toContain('LIST');
  });

  it('renders the command bar region', () => {
    const { lastFrame } = render(React.createElement(Layout, defaultProps));
    expect(lastFrame()).toContain('CMDBAR');
  });

  it('does not render detail region when showDetail is false', () => {
    const { lastFrame } = render(React.createElement(Layout, defaultProps));
    expect(lastFrame()).not.toContain('DETAIL');
  });

  it('renders the detail region when showDetail is true', () => {
    const props = { ...defaultProps, showDetail: true };
    const { lastFrame } = render(React.createElement(Layout, props));
    expect(lastFrame()).toContain('DETAIL');
  });

  it('renders with a non-zero sidebarWidth', () => {
    const props = { ...defaultProps, sidebarWidth: 30 };
    const { lastFrame } = render(React.createElement(Layout, props));
    expect(lastFrame()).toContain('SIDEBAR');
  });
});
