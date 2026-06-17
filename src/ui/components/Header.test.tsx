import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { Header } from './Header.js';

function noop(): void {
  return;
}

const defaultProps = {
  context: 'docker-desktop',
  namespace: 'default',
  allNamespaces: ['default', 'kube-system'],
  search: '',
  onNamespaceChange: noop,
  onSearchChange: noop,
  focused: null as 'context' | 'namespace' | 'search' | null,
};

describe('Header', () => {
  it('renders the namespace', () => {
    const { lastFrame } = render(React.createElement(Header, defaultProps));
    expect(lastFrame()).toContain('default');
  });

  it('renders ns: label', () => {
    const { lastFrame } = render(React.createElement(Header, defaultProps));
    expect(lastFrame()).toContain('ns:');
  });

  it('renders the context chip left of the namespace', () => {
    const { lastFrame } = render(React.createElement(Header, defaultProps));
    const frame = lastFrame() ?? '';
    expect(frame).toContain('docker-desktop');
    // context appears before "ns:"
    expect(frame.indexOf('docker-desktop')).toBeLessThan(frame.indexOf('ns:'));
  });

  it('renders search text', () => {
    const props = { ...defaultProps, search: 'nginx' };
    const { lastFrame } = render(React.createElement(Header, props));
    expect(lastFrame()).toContain('nginx');
  });

  it('renders context focused state', () => {
    const props = { ...defaultProps, focused: 'context' as const };
    const { lastFrame } = render(React.createElement(Header, props));
    expect(lastFrame()).toContain('docker-desktop');
  });

  it('renders namespace focused state', () => {
    const props = { ...defaultProps, focused: 'namespace' as const };
    const { lastFrame } = render(React.createElement(Header, props));
    expect(lastFrame()).toContain('default');
  });

  it('renders search focused state', () => {
    const props = {
      ...defaultProps,
      search: 'test',
      focused: 'search' as const,
    };
    const { lastFrame } = render(React.createElement(Header, props));
    expect(lastFrame()).toContain('test');
  });

  it('renders with null focused (no highlight)', () => {
    const { lastFrame } = render(React.createElement(Header, defaultProps));
    expect(lastFrame()).toBeTruthy();
  });
});
