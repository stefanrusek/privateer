/**
 * Tests for dashboard-nav.ts — the Overview rule drill-down model (P9R-0017).
 */
import { describe, it, expect } from 'vitest';
import {
  OFFENDER_CAP,
  isShowableRule,
  formatOffender,
  sortOffenders,
  visibleOffenders,
  issueCount,
  buildDashboardItems,
  navigableIndices,
  initialCursor,
  clampCursor,
  moveCursor,
  ensureVisible,
  resolveAffected,
  type DashboardItem,
} from './dashboard-nav.js';
import type { AffectedResource, EvaluatedRule } from '../health/types.js';
import type { ResourceObject } from '../core/types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function af(kind: string, namespace: string, name: string): AffectedResource {
  return { kind, namespace, name };
}

function rule(
  id: string,
  status: EvaluatedRule['result']['status'],
  affected: AffectedResource[] = [],
): EvaluatedRule {
  return {
    rule: {
      id,
      category: 'resources',
      severity: 'error',
      title: (r) => `${id}: ${String(r.affectedResources.length)} affected`,
      evaluate: () => ({ status: 'ok', affectedResources: [] }),
    },
    result: { status, affectedResources: affected },
  };
}

function offenders(n: number, ns = 'default'): AffectedResource[] {
  return Array.from({ length: n }, (_, i) =>
    af('Pod', ns, `pod-${String(i).padStart(3, '0')}`),
  );
}

// ---------------------------------------------------------------------------
// isShowableRule / issueCount
// ---------------------------------------------------------------------------

describe('isShowableRule', () => {
  it('is true for error and warn', () => {
    expect(isShowableRule(rule('A', 'error'))).toBe(true);
    expect(isShowableRule(rule('B', 'warn'))).toBe(true);
  });
  it('is false for ok/suppressed', () => {
    expect(isShowableRule(rule('C', 'ok'))).toBe(false);
    expect(isShowableRule(rule('D', 'suppressed'))).toBe(false);
  });
});

describe('issueCount', () => {
  it('counts only error/warn rules', () => {
    expect(
      issueCount([
        rule('A', 'error'),
        rule('B', 'warn'),
        rule('C', 'ok'),
        rule('D', 'suppressed'),
      ]),
    ).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// formatOffender / sortOffenders
// ---------------------------------------------------------------------------

describe('formatOffender', () => {
  it('renders kind/namespace/name for namespaced resources', () => {
    expect(formatOffender(af('Pod', 'default', 'api'))).toBe('Pod/default/api');
  });
  it('omits the empty namespace for cluster-scoped resources', () => {
    expect(formatOffender(af('Node', '', 'node-1'))).toBe('Node/node-1');
  });
});

describe('sortOffenders', () => {
  it('sorts by namespace then name', () => {
    const sorted = sortOffenders([
      af('Pod', 'b', 'z'),
      af('Pod', 'a', 'y'),
      af('Pod', 'a', 'x'),
    ]);
    expect(sorted.map(formatOffender)).toEqual([
      'Pod/a/x',
      'Pod/a/y',
      'Pod/b/z',
    ]);
  });
  it('does not mutate its input', () => {
    const input = [af('Pod', 'b', 'z'), af('Pod', 'a', 'y')];
    sortOffenders(input);
    expect(input[0]?.namespace).toBe('b');
  });
});

// ---------------------------------------------------------------------------
// visibleOffenders
// ---------------------------------------------------------------------------

describe('visibleOffenders', () => {
  it('returns all when at or below the cap', () => {
    const { visible, remaining } = visibleOffenders(
      offenders(OFFENDER_CAP),
      false,
    );
    expect(visible).toHaveLength(OFFENDER_CAP);
    expect(remaining).toBe(0);
  });
  it('caps and reports the remainder', () => {
    const { visible, remaining } = visibleOffenders(offenders(47), false);
    expect(visible).toHaveLength(OFFENDER_CAP);
    expect(remaining).toBe(37);
  });
  it('returns everything when showAll is set', () => {
    const { visible, remaining } = visibleOffenders(offenders(47), true);
    expect(visible).toHaveLength(47);
    expect(remaining).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// buildDashboardItems
// ---------------------------------------------------------------------------

const NONE: ReadonlySet<string> = new Set();

describe('buildDashboardItems', () => {
  it('renders a collapsed error rule as a single navigable row', () => {
    const items = buildDashboardItems({
      rules: [rule('A', 'error', offenders(3))],
      expandedRuleIds: NONE,
      showAllRuleIds: NONE,
      showPassing: false,
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      type: 'rule',
      navigable: true,
      expanded: false,
    });
  });

  it('expands offenders sorted, capped, with a more row', () => {
    const items = buildDashboardItems({
      rules: [rule('A', 'error', offenders(47))],
      expandedRuleIds: new Set(['A']),
      showAllRuleIds: NONE,
      showPassing: false,
    });
    // 1 rule + 10 offenders + 1 more
    expect(items).toHaveLength(12);
    expect(items[0]).toMatchObject({ type: 'rule', expanded: true });
    expect(items[1]).toMatchObject({ type: 'offender', navigable: true });
    expect(items[11]).toMatchObject({ type: 'more', remaining: 37 });
  });

  it('shows all offenders and no more row when showAll is set', () => {
    const items = buildDashboardItems({
      rules: [rule('A', 'error', offenders(47))],
      expandedRuleIds: new Set(['A']),
      showAllRuleIds: new Set(['A']),
      showPassing: false,
    });
    expect(items).toHaveLength(48);
    expect(items.some((i) => i.type === 'more')).toBe(false);
  });

  it('does not expand a non-showable (suppressed) rule', () => {
    const items = buildDashboardItems({
      rules: [rule('S', 'suppressed', [])],
      expandedRuleIds: new Set(['S']),
      showAllRuleIds: NONE,
      showPassing: false,
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      type: 'rule',
      navigable: false,
      expanded: false,
    });
  });

  it('adds a collapsed passing toggle when ok rules exist', () => {
    const items = buildDashboardItems({
      rules: [rule('A', 'error'), rule('B', 'ok'), rule('C', 'ok')],
      expandedRuleIds: NONE,
      showAllRuleIds: NONE,
      showPassing: false,
    });
    const toggle = items.find((i) => i.type === 'passingToggle');
    expect(toggle).toMatchObject({
      count: 2,
      showPassing: false,
      navigable: true,
    });
    expect(items.some((i) => i.type === 'passingRule')).toBe(false);
  });

  it('renders dimmed passing rules when expanded', () => {
    const items = buildDashboardItems({
      rules: [rule('B', 'ok'), rule('C', 'ok')],
      expandedRuleIds: NONE,
      showAllRuleIds: NONE,
      showPassing: true,
    });
    expect(items.filter((i) => i.type === 'passingRule')).toHaveLength(2);
    expect(items.find((i) => i.type === 'passingToggle')).toMatchObject({
      showPassing: true,
    });
  });

  it('omits the passing toggle when there are no ok rules', () => {
    const items = buildDashboardItems({
      rules: [rule('A', 'error')],
      expandedRuleIds: NONE,
      showAllRuleIds: NONE,
      showPassing: false,
    });
    expect(items.some((i) => i.type === 'passingToggle')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Cursor navigation
// ---------------------------------------------------------------------------

function sampleItems(): DashboardItem[] {
  return buildDashboardItems({
    rules: [
      rule('A', 'error', offenders(2)),
      rule('S', 'suppressed'),
      rule('B', 'ok'),
    ],
    expandedRuleIds: new Set(['A']),
    showAllRuleIds: NONE,
    showPassing: false,
  });
  // rows: 0 rule A (nav), 1 offender, 2 offender, 3 suppressed rule (not nav),
  //       4 passingToggle (nav)
}

describe('navigableIndices / initialCursor', () => {
  it('lists only navigable rows', () => {
    expect(navigableIndices(sampleItems())).toEqual([0, 1, 2, 4]);
  });
  it('initialCursor is the first navigable row', () => {
    expect(initialCursor(sampleItems())).toBe(0);
  });
  it('initialCursor is -1 when nothing navigable', () => {
    const items = buildDashboardItems({
      rules: [rule('S', 'suppressed')],
      expandedRuleIds: NONE,
      showAllRuleIds: NONE,
      showPassing: false,
    });
    expect(initialCursor(items)).toBe(-1);
  });
});

describe('moveCursor', () => {
  const items = sampleItems();
  it('advances to the next navigable row', () => {
    expect(moveCursor(items, 0, 1)).toBe(1);
    expect(moveCursor(items, 2, 1)).toBe(4); // skips the suppressed row
  });
  it('retreats to the previous navigable row', () => {
    expect(moveCursor(items, 4, -1)).toBe(2);
  });
  it('stops at the ends', () => {
    expect(moveCursor(items, 4, 1)).toBe(4);
    expect(moveCursor(items, 0, -1)).toBe(0);
  });
  it('initializes from an off-cursor position', () => {
    expect(moveCursor(items, 3, 1)).toBe(0);
    expect(moveCursor(items, 3, -1)).toBe(4);
  });
  it('returns -1 when nothing navigable', () => {
    const inert = buildDashboardItems({
      rules: [rule('S', 'suppressed')],
      expandedRuleIds: NONE,
      showAllRuleIds: NONE,
      showPassing: false,
    });
    expect(moveCursor(inert, 0, 1)).toBe(-1);
  });
});

describe('clampCursor', () => {
  const items = sampleItems();
  it('keeps a valid cursor', () => {
    expect(clampCursor(items, 2)).toBe(2);
  });
  it('snaps to the next navigable row after collapse', () => {
    expect(clampCursor(items, 3)).toBe(4);
  });
  it('falls back to the last navigable row past the end', () => {
    expect(clampCursor(items, 99)).toBe(4);
  });
  it('is -1 when nothing navigable', () => {
    const inert = buildDashboardItems({
      rules: [rule('S', 'suppressed')],
      expandedRuleIds: NONE,
      showAllRuleIds: NONE,
      showPassing: false,
    });
    expect(clampCursor(inert, 0)).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// ensureVisible
// ---------------------------------------------------------------------------

describe('ensureVisible', () => {
  it('keeps offset when the cursor is already visible', () => {
    expect(ensureVisible(3, 0, 10)).toBe(0);
  });
  it('scrolls up when the cursor is above the window', () => {
    expect(ensureVisible(2, 5, 10)).toBe(2);
  });
  it('scrolls down when the cursor is below the window', () => {
    expect(ensureVisible(15, 0, 10)).toBe(6);
  });
  it('is a no-op for a -1 cursor', () => {
    expect(ensureVisible(-1, 4, 10)).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// resolveAffected
// ---------------------------------------------------------------------------

function ro(namespace: string | null, name: string): ResourceObject {
  return {
    uid: `${namespace ?? '~'}/${name}`,
    kind: 'Pod',
    apiVersion: 'v1',
    name,
    namespace,
    labels: {},
    annotations: {},
    creationTimestamp: '2026-01-01T00:00:00Z',
    resourceVersion: '1',
    status: { color: 'green', label: 'Running' },
    raw: {},
  };
}

describe('resolveAffected', () => {
  it('matches by name and namespace', () => {
    const found = resolveAffected(
      [ro('default', 'api'), ro('default', 'web')],
      af('Pod', 'default', 'web'),
    );
    expect(found?.name).toBe('web');
  });
  it('treats a null namespace as empty', () => {
    const found = resolveAffected(
      [ro(null, 'node-1')],
      af('Node', '', 'node-1'),
    );
    expect(found?.name).toBe('node-1');
  });
  it('returns undefined when absent', () => {
    expect(
      resolveAffected([ro('default', 'api')], af('Pod', 'default', 'gone')),
    ).toBeUndefined();
  });
});
