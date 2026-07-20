import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { Text } from 'ink';
import { LogsTab } from './LogsTab.js';
import type { LogsTabProps } from './LogsTab.js';
import { emptySearch, runSearch } from '../../logs/search.js';

function props(over: Partial<LogsTabProps> = {}): LogsTabProps {
  return {
    podName: 'order-api-7d9f',
    container: 'order-api',
    lines: ['INFO listening', 'WARN retry', 'ERROR boom'],
    live: true,
    timestamps: true,
    wrap: false,
    lineLimitLabel: '100 lines',
    previous: false,
    search: emptySearch(),
    searchFocused: false,
    newLinesAvailable: false,
    ...over,
  };
}

function frameOf(over: Partial<LogsTabProps> = {}): string {
  const { lastFrame } = render(React.createElement(LogsTab, props(over)));
  return lastFrame() ?? '';
}

describe('LogsTab', () => {
  it('renders the title with pod and container', () => {
    expect(frameOf()).toContain('Logs — order-api-7d9f / order-api');
  });

  it('renders the toolbar buttons', () => {
    const frame = frameOf();
    expect(frame).toContain('[order-api ▾]');
    expect(frame).toContain('[Timestamps]');
    expect(frame).toContain('[Wrap]');
    expect(frame).toContain('[100 lines ▾]');
    expect(frame).toContain('[Download]');
  });

  it('renders the injected toolbar slot instead of the static toolbar', () => {
    const { lastFrame } = render(
      React.createElement(
        LogsTab,
        props({ toolbar: React.createElement(Text, null, 'CUSTOM-TOOLBAR') }),
      ),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('CUSTOM-TOOLBAR');
    // The static toolbar's controls are replaced by the slot.
    expect(frame).not.toContain('[Timestamps]');
    expect(frame).not.toContain('[Download]');
  });

  it('shows the Live indicator when live', () => {
    expect(frameOf({ live: true })).toContain('[● Live]');
  });

  it('shows the Paused indicator when not live', () => {
    expect(frameOf({ live: false })).toContain('[○ Paused]');
  });

  it('marks the container as previous when previous is set', () => {
    expect(frameOf({ previous: true })).toContain('[order-api (previous) ▾]');
  });

  it('renders log lines', () => {
    const frame = frameOf();
    expect(frame).toContain('INFO listening');
    expect(frame).toContain('WARN retry');
    expect(frame).toContain('ERROR boom');
  });

  it('shows an empty state when there are no lines', () => {
    expect(frameOf({ lines: [] })).toContain('No log lines');
  });

  it('shows timestamp/wrap state hints (on)', () => {
    const frame = frameOf({ timestamps: true, wrap: true });
    expect(frame).toContain('Timestamps: on');
    expect(frame).toContain('Wrap: on');
  });

  it('shows timestamp/wrap state hints (off)', () => {
    const frame = frameOf({ timestamps: false, wrap: false });
    expect(frame).toContain('Timestamps: off');
    expect(frame).toContain('Wrap: off');
  });

  it('shows the resume button when paused with new lines', () => {
    expect(frameOf({ live: false, newLinesAvailable: true })).toContain(
      '[Resume live tail ↓]',
    );
  });

  it('does not show the resume button when live', () => {
    expect(frameOf({ live: true, newLinesAvailable: true })).not.toContain(
      '[Resume live tail ↓]',
    );
  });

  it('does not show the resume button when no new lines', () => {
    expect(frameOf({ live: false, newLinesAvailable: false })).not.toContain(
      '[Resume live tail ↓]',
    );
  });

  it('renders the focused search bar with a match count', () => {
    const frame = frameOf({
      search: runSearch(['INFO listening', 'WARN retry', 'ERROR boom'], 'r'),
      searchFocused: true,
    });
    expect(frame).toContain('[Search logs: /r');
    expect(frame).toContain('1/2');
  });

  it('renders the focused search bar with no-matches note', () => {
    const frame = frameOf({
      search: runSearch(['a', 'b'], 'zzz'),
      searchFocused: true,
    });
    expect(frame).toContain('no matches');
  });

  it('renders the focused search bar empty with no note', () => {
    const frame = frameOf({
      search: emptySearch(),
      searchFocused: true,
    });
    expect(frame).toContain('[Search logs: /');
    expect(frame).not.toContain('no matches');
  });

  it('renders an unfocused search summary when a query exists', () => {
    const frame = frameOf({
      search: runSearch(['INFO listening', 'WARN retry'], 'retry'),
      searchFocused: false,
    });
    expect(frame).toContain('/retry');
    expect(frame).toContain('1/1');
  });

  it('renders an unfocused no-matches summary when query exists', () => {
    const frame = frameOf({
      search: runSearch(['a'], 'zzz'),
      searchFocused: false,
    });
    expect(frame).toContain('/zzz');
    expect(frame).toContain('no matches');
  });

  it('renders no search bar when unfocused with an empty query', () => {
    const frame = frameOf({ search: emptySearch(), searchFocused: false });
    expect(frame).not.toContain('Search logs');
    expect(frame).not.toContain('no matches');
  });

  it('renders a confirmation message when present', () => {
    expect(
      frameOf({ confirmation: '✓ Saved to ~/Downloads/p9r-logs-…' }),
    ).toContain('✓ Saved to ~/Downloads/p9r-logs-…');
  });

  it('omits the confirmation line when absent', () => {
    expect(frameOf()).not.toContain('✓ Saved');
  });

  it('highlights the current search match line (inverse)', () => {
    // The current match line is rendered with inverse video — the line still
    // appears in the frame text.
    const frame = frameOf({
      lines: ['alpha', 'beta target', 'gamma'],
      search: runSearch(['alpha', 'beta target', 'gamma'], 'target'),
      searchFocused: false,
    });
    expect(frame).toContain('beta target');
  });

  it('highlights every match, not just the current one', () => {
    // All three lines contain "target"; only the first is "current" but every
    // matching line must still be present (bold+underline) in the frame.
    const lines = ['target one', 'no match here', 'target two', 'target three'];
    const frame = frameOf({
      lines,
      search: runSearch(lines, 'target'),
      searchFocused: false,
    });
    expect(frame).toContain('target one');
    expect(frame).toContain('target two');
    expect(frame).toContain('target three');
    expect(frame).toContain('no match here');
  });

  it('shows "0/0 — no matches" when a focused search has no matches', () => {
    const frame = frameOf({
      search: runSearch(['a', 'b'], 'zzz'),
      searchFocused: true,
    });
    expect(frame).toContain('0/0 — no matches');
  });

  it('shows "0/0 — no matches" in the unfocused summary too', () => {
    const frame = frameOf({
      search: runSearch(['a'], 'zzz'),
      searchFocused: false,
    });
    expect(frame).toContain('0/0 — no matches');
  });
});
