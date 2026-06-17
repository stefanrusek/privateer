import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { ScrollableLines } from './ScrollableLines.js';
import type { ViewLine } from '../scroll-viewport.js';

function lines(n: number): ViewLine[] {
  return Array.from({ length: n }, (_, i) => ({ text: `line-${String(i)}` }));
}

describe('ScrollableLines', () => {
  it('renders every line when no viewport height is given', () => {
    const { lastFrame } = render(
      React.createElement(ScrollableLines, { lines: lines(5) }),
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('line-0');
    expect(out).toContain('line-4');
  });

  it('windows to the offset and never shows clipped lines or a bar when content fits', () => {
    const { lastFrame } = render(
      React.createElement(ScrollableLines, {
        lines: lines(2),
        offset: 0,
        viewportHeight: 5,
      }),
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('line-0');
    expect(out).toContain('line-1');
    // content fits → no scrollbar gutter
    expect(out).not.toContain('█');
    expect(out).not.toContain('│');
  });

  it('windows tall content and shows a scrollbar thumb', () => {
    const { lastFrame } = render(
      React.createElement(ScrollableLines, {
        lines: lines(20),
        offset: 0,
        viewportHeight: 5,
      }),
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('line-0');
    expect(out).toContain('line-4');
    // beyond the window is not rendered
    expect(out).not.toContain('line-9');
    // a scrollbar gutter is shown
    expect(out).toContain('█');
  });

  it('moving the offset reveals later lines', () => {
    const { lastFrame } = render(
      React.createElement(ScrollableLines, {
        lines: lines(20),
        offset: 10,
        viewportHeight: 5,
      }),
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('line-10');
    expect(out).toContain('line-14');
    expect(out).not.toContain('line-0\n');
  });

  it('renders empty lines as a blank row and applies styling props', () => {
    const styled: ViewLine[] = [
      { text: '', bold: true },
      { text: 'red', color: 'red' },
      { text: 'dim', dim: true },
    ];
    const { lastFrame } = render(
      React.createElement(ScrollableLines, {
        lines: styled,
        offset: 0,
        viewportHeight: 5,
      }),
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('red');
    expect(out).toContain('dim');
  });
});
