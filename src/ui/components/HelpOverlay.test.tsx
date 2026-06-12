import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { HelpOverlay } from './HelpOverlay.js';

function noop(): void {
  return;
}

describe('HelpOverlay', () => {
  it('renders nothing when closed', () => {
    const { lastFrame } = render(
      React.createElement(HelpOverlay, { open: false, onClose: noop }),
    );
    expect(lastFrame() ?? '').not.toContain('Keyboard Reference');
  });

  it('renders the keyboard reference when open', () => {
    const { lastFrame } = render(
      React.createElement(HelpOverlay, { open: true, onClose: noop }),
    );
    expect(lastFrame()).toContain('Keyboard Reference');
  });

  it('shows Tab keybinding', () => {
    const { lastFrame } = render(
      React.createElement(HelpOverlay, { open: true, onClose: noop }),
    );
    expect(lastFrame()).toContain('Tab');
  });

  it('shows ? keybinding', () => {
    const { lastFrame } = render(
      React.createElement(HelpOverlay, { open: true, onClose: noop }),
    );
    expect(lastFrame()).toContain('?');
  });

  it('shows close hint when open', () => {
    const { lastFrame } = render(
      React.createElement(HelpOverlay, { open: true, onClose: noop }),
    );
    expect(lastFrame()).toContain('close');
  });
});
