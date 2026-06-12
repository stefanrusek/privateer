/**
 * Health rule engine domain types (Spec 06 §6.1).
 *
 * Rules are pure functions over the State Store snapshot — no I/O, no timers.
 */

import type { StateStore } from '../store/state-store.js';

export type RuleCategory =
  | 'resources'
  | 'reliability'
  | 'security'
  | 'networking'
  | 'storage'
  | 'kafka'
  | 'observability';

export type Severity = 'error' | 'warn' | 'info';

export type RuleStatus = 'error' | 'warn' | 'ok' | 'suppressed' | 'skipped';

export interface AffectedResource {
  kind: string;
  namespace: string;
  name: string;
}

export interface RuleResult {
  status: RuleStatus;
  affectedResources: AffectedResource[];
  detail?: string;
}

export interface HealthRule {
  id: string;
  category: RuleCategory;
  severity: Severity;
  title: (result: RuleResult) => string;
  evaluate: (store: StateStore, context: string, caps: RuleCaps) => RuleResult;
}

/**
 * Exporter/detection capabilities consumed by rules that depend on metrics or
 * operator presence (Spec 06 §2.2.1, §6.5).
 */
export interface RuleCaps {
  /** kafka_consumergroup_lag metric available (Kafka Exporter). */
  readonly kafkaExporter: boolean;
  /** JMX broker metrics available (kafka_server_replicamanager_underreplicatedpartitions). */
  readonly strimziJmx: boolean;
  /** Strimzi CRDs detected in the cluster. */
  readonly strimziPresent: boolean;
  /** Doppler or External Secrets operator detected. */
  readonly secretsOperatorPresent: boolean;
}

export const EMPTY_CAPS: RuleCaps = {
  kafkaExporter: false,
  strimziJmx: false,
  strimziPresent: false,
  secretsOperatorPresent: false,
};

export interface EvaluatedRule {
  rule: HealthRule;
  result: RuleResult;
}
