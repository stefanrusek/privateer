/**
 * dashboard-nav.ts — pure logic for the Overview dashboard rule drill-down
 * (P9R-0017). Owns the flattened, navigable item model behind the Best
 * Practices section: expansion, offender formatting/sorting, the cap-at-10
 * math, keyboard-cursor movement, scroll windowing, and offender resolution.
 *
 * All decisions live here (fully covered); the controller and HealthDashboard
 * component only wire this to state and rendering.
 */

import type { ResourceObject } from '../core/types.js';
import type { AffectedResource, EvaluatedRule } from '../health/types.js';

/** Offenders shown before the "… and N more [all]" fold (Spec: P9R-0017). */
export const OFFENDER_CAP = 10;

/** A best-practices rule headline row. */
export interface DashboardRuleItem {
  readonly type: 'rule';
  readonly ruleId: string;
  readonly evaluated: EvaluatedRule;
  /** error/warn rules can expand and be activated; others are inert. */
  readonly navigable: boolean;
  readonly expanded: boolean;
}

/** One offender line under an expanded rule. */
export interface DashboardOffenderItem {
  readonly type: 'offender';
  readonly ruleId: string;
  readonly offender: AffectedResource;
  readonly text: string;
  readonly navigable: true;
}

/** The "… and N more [all]" fold under a capped, expanded rule. */
export interface DashboardMoreItem {
  readonly type: 'more';
  readonly ruleId: string;
  readonly remaining: number;
  readonly navigable: true;
}

/** The passing-rules footer toggle ([show passing] / [hide passing]). */
export interface DashboardPassingToggleItem {
  readonly type: 'passingToggle';
  readonly count: number;
  readonly showPassing: boolean;
  readonly navigable: true;
}

/** A dimmed passing rule row (shown only while passing is expanded). */
export interface DashboardPassingRuleItem {
  readonly type: 'passingRule';
  readonly evaluated: EvaluatedRule;
  readonly navigable: false;
}

export type DashboardItem =
  | DashboardRuleItem
  | DashboardOffenderItem
  | DashboardMoreItem
  | DashboardPassingToggleItem
  | DashboardPassingRuleItem;

export interface BuildDashboardItemsInput {
  readonly rules: readonly EvaluatedRule[];
  readonly expandedRuleIds: ReadonlySet<string>;
  readonly showAllRuleIds: ReadonlySet<string>;
  readonly showPassing: boolean;
}

/** True for rules that render a `[show]` affordance and offenders. */
export function isShowableRule(evaluated: EvaluatedRule): boolean {
  return (
    evaluated.result.status === 'error' || evaluated.result.status === 'warn'
  );
}

/** Format one offender as `kind/namespace/name` (kind always prefixed). */
export function formatOffender(offender: AffectedResource): string {
  if (offender.namespace === '') {
    return `${offender.kind}/${offender.name}`;
  }
  return `${offender.kind}/${offender.namespace}/${offender.name}`;
}

/** Sort offenders by namespace, then name (stable, locale-aware). */
export function sortOffenders(
  offenders: readonly AffectedResource[],
): AffectedResource[] {
  return [...offenders].sort((a, b) => {
    const ns = a.namespace.localeCompare(b.namespace);
    return ns !== 0 ? ns : a.name.localeCompare(b.name);
  });
}

/**
 * Split a rule's sorted offenders into the visible slice and the remaining
 * count. Capped at {@link OFFENDER_CAP} unless `showAll` is set.
 */
export function visibleOffenders(
  offenders: readonly AffectedResource[],
  showAll: boolean,
): { visible: AffectedResource[]; remaining: number } {
  const sorted = sortOffenders(offenders);
  if (showAll || sorted.length <= OFFENDER_CAP) {
    return { visible: sorted, remaining: 0 };
  }
  return {
    visible: sorted.slice(0, OFFENDER_CAP),
    remaining: sorted.length - OFFENDER_CAP,
  };
}

/** Non-OK rules shown in the issue list (error → warn → suppressed). */
function issueRules(rules: readonly EvaluatedRule[]): readonly EvaluatedRule[] {
  return rules.filter(
    (e) =>
      e.result.status === 'error' ||
      e.result.status === 'warn' ||
      e.result.status === 'suppressed',
  );
}

/** Passing (ok) rules. */
function okRules(rules: readonly EvaluatedRule[]): readonly EvaluatedRule[] {
  return rules.filter((e) => e.result.status === 'ok');
}

/** Count of error/warn rules (the "N issues" headline). */
export function issueCount(rules: readonly EvaluatedRule[]): number {
  return rules.filter(isShowableRule).length;
}

/**
 * Flatten the Best Practices section into an ordered row model: each non-OK
 * rule, its visible offenders + fold (when expanded), then the passing-rules
 * toggle and (when expanded) the dimmed passing list. Rendering and cursor
 * navigation both consume this so an item's index always names the same row.
 */
export function buildDashboardItems(
  input: BuildDashboardItemsInput,
): DashboardItem[] {
  const items: DashboardItem[] = [];
  for (const evaluated of issueRules(input.rules)) {
    const showable = isShowableRule(evaluated);
    const expanded = showable && input.expandedRuleIds.has(evaluated.rule.id);
    items.push({
      type: 'rule',
      ruleId: evaluated.rule.id,
      evaluated,
      navigable: showable,
      expanded,
    });
    if (expanded) {
      const { visible, remaining } = visibleOffenders(
        evaluated.result.affectedResources,
        input.showAllRuleIds.has(evaluated.rule.id),
      );
      for (const offender of visible) {
        items.push({
          type: 'offender',
          ruleId: evaluated.rule.id,
          offender,
          text: formatOffender(offender),
          navigable: true,
        });
      }
      if (remaining > 0) {
        items.push({
          type: 'more',
          ruleId: evaluated.rule.id,
          remaining,
          navigable: true,
        });
      }
    }
  }

  const passing = okRules(input.rules);
  if (passing.length > 0) {
    items.push({
      type: 'passingToggle',
      count: passing.length,
      showPassing: input.showPassing,
      navigable: true,
    });
    if (input.showPassing) {
      for (const evaluated of passing) {
        items.push({ type: 'passingRule', evaluated, navigable: false });
      }
    }
  }
  return items;
}

/** Indices of navigable rows within an item list. */
export function navigableIndices(items: readonly DashboardItem[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < items.length; i++) {
    if (items[i]?.navigable) {
      out.push(i);
    }
  }
  return out;
}

/** First navigable row index, or -1 when nothing is navigable. */
export function initialCursor(items: readonly DashboardItem[]): number {
  return navigableIndices(items)[0] ?? -1;
}

/**
 * Clamp a cursor to a valid navigable index after the item list changed
 * (expansion/collapse, re-evaluation). Keeps the nearest navigable row at or
 * after the old position, else the last navigable row, else -1.
 */
export function clampCursor(
  items: readonly DashboardItem[],
  cursor: number,
): number {
  const navs = navigableIndices(items);
  const last = navs[navs.length - 1];
  if (last === undefined) {
    return -1;
  }
  if (navs.includes(cursor)) {
    return cursor;
  }
  return navs.find((i) => i > cursor) ?? last;
}

/**
 * Move the cursor to the next (`dir=1`) or previous (`dir=-1`) navigable row.
 * Stops at the ends (no wrap). Initializes to the first/last navigable row when
 * the current cursor is not on a navigable index.
 */
export function moveCursor(
  items: readonly DashboardItem[],
  cursor: number,
  dir: 1 | -1,
): number {
  const navs = navigableIndices(items);
  if (navs.length === 0) {
    return -1;
  }
  const pos = navs.indexOf(cursor);
  const targetIndex =
    pos === -1 ? (dir === 1 ? 0 : navs.length - 1) : pos + dir;
  // An out-of-range target (past either end) leaves the cursor where it is.
  return navs[targetIndex] ?? cursor;
}

/**
 * ResourceTable-style windowing: return the scroll offset that keeps
 * `cursorIndex` visible within a `viewport`-row window. Mirrors the list
 * view's `ensureVisible`.
 */
export function ensureVisible(
  cursorIndex: number,
  scrollOffset: number,
  viewport: number,
): number {
  if (cursorIndex < 0) {
    return scrollOffset;
  }
  if (cursorIndex < scrollOffset) {
    return cursorIndex;
  }
  if (cursorIndex >= scrollOffset + viewport) {
    return cursorIndex - viewport + 1;
  }
  return scrollOffset;
}

/**
 * Resolve an offender back to a live resource from a kind's stored list,
 * treating a null/empty namespace as equivalent. Returns undefined when the
 * resource no longer exists (deleted/fixed since evaluation).
 */
export function resolveAffected(
  candidates: readonly ResourceObject[],
  target: AffectedResource,
): ResourceObject | undefined {
  return candidates.find(
    (r) => r.name === target.name && (r.namespace ?? '') === target.namespace,
  );
}
