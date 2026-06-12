import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { CommandBar } from './CommandBar.js';
import type { Mode } from '../types.js';

const defaultProps = {
  context: 'my-cluster',
  namespace: 'default',
  resourceKind: 'Pods',
  mode: 'normal' as Mode,
  focused: false,
  hints: [],
};

describe('CommandBar', () => {
  it('renders context', () => {
    const { lastFrame } = render(React.createElement(CommandBar, defaultProps));
    expect(lastFrame()).toContain('my-cluster');
  });

  it('renders namespace', () => {
    const { lastFrame } = render(React.createElement(CommandBar, defaultProps));
    expect(lastFrame()).toContain('default');
  });

  it('renders resourceKind', () => {
    const { lastFrame } = render(React.createElement(CommandBar, defaultProps));
    expect(lastFrame()).toContain('Pods');
  });

  it('shows · for normal mode', () => {
    const { lastFrame } = render(React.createElement(CommandBar, defaultProps));
    expect(lastFrame()).toContain('·');
  });

  it('shows / for search mode', () => {
    const props = { ...defaultProps, mode: 'search' as Mode };
    const { lastFrame } = render(React.createElement(CommandBar, props));
    expect(lastFrame()).toContain('/');
  });

  it('shows ! for command mode', () => {
    const props = { ...defaultProps, mode: 'command' as Mode };
    const { lastFrame } = render(React.createElement(CommandBar, props));
    expect(lastFrame()).toContain('!');
  });

  it('shows EDIT for edit mode', () => {
    const props = { ...defaultProps, mode: 'edit' as Mode };
    const { lastFrame } = render(React.createElement(CommandBar, props));
    expect(lastFrame()).toContain('EDIT');
  });

  it('shows hints when not focused', () => {
    const props = { ...defaultProps, hints: ['? help', 'q quit'] };
    const { lastFrame } = render(React.createElement(CommandBar, props));
    expect(lastFrame()).toContain('? help');
    expect(lastFrame()).toContain('q quit');
  });

  it('does not show hints when focused', () => {
    const props = {
      ...defaultProps,
      focused: true,
      hints: ['? help'],
    };
    const { lastFrame } = render(React.createElement(CommandBar, props));
    expect(lastFrame()).not.toContain('? help');
  });

  it('renders ctx: label', () => {
    const { lastFrame } = render(React.createElement(CommandBar, defaultProps));
    expect(lastFrame()).toContain('ctx:');
  });

  it('shows inputText with block cursor when focused', () => {
    const props = {
      ...defaultProps,
      focused: true,
      mode: 'search' as Mode,
      inputText: 'nginx',
    };
    const { lastFrame } = render(React.createElement(CommandBar, props));
    expect(lastFrame()).toContain('nginx');
  });

  it('renders block cursor with empty input when focused without inputText', () => {
    const props = { ...defaultProps, focused: true };
    const { lastFrame } = render(React.createElement(CommandBar, props));
    expect(lastFrame()).toContain('[·]');
  });

  it('does not show inputText when not focused', () => {
    const props = { ...defaultProps, inputText: 'nginx' };
    const { lastFrame } = render(React.createElement(CommandBar, props));
    expect(lastFrame()).not.toContain('nginx');
  });
});
