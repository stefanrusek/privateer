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

  it('shows grouped headings (Global, Sidebar, List, Detail)', () => {
    const { lastFrame } = render(
      React.createElement(HelpOverlay, {
        open: true,
        onClose: noop,
        viewportHeight: 100,
      }),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Global');
    expect(frame).toContain('Sidebar');
    expect(frame).toContain('List');
    expect(frame).toContain('Detail');
  });

  it('leads with the current region group (List)', () => {
    const { lastFrame } = render(
      React.createElement(HelpOverlay, {
        open: true,
        onClose: noop,
        focus: 'list',
        viewportHeight: 100,
      }),
    );
    const frame = lastFrame() ?? '';
    // The List heading appears before the Sidebar heading when List is current.
    expect(frame.indexOf('List')).toBeLessThan(frame.indexOf('Sidebar'));
  });

  it('leads with the Logs tab group when the Logs detail tab is focused', () => {
    const { lastFrame } = render(
      React.createElement(HelpOverlay, {
        open: true,
        onClose: noop,
        focus: 'detail',
        tab: 'logs',
        viewportHeight: 100,
      }),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Detail · Logs');
    expect(frame.indexOf('Detail · Logs')).toBeLessThan(
      frame.indexOf('Global'),
    );
  });

  it('renders accelerator-bearing bindings (the container/line-limit keys)', () => {
    const { lastFrame } = render(
      React.createElement(HelpOverlay, {
        open: true,
        onClose: noop,
        focus: 'detail',
        tab: 'logs',
        viewportHeight: 100,
      }),
    );
    // The accelerator letter is underlined via renderAccelerator (a pure,
    // separately-tested helper); ink-testing-library strips SGR from the frame,
    // so here we assert the binding renders with its label in the right group.
    // The underline styling itself is verified in accelerator.test.ts.
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Container dropdown');
    expect(frame).toContain('Line-limit dropdown');
  });

  it('shows a scroll/close hint', () => {
    const { lastFrame } = render(
      React.createElement(HelpOverlay, { open: true, onClose: noop }),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('scroll');
    expect(frame).toContain('close');
  });

  it('windows the content and reveals later groups when scrolled', () => {
    const top = render(
      React.createElement(HelpOverlay, {
        open: true,
        onClose: noop,
        viewportHeight: 4,
        scrollOffset: 0,
      }),
    );
    const scrolled = render(
      React.createElement(HelpOverlay, {
        open: true,
        onClose: noop,
        viewportHeight: 4,
        scrollOffset: 40,
      }),
    );
    // Short viewport at the top shows Global but not the later overlay group.
    expect(top.lastFrame()).toContain('Global');
    // Scrolling down reveals content that was below the fold.
    expect(scrolled.lastFrame()).not.toEqual(top.lastFrame());
  });

  it('renders a scrollbar when the content exceeds the viewport', () => {
    const { lastFrame } = render(
      React.createElement(HelpOverlay, {
        open: true,
        onClose: noop,
        viewportHeight: 4,
      }),
    );
    expect(lastFrame()).toContain('█');
  });
});
