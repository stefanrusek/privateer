import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { Text } from 'ink';
import { usePaneRatios } from './use-pane-ratios.js';
import { InMemoryConfigStore } from '../boundaries/config-store.fake.js';
import type { ConfigStore } from '../boundaries/config-store.js';

function ratioToStr(n: number): string {
  return String(n);
}

function PaneRatioDisplay({ store }: { store: ConfigStore }) {
  const r = usePaneRatios(store);
  return React.createElement(
    Text,
    null,
    `sidebar=${ratioToStr(r.sidebarRatio)} vertical=${ratioToStr(r.verticalRatio)}`,
  );
}

describe('usePaneRatios', () => {
  it('returns default ratios when config is empty', async () => {
    const store = new InMemoryConfigStore();
    const { lastFrame, rerender } = render(
      React.createElement(PaneRatioDisplay, { store }),
    );
    await new Promise((r) => setTimeout(r, 20));
    rerender(React.createElement(PaneRatioDisplay, { store }));
    expect(lastFrame()).toContain('sidebar=0.2');
    expect(lastFrame()).toContain('vertical=0.6');
  });

  it('loads ratios from config store', async () => {
    const store = new InMemoryConfigStore({
      'ui.sidebarRatio': 0.3,
      'ui.verticalRatio': 0.5,
    });
    const { lastFrame, rerender } = render(
      React.createElement(PaneRatioDisplay, { store }),
    );
    await new Promise((r) => setTimeout(r, 20));
    rerender(React.createElement(PaneRatioDisplay, { store }));
    expect(lastFrame()).toContain('sidebar=0.3');
    expect(lastFrame()).toContain('vertical=0.5');
  });

  it('keeps defaults when config values are not numbers', async () => {
    const store = new InMemoryConfigStore({
      'ui.sidebarRatio': 'bad',
      'ui.verticalRatio': 'bad',
    });
    const { lastFrame, rerender } = render(
      React.createElement(PaneRatioDisplay, { store }),
    );
    await new Promise((r) => setTimeout(r, 20));
    rerender(React.createElement(PaneRatioDisplay, { store }));
    expect(lastFrame()).toContain('sidebar=0.2');
    expect(lastFrame()).toContain('vertical=0.6');
  });

  it('handles load error gracefully', async () => {
    const store = new InMemoryConfigStore();
    store.failNextLoad();
    const { lastFrame, rerender } = render(
      React.createElement(PaneRatioDisplay, { store }),
    );
    await new Promise((r) => setTimeout(r, 20));
    rerender(React.createElement(PaneRatioDisplay, { store }));
    expect(lastFrame()).toContain('sidebar=0.2');
    expect(lastFrame()).toContain('vertical=0.6');
  });

  it('setSidebarRatio updates state and persists to store', async () => {
    const store = new InMemoryConfigStore();
    let captured: ReturnType<typeof usePaneRatios> | undefined;

    function Capturer({ s }: { s: ConfigStore }) {
      const r = usePaneRatios(s);
      captured = r;
      return React.createElement(
        Text,
        null,
        'sidebar=' + ratioToStr(r.sidebarRatio),
      );
    }

    const { lastFrame, rerender } = render(
      React.createElement(Capturer, { s: store }),
    );
    await new Promise((r) => setTimeout(r, 10));
    captured!.setSidebarRatio(0.4);
    rerender(React.createElement(Capturer, { s: store }));
    await new Promise((r) => setTimeout(r, 10));
    expect(lastFrame()).toContain('sidebar=0.4');

    const saved = await store.load();
    expect(saved.ok).toBe(true);
    if (saved.ok) {
      expect(saved.value['ui.sidebarRatio']).toBe(0.4);
    }
  });

  it('setVerticalRatio updates state and persists to store', async () => {
    const store = new InMemoryConfigStore();
    let captured: ReturnType<typeof usePaneRatios> | undefined;

    function Capturer({ s }: { s: ConfigStore }) {
      const r = usePaneRatios(s);
      captured = r;
      return React.createElement(
        Text,
        null,
        'vertical=' + ratioToStr(r.verticalRatio),
      );
    }

    const { lastFrame, rerender } = render(
      React.createElement(Capturer, { s: store }),
    );
    await new Promise((r) => setTimeout(r, 10));
    captured!.setVerticalRatio(0.7);
    rerender(React.createElement(Capturer, { s: store }));
    await new Promise((r) => setTimeout(r, 10));
    expect(lastFrame()).toContain('vertical=0.7');

    const saved = await store.load();
    expect(saved.ok).toBe(true);
    if (saved.ok) {
      expect(saved.value['ui.verticalRatio']).toBe(0.7);
    }
  });
});
