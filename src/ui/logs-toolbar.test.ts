import { describe, it, expect } from 'vitest';
import {
  buildContainerItems,
  buildLineLimitItems,
  LOGS_TOOLBAR_ACCELERATORS,
} from './logs-toolbar.js';
import type { ContainerOption } from '../logs/container-picker.js';
import { LINE_OPTIONS, DEFAULT_LINE_OPTION } from '../logs/line-options.js';

function opt(over: Partial<ContainerOption> = {}): ContainerOption {
  return {
    name: 'app',
    label: 'app',
    phase: 'running',
    isInit: false,
    hasPrevious: false,
    ...over,
  };
}

describe('buildContainerItems', () => {
  it('builds one item per container with a phase dot and the name', () => {
    const items = buildContainerItems(
      [opt({ name: 'app', label: 'app' })],
      'app',
    );
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe('app');
    expect(items[0]?.label).toContain('app');
    expect(items[0]?.label).toContain('●');
  });

  it('marks the current container with a check and the flag', () => {
    const items = buildContainerItems(
      [opt({ name: 'app' }), opt({ name: 'sidecar' })],
      'sidecar',
    );
    expect(items[0]?.current).toBe(false);
    expect(items[0]?.label).not.toContain('✓');
    expect(items[1]?.current).toBe(true);
    expect(items[1]?.label).toContain('✓');
  });

  it('does not mark any container when the current name matches none', () => {
    const items = buildContainerItems([opt({ name: 'app' })], 'gone');
    expect(items[0]?.current).toBe(false);
    expect(items.every((i) => !i.label.includes('✓'))).toBe(true);
  });

  it('colors the dot by phase', () => {
    const items = buildContainerItems(
      [
        opt({ name: 'r', phase: 'running' }),
        opt({ name: 'w', phase: 'waiting' }),
        opt({ name: 't', phase: 'terminated' }),
      ],
      'r',
    );
    expect(items[0]?.dotColor).toBe('green');
    expect(items[1]?.dotColor).toBe('yellow');
    expect(items[2]?.dotColor).toBe('gray');
  });

  it('preserves the (init) suffix carried by the option label', () => {
    const items = buildContainerItems(
      [opt({ name: 'setup', label: 'setup (init)', isInit: true })],
      'setup',
    );
    expect(items[0]?.label).toContain('setup (init)');
  });

  it('returns an empty list for no containers', () => {
    expect(buildContainerItems([], '')).toEqual([]);
  });
});

describe('buildLineLimitItems', () => {
  it('builds one item per LINE_OPTIONS entry', () => {
    const items = buildLineLimitItems(DEFAULT_LINE_OPTION);
    expect(items).toHaveLength(LINE_OPTIONS.length);
    expect(items.map((i) => i.id)).toEqual(LINE_OPTIONS.map((o) => o.id));
    expect(items.map((i) => i.label)).toEqual(LINE_OPTIONS.map((o) => o.label));
  });

  it('marks the current limit', () => {
    const items = buildLineLimitItems('last-1000');
    const marked = items.filter((i) => i.current);
    expect(marked).toHaveLength(1);
    expect(marked[0]?.id).toBe('last-1000');
  });
});

describe('LOGS_TOOLBAR_ACCELERATORS', () => {
  it('opens the container dropdown with o (not c)', () => {
    expect(LOGS_TOOLBAR_ACCELERATORS['logs.container']).toBe('o');
  });

  it('opens the line-limit dropdown with l', () => {
    expect(LOGS_TOOLBAR_ACCELERATORS['logs.lineLimit']).toBe('l');
  });

  it('maps the toggle accelerators', () => {
    expect(LOGS_TOOLBAR_ACCELERATORS['logs.pause']).toBe('p');
    expect(LOGS_TOOLBAR_ACCELERATORS['logs.timestamps']).toBe('t');
    expect(LOGS_TOOLBAR_ACCELERATORS['logs.wrap']).toBe('w');
    expect(LOGS_TOOLBAR_ACCELERATORS['logs.download']).toBe('d');
  });

  it('has no duplicate accelerator keys', () => {
    const keys = Object.values(LOGS_TOOLBAR_ACCELERATORS);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
