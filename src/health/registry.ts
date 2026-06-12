/**
 * Health rule registry — catalog of all rules + parallel evaluation +
 * result aggregation and sorting (errors → warn → ok) (Spec 06 §6.1).
 */

import type {
  HealthRule,
  EvaluatedRule,
  RuleCaps,
  RuleStatus,
} from './types.js';

/** Status values that appear in sorted output (skipped items are filtered before sorting). */
type SortableStatus = Exclude<RuleStatus, 'skipped'>;
import type { StateStore } from '../store/state-store.js';

import { RES_001, RES_002, RES_003, RES_004, RES_005 } from './rules/res.js';
import { REL_001, REL_002, REL_003, REL_004 } from './rules/rel.js';
import {
  OBS_001,
  OBS_002,
  OBS_003,
  OBS_010,
  OBS_011,
  OBS_012,
} from './rules/obs.js';
import {
  SEC_001,
  SEC_002,
  SEC_003,
  SEC_004,
  SEC_005,
  SEC_006,
  SEC_007,
} from './rules/sec.js';
import { NET_001, NET_002, NET_003 } from './rules/net.js';
import { STO_001, STO_002, STO_003 } from './rules/sto.js';
import {
  KFK_001,
  KFK_002,
  KFK_003,
  KFK_004,
  KFK_005,
  KFK_006,
  KFK_007,
  KFK_008,
  KFK_009,
  KFK_010,
  KFK_011,
  KFK_012,
  KFK_013,
} from './rules/kfk.js';

/** The full rule catalog (Spec 06 §6.2–§6.6). */
export const RULE_CATALOG: readonly HealthRule[] = [
  // Resources
  RES_001,
  RES_002,
  RES_003,
  RES_004,
  RES_005,
  // Reliability
  REL_001,
  REL_002,
  REL_003,
  REL_004,
  // Observability
  OBS_001,
  OBS_002,
  OBS_003,
  OBS_010,
  OBS_011,
  OBS_012,
  // Security
  SEC_001,
  SEC_002,
  SEC_003,
  SEC_004,
  SEC_005,
  SEC_006,
  SEC_007,
  // Networking
  NET_001,
  NET_002,
  NET_003,
  // Storage
  STO_001,
  STO_002,
  STO_003,
  // Kafka
  KFK_001,
  KFK_002,
  KFK_003,
  KFK_004,
  KFK_005,
  KFK_006,
  KFK_007,
  KFK_008,
  KFK_009,
  KFK_010,
  KFK_011,
  KFK_012,
  KFK_013,
];

/** Sort order for statuses: error first, then warn, then ok, suppressed last. */
function statusSortOrder(status: SortableStatus): number {
  switch (status) {
    case 'error':
      return 0;
    case 'warn':
      return 1;
    case 'ok':
      return 2;
    case 'suppressed':
      return 3;
  }
}

/**
 * Evaluate all rules in parallel and return results sorted by severity
 * (errors → warn → ok → suppressed → skipped).
 *
 * Results with status 'skipped' are excluded from the returned array —
 * they represent inapplicable rules (e.g. Kafka rules when no Kafka present).
 */
export function evaluateAllRules(
  store: StateStore,
  context: string,
  caps: RuleCaps,
  rules: readonly HealthRule[] = RULE_CATALOG,
): EvaluatedRule[] {
  const evaluated: EvaluatedRule[] = rules.map((rule) => ({
    rule,
    result: rule.evaluate(store, context, caps),
  }));

  return evaluated
    .filter((e) => e.result.status !== 'skipped')
    .sort(
      (a, b) =>
        statusSortOrder(a.result.status as SortableStatus) -
        statusSortOrder(b.result.status as SortableStatus),
    );
}

/**
 * Look up a single rule by ID. Returns undefined if not found.
 */
export function findRule(id: string): HealthRule | undefined {
  return RULE_CATALOG.find((r) => r.id === id);
}
