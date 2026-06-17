import { describe, it, expect } from 'vitest';
import {
  getAvailableTabs,
  navigableTabsFor,
  prevTab,
  nextTab,
  jumpTab,
  AGENT_TAB,
  type TabDef,
} from './detail-tabs.js';

// ---------------------------------------------------------------------------
// getAvailableTabs (content tabs, no Agent)
// ---------------------------------------------------------------------------

describe('getAvailableTabs', () => {
  it('Pod has overview/yaml/events/logs/metrics', () => {
    expect(getAvailableTabs('Pod', false).map((t) => t.id)).toEqual([
      'overview',
      'yaml',
      'events',
      'logs',
      'metrics',
    ]);
  });

  it('Deployment has metrics but not logs', () => {
    const ids = getAvailableTabs('Deployment', false).map((t) => t.id);
    expect(ids).toContain('metrics');
    expect(ids).not.toContain('logs');
  });

  it.each(['StatefulSet', 'DaemonSet', 'Node', 'KafkaTopic', 'Kafka'])(
    '%s has metrics but not logs',
    (kind) => {
      const ids = getAvailableTabs(kind, false).map((t) => t.id);
      expect(ids).toContain('metrics');
      expect(ids).not.toContain('logs');
    },
  );

  it('generic kind without Prometheus has no metrics', () => {
    expect(getAvailableTabs('ConfigMap', false).map((t) => t.id)).toEqual([
      'overview',
      'yaml',
      'events',
    ]);
  });

  it('generic kind with Prometheus has metrics', () => {
    expect(getAvailableTabs('ConfigMap', true).map((t) => t.id)).toContain(
      'metrics',
    );
  });
});

// ---------------------------------------------------------------------------
// navigableTabsFor (content tabs + Agent)
// ---------------------------------------------------------------------------

describe('navigableTabsFor', () => {
  it('appends the Agent tab last', () => {
    const tabs = navigableTabsFor('Pod', false);
    expect(tabs[tabs.length - 1]).toEqual(AGENT_TAB);
    expect(tabs.map((t) => t.id)).toEqual([
      'overview',
      'yaml',
      'events',
      'logs',
      'metrics',
      'agent',
    ]);
  });

  it('Deployment navigable list ends with agent and has no logs', () => {
    const ids = navigableTabsFor('Deployment', false).map((t) => t.id);
    expect(ids).toEqual(['overview', 'yaml', 'events', 'metrics', 'agent']);
  });
});

// ---------------------------------------------------------------------------
// prev / next tab navigation
// ---------------------------------------------------------------------------

const podTabs: TabDef[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'yaml', label: 'YAML' },
  { id: 'events', label: 'Events' },
  { id: 'logs', label: 'Logs' },
  { id: 'metrics', label: 'Metrics' },
  { id: 'agent', label: 'Agent' },
];

describe('nextTab', () => {
  it('moves right one tab', () => {
    expect(nextTab(podTabs, 'overview')).toBe('yaml');
  });

  it('wraps from last to first', () => {
    expect(nextTab(podTabs, 'agent')).toBe('overview');
  });

  it('returns null for an empty list', () => {
    expect(nextTab([], 'overview')).toBeNull();
  });

  it('returns null when active id absent', () => {
    const noOverview: TabDef[] = [{ id: 'yaml', label: 'YAML' }];
    expect(nextTab(noOverview, 'overview')).toBeNull();
  });
});

describe('prevTab', () => {
  it('moves left one tab', () => {
    expect(prevTab(podTabs, 'yaml')).toBe('overview');
  });

  it('wraps from first to last', () => {
    expect(prevTab(podTabs, 'overview')).toBe('agent');
  });

  it('returns null for empty list', () => {
    expect(prevTab([], 'overview')).toBeNull();
  });

  it('returns null when active id absent', () => {
    const noOverview: TabDef[] = [{ id: 'yaml', label: 'YAML' }];
    expect(prevTab(noOverview, 'overview')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// jumpTab (number keys)
// ---------------------------------------------------------------------------

describe('jumpTab', () => {
  it('1 jumps to first tab', () => {
    expect(jumpTab(podTabs, '1')).toBe('overview');
  });

  it('3 jumps to third tab', () => {
    expect(jumpTab(podTabs, '3')).toBe('events');
  });

  it('6 jumps to agent for Pod', () => {
    expect(jumpTab(podTabs, '6')).toBe('agent');
  });

  it('returns null for out-of-range index', () => {
    const deployTabs: TabDef[] = podTabs.filter((t) => t.id !== 'logs');
    expect(jumpTab(deployTabs, '6')).toBeNull();
  });

  it('returns null for non-number input', () => {
    expect(jumpTab(podTabs, 'q')).toBeNull();
    expect(jumpTab(podTabs, '')).toBeNull();
    expect(jumpTab(podTabs, '7')).toBeNull();
  });
});
