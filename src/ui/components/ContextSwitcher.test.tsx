import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { ContextSwitcher } from './ContextSwitcher.js';

function noop(): void {
  return;
}

const contexts = ['prod-cluster', 'staging-cluster', 'dev-cluster'];

const defaultProps = {
  open: true,
  contexts,
  currentContext: 'prod-cluster',
  filter: '',
  onSelect: noop,
  onClose: noop,
};

describe('ContextSwitcher', () => {
  it('renders nothing when closed', () => {
    const props = { ...defaultProps, open: false };
    const { lastFrame } = render(React.createElement(ContextSwitcher, props));
    expect(lastFrame() ?? '').not.toContain('prod-cluster');
  });

  it('renders all contexts when open', () => {
    const { lastFrame } = render(
      React.createElement(ContextSwitcher, defaultProps),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('prod-cluster');
    expect(frame).toContain('staging-cluster');
    expect(frame).toContain('dev-cluster');
  });

  it('marks the current context with ●', () => {
    const { lastFrame } = render(
      React.createElement(ContextSwitcher, defaultProps),
    );
    expect(lastFrame()).toContain('●');
  });

  it('shows Switch Context heading when open', () => {
    const { lastFrame } = render(
      React.createElement(ContextSwitcher, defaultProps),
    );
    expect(lastFrame()).toContain('Switch Context');
  });

  it('filters contexts by filter text', () => {
    const props = { ...defaultProps, filter: 'staging' };
    const { lastFrame } = render(React.createElement(ContextSwitcher, props));
    const frame = lastFrame() ?? '';
    expect(frame).toContain('staging-cluster');
    expect(frame).not.toContain('dev-cluster');
    expect(frame).not.toContain('prod-cluster');
  });

  it('shows no matching message when filter has no results', () => {
    const props = { ...defaultProps, filter: 'zzznomatch' };
    const { lastFrame } = render(React.createElement(ContextSwitcher, props));
    expect(lastFrame()).toContain('No matching contexts');
  });

  it('shows filter text in the filter display', () => {
    const props = { ...defaultProps, filter: 'pro' };
    const { lastFrame } = render(React.createElement(ContextSwitcher, props));
    expect(lastFrame()).toContain('pro');
  });
});
