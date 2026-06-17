import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { Text } from 'ink';
import { FrameChrome } from './FrameChrome.js';
import { computeFrame } from '../layout-geometry.js';
import { computeBorderGrid, type FrameRegion } from '../frame.js';

function renderChrome(over: {
  columns?: number;
  rows?: number;
  showDetail?: boolean;
  focus?: FrameRegion | null;
}): string {
  const columns = over.columns ?? 80;
  const rows = over.rows ?? 24;
  const showDetail = over.showDetail ?? false;
  const frame = computeFrame({
    columns,
    rows,
    sidebarRatio: 0.2,
    verticalRatio: 0.4,
    showDetail,
  });
  const grid = computeBorderGrid({
    frame,
    columns,
    rows,
    focus: over.focus ?? null,
  });
  const t = (s: string) => () => React.createElement(Text, null, s);
  const { lastFrame } = render(
    React.createElement(FrameChrome, {
      frame,
      grid,
      renderHeader: t('HEAD'),
      renderSidebar: t('SIDE'),
      renderList: t('LIST'),
      renderDetail: t('DETAIL'),
      renderCommandBar: t('CMD'),
    }),
  );
  return lastFrame() ?? '';
}

describe('FrameChrome', () => {
  it('renders one connected collapsed grid around all regions', () => {
    const out = renderChrome({ showDetail: false });
    const lines = out.split('\n');
    // Outer corners present, single connected frame.
    expect(lines[0]).toContain('┌');
    expect(lines[0]).toContain('┐');
    expect(lines.at(-1)).toContain('└');
    expect(lines.at(-1)).toContain('┘');
    // Region content composited into its window.
    expect(out).toContain('HEAD');
    expect(out).toContain('SIDE');
    expect(out).toContain('LIST');
    expect(out).toContain('CMD');
  });

  it('renders the detail region and its divider when detail is open', () => {
    const out = renderChrome({ showDetail: true, rows: 30 });
    expect(out).toContain('DETAIL');
    expect(out).toContain('LIST');
  });

  it('draws a double-weight accent border around the focused region', () => {
    const out = renderChrome({ focus: 'sidebar' });
    // Sidebar focused → its border uses double-line glyphs.
    expect(out).toContain('║');
    expect(out).toContain('═');
  });

  it('keeps every region the same size when focus moves (no layout movement)', () => {
    // The content windows must not shift when focus changes: strip the box
    // glyphs and compare the position of each region label.
    const onSidebar = renderChrome({
      focus: 'sidebar',
      showDetail: true,
      rows: 30,
    });
    const onList = renderChrome({ focus: 'list', showDetail: true, rows: 30 });
    const labelPos = (frame: string, label: string): [number, number] => {
      const lines = frame.split('\n');
      for (let y = 0; y < lines.length; y++) {
        const x = lines[y]!.indexOf(label);
        if (x >= 0) {
          return [y, x];
        }
      }
      return [-1, -1];
    };
    for (const label of ['HEAD', 'SIDE', 'LIST', 'DETAIL', 'CMD']) {
      expect(labelPos(onList, label)).toEqual(labelPos(onSidebar, label));
    }
  });
});
