/**
 * HealthDashboard — default landing view (Spec 06 §5).
 *
 * Shows:
 *  - Summary counts with click-through navigation
 *  - Best Practices rule results (errors → warn → ok, OK collapsed by default)
 *  - Metrics Overview (sparklines, degrade if no source)
 *  - Kafka section (Kafka-Exporter empty state + KFK-013)
 *
 * Prop-driven; no internal state mutations.
 */

import React from 'react';
import { Box, Text } from 'ink';
import type {
  AffectedResource,
  EvaluatedRule,
  RuleResult,
  RuleStatus,
} from '../../health/types.js';
import {
  buildDashboardItems,
  issueCount as computeIssueCount,
  type DashboardItem,
} from '../dashboard-nav.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClusterSummary {
  podsRunning: number;
  warnings: number;
  errors: number;
  pending: number;
  nodesReady: number;
  nodesTotal: number;
  /** Nodes with any pressure condition (Memory/Disk/PID) True; informational only — never subtracted from nodesReady. */
  nodesUnderPressure: number;
  namespaceCount: number;
}

export interface MetricsOverviewData {
  /** Whether a Prometheus source is connected. */
  prometheusConnected: boolean;
  /** Sparkline string for CPU (10 chars, Unicode block chars). */
  cpuSparkline: string;
  /** Average CPU percentage across cluster (0–100). */
  cpuAvgPct: number;
  /** Sparkline string for Memory. */
  memSparkline: string;
  /** Average memory percentage across cluster (0–100). */
  memAvgPct: number;
}

export interface KafkaTopicSummary {
  name: string;
  /** Max consumer lag across all groups. */
  maxLag: number;
  /** Trend indicator. */
  trend: 'climbing' | 'dropping' | 'stable';
}

export interface KafkaSectionData {
  /** Whether Kafka is detected. */
  detected: boolean;
  /** Strimzi or bare. */
  deploymentType: 'strimzi' | 'bare' | 'none';
  /** Whether Kafka Exporter metrics are available. */
  exporterAvailable: boolean;
  topics: KafkaTopicSummary[];
}

/**
 * A measured, clickable affordance the adapter injects (a `<Button>`); when
 * omitted (unit tests) the section falls back to plain underlined text.
 */
export interface DashboardButtonSpec {
  /** Unique measured-registry id. */
  id: string;
  /** Visible label (e.g. `[show]`, an offender line). */
  label: string;
  /** Fired on click. */
  onClick: () => void;
  /** Cursor highlight (bold). */
  active: boolean;
  /**
   * Forces a remeasure even though id/label/layer are unchanged. The
   * best-practices list is windowed (`BestPracticesSection`'s `scroll`):
   * scrolling shifts every still-mounted row's screen position without
   * changing its React key, id, or label, so a measured Button would
   * otherwise keep its stale pre-scroll rect and silently miss clicks (the
   * same class of bug `PortForwardManager` hit — see its `remeasureKey`).
   * Callers pass the current scroll offset here.
   */
  remeasureKey: number;
}

export interface HealthDashboardProps {
  clusterName: string;
  summary: ClusterSummary;
  rules: EvaluatedRule[];
  /** Whether the OK rules section is expanded. */
  showPassing: boolean;
  /** Rule ids currently expanded to their offender list. */
  expandedRuleIds: ReadonlySet<string>;
  /** Rule ids whose offender list is fully expanded (past the cap). */
  showAllRuleIds: ReadonlySet<string>;
  /** Item-index cursor into the best-practices rows; -1 when none. */
  cursor: number;
  /** Whether the dashboard (list region) is focused — drives the cursor. */
  focused: boolean;
  /** Rows the best-practices list shows before scrolling. */
  bestPracticesViewport: number;
  /** Scroll offset (item index) for the best-practices list. */
  bestPracticesScroll: number;
  metrics: MetricsOverviewData | null;
  kafka: KafkaSectionData;

  // Interaction callbacks
  onNavigateWarnings: () => void;
  onNavigateErrors: () => void;
  onToggleRule: (ruleId: string) => void;
  onShowAllOffenders: (ruleId: string) => void;
  onNavigateOffender: (offender: AffectedResource) => void;
  onToggleShowPassing: () => void;
  onNavigateKafkaTopic: (topicName: string) => void;
  /** Adapter-injected measured button renderer; text fallback when absent. */
  renderButton?: (spec: DashboardButtonSpec) => React.ReactNode;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Statuses that render as an issue row (error → warn → suppressed). OK rules
 * render as a dimmed `✓ title` line and never reach these helpers.
 */
type IssueStatus = Exclude<RuleStatus, 'skipped' | 'ok'>;

function statusIcon(status: IssueStatus): string {
  switch (status) {
    case 'error':
      return '✕';
    case 'warn':
      return '⚠';
    case 'suppressed':
      return '○';
  }
}

type InkColor = 'red' | 'yellow' | 'green' | 'grey' | 'cyan' | 'white';

function statusColor(status: IssueStatus): InkColor {
  switch (status) {
    case 'error':
      return 'red';
    case 'warn':
      return 'yellow';
    case 'suppressed':
      return 'grey';
  }
}

function severityLabel(status: IssueStatus): string {
  switch (status) {
    case 'error':
      return 'ERROR';
    case 'warn':
      return 'WARN ';
    case 'suppressed':
      return 'SUPR ';
  }
}

function trendArrow(trend: string): string {
  switch (trend) {
    case 'climbing':
      return '↑';
    case 'dropping':
      return '↓';
    default:
      return '→';
  }
}

function formatLag(lag: number): string {
  if (lag >= 1_000_000) {
    return `${String(Math.round(lag / 1_000_000))}M`;
  }
  if (lag >= 1_000) {
    return `${String(Math.round(lag / 1_000))}k`;
  }
  return String(lag);
}

// ---------------------------------------------------------------------------
// SummarySection
// ---------------------------------------------------------------------------

interface SummarySectionProps {
  summary: ClusterSummary;
  onNavigateWarnings: () => void;
  onNavigateErrors: () => void;
}

function SummarySection({
  summary,
  onNavigateWarnings: _onNavigateWarnings,
  onNavigateErrors: _onNavigateErrors,
}: SummarySectionProps): React.ReactElement {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold>SUMMARY</Text>
      <Box flexDirection="row" gap={2}>
        <Text color="green">● {String(summary.podsRunning)} pods running</Text>
        <Text color="yellow">● {String(summary.warnings)} warnings</Text>
        <Text color="red">✕ {String(summary.errors)} errors</Text>
        <Text>○ {String(summary.pending)} pending</Text>
      </Box>
      <Text>
        Nodes: {String(summary.nodesReady)}/{String(summary.nodesTotal)} ready
        {'   '}Namespaces: {String(summary.namespaceCount)}
      </Text>
      {summary.nodesUnderPressure > 0 && (
        <Text color="yellow">
          ⚠ {String(summary.nodesUnderPressure)}{' '}
          {summary.nodesUnderPressure === 1 ? 'node' : 'nodes'} under pressure
        </Text>
      )}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// BestPracticesSection
// ---------------------------------------------------------------------------

interface BestPracticesSectionProps {
  rules: EvaluatedRule[];
  showPassing: boolean;
  expandedRuleIds: ReadonlySet<string>;
  showAllRuleIds: ReadonlySet<string>;
  cursor: number;
  focused: boolean;
  viewport: number;
  scroll: number;
  onToggleRule: (ruleId: string) => void;
  onShowAllOffenders: (ruleId: string) => void;
  onNavigateOffender: (offender: AffectedResource) => void;
  onToggleShowPassing: () => void;
  renderButton: ((spec: DashboardButtonSpec) => React.ReactNode) | undefined;
}

/** Render an affordance as a measured button, or plain underlined text. */
function affordance(
  spec: DashboardButtonSpec,
  renderButton: ((spec: DashboardButtonSpec) => React.ReactNode) | undefined,
): React.ReactNode {
  if (renderButton !== undefined) {
    return renderButton(spec);
  }
  return (
    <Text color="cyan" underline bold={spec.active}>
      {spec.label}
    </Text>
  );
}

/** The 1-char cursor gutter, only visible when the region is focused. */
function gutter(active: boolean): React.ReactElement {
  return <Text color="cyan">{active ? '›' : ' '}</Text>;
}

function DashboardRow({
  item,
  active,
  scroll,
  onToggleRule,
  onShowAllOffenders,
  onNavigateOffender,
  onToggleShowPassing,
  renderButton,
}: {
  item: DashboardItem;
  active: boolean;
  /** Current best-practices scroll offset — see `DashboardButtonSpec.remeasureKey`. */
  scroll: number;
  onToggleRule: (ruleId: string) => void;
  onShowAllOffenders: (ruleId: string) => void;
  onNavigateOffender: (offender: AffectedResource) => void;
  onToggleShowPassing: () => void;
  renderButton: ((spec: DashboardButtonSpec) => React.ReactNode) | undefined;
}): React.ReactElement {
  switch (item.type) {
    case 'rule': {
      const { rule, result } = item.evaluated;
      const status = result.status as IssueStatus;
      return (
        <Box flexDirection="row">
          {gutter(active)}
          <Text color={statusColor(status)}>{statusIcon(status)} </Text>
          <Text color={statusColor(status)}>{severityLabel(status)} </Text>
          <Text>{rule.title(result)}</Text>
          {item.navigable && (
            <>
              <Text> </Text>
              {affordance(
                {
                  id: `dashboard.rule.${item.ruleId}`,
                  label: item.expanded ? '[hide]' : '[show]',
                  active,
                  remeasureKey: scroll,
                  onClick: () => {
                    onToggleRule(item.ruleId);
                  },
                },
                renderButton,
              )}
            </>
          )}
        </Box>
      );
    }
    case 'offender':
      return (
        <Box flexDirection="row" marginLeft={2}>
          {gutter(active)}
          {affordance(
            {
              id: `dashboard.offender.${item.ruleId}.${item.offender.kind}.${item.offender.namespace}.${item.offender.name}`,
              label: item.text,
              active,
              remeasureKey: scroll,
              onClick: () => {
                onNavigateOffender(item.offender);
              },
            },
            renderButton,
          )}
        </Box>
      );
    case 'more':
      return (
        <Box flexDirection="row" marginLeft={2}>
          {gutter(active)}
          <Text dimColor>… and {String(item.remaining)} more </Text>
          {affordance(
            {
              id: `dashboard.more.${item.ruleId}`,
              label: '[all]',
              active,
              remeasureKey: scroll,
              onClick: () => {
                onShowAllOffenders(item.ruleId);
              },
            },
            renderButton,
          )}
        </Box>
      );
    case 'passingToggle':
      return (
        <Box flexDirection="row">
          {gutter(active)}
          {!item.showPassing && (
            <Text dimColor>{String(item.count)} passing rules </Text>
          )}
          {affordance(
            {
              id: 'dashboard.passing',
              label: item.showPassing ? '[hide passing]' : '[show passing]',
              active,
              remeasureKey: scroll,
              onClick: onToggleShowPassing,
            },
            renderButton,
          )}
        </Box>
      );
    case 'passingRule': {
      const { rule, result } = item.evaluated;
      return (
        <Box flexDirection="row">
          {gutter(false)}
          <Text dimColor>✓ {rule.title(result)}</Text>
        </Box>
      );
    }
  }
}

function BestPracticesSection({
  rules,
  showPassing,
  expandedRuleIds,
  showAllRuleIds,
  cursor,
  focused,
  viewport,
  scroll,
  onToggleRule,
  onShowAllOffenders,
  onNavigateOffender,
  onToggleShowPassing,
  renderButton,
}: BestPracticesSectionProps): React.ReactElement {
  const issues = computeIssueCount(rules);
  const items = buildDashboardItems({
    rules,
    expandedRuleIds,
    showAllRuleIds,
    showPassing,
  });
  const start = Math.max(0, scroll);
  const end = start + Math.max(1, viewport);
  const windowed = items.slice(start, end);

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box flexDirection="row">
        <Text bold>BEST PRACTICES</Text>
        <Text>{'  '}</Text>
        {issues > 0 && <Text color="yellow">{String(issues)} issues</Text>}
      </Box>
      <Text dimColor>{'─'.repeat(65)}</Text>
      {start > 0 && <Text dimColor>{'  ⋯ more above'}</Text>}
      {windowed.map((item, i) => {
        const absoluteIndex = start + i;
        return (
          <DashboardRow
            key={absoluteIndex}
            item={item}
            active={focused && absoluteIndex === cursor}
            scroll={scroll}
            onToggleRule={onToggleRule}
            onShowAllOffenders={onShowAllOffenders}
            onNavigateOffender={onNavigateOffender}
            onToggleShowPassing={onToggleShowPassing}
            renderButton={renderButton}
          />
        );
      })}
      {end < items.length && <Text dimColor>{'  ⋯ more below'}</Text>}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// MetricsOverviewSection
// ---------------------------------------------------------------------------

interface MetricsOverviewSectionProps {
  metrics: MetricsOverviewData | null;
}

function MetricsOverviewSection({
  metrics,
}: MetricsOverviewSectionProps): React.ReactElement {
  if (metrics === null) {
    return <Box />;
  }

  const statusLabel = metrics.prometheusConnected
    ? 'Prometheus ● connected'
    : 'Prometheus ○ disconnected';

  // Sparklines render for any active metrics source: Prometheus history or
  // metrics-server session data (~-prefixed, Spec 06 §2.3 / review M8).
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box flexDirection="row">
        <Text bold>METRICS OVERVIEW</Text>
        <Text>{'             '}</Text>
        <Text dimColor>({statusLabel})</Text>
      </Box>
      <Text dimColor>{'─'.repeat(65)}</Text>
      <Box flexDirection="row" gap={4}>
        <Box flexDirection="row">
          <Text>CPU </Text>
          <Text color="green">{metrics.cpuSparkline}</Text>
          <Text> {String(metrics.cpuAvgPct)}% avg</Text>
        </Box>
        <Box flexDirection="row">
          <Text>Memory </Text>
          <Text color="green">{metrics.memSparkline}</Text>
          <Text> {String(metrics.memAvgPct)}% avg</Text>
        </Box>
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// KafkaSection
// ---------------------------------------------------------------------------

interface KafkaSectionProps {
  kafka: KafkaSectionData;
  onNavigateKafkaTopic: (topicName: string) => void;
}

function KafkaSection({
  kafka,
  onNavigateKafkaTopic: _onNavigateKafkaTopic,
}: KafkaSectionProps): React.ReactElement {
  if (!kafka.detected || kafka.deploymentType === 'none') {
    return <Box />;
  }

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold>KAFKA</Text>
      <Text dimColor>{'─'.repeat(65)}</Text>
      {!kafka.exporterAvailable ? (
        <Box flexDirection="column">
          <Text dimColor>
            Consumer lag metrics unavailable — Kafka Exporter is not deployed.
          </Text>
          {kafka.deploymentType === 'strimzi' ? (
            <Box flexDirection="column">
              <Text dimColor>Strimzi: add to your Kafka resource:</Text>
              <Text dimColor>{'  spec:'}</Text>
              <Text dimColor>{'    kafkaExporter: {}'}</Text>
            </Box>
          ) : (
            <Text dimColor>
              Bare Kafka: deploy kafka-exporter pointed at your brokers.
            </Text>
          )}
        </Box>
      ) : kafka.topics.length === 0 ? (
        <Text dimColor>No topics found</Text>
      ) : (
        kafka.topics.map((topic) => (
          <Box key={topic.name} flexDirection="row" gap={2}>
            <Text color={topic.maxLag > 0 ? 'yellow' : 'green'}>●</Text>
            <Text>{topic.name}</Text>
            {topic.maxLag > 0 ? (
              <Text color="yellow">
                {formatLag(topic.maxLag)} lag {trendArrow(topic.trend)}{' '}
                {topic.trend}
              </Text>
            ) : (
              <Text color="green">All consumer groups healthy</Text>
            )}
          </Box>
        ))
      )}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// HealthDashboard — main component
// ---------------------------------------------------------------------------

export function HealthDashboard({
  clusterName,
  summary,
  rules,
  showPassing,
  expandedRuleIds,
  showAllRuleIds,
  cursor,
  focused,
  bestPracticesViewport,
  bestPracticesScroll,
  metrics,
  kafka,
  onNavigateWarnings,
  onNavigateErrors,
  onToggleRule,
  onShowAllOffenders,
  onNavigateOffender,
  onToggleShowPassing,
  onNavigateKafkaTopic,
  renderButton,
}: HealthDashboardProps): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Box flexDirection="row" marginBottom={1}>
        <Text bold>{'══ Cluster Health — '}</Text>
        <Text bold color="cyan">
          {clusterName}
        </Text>
        <Text bold>{' ══'}</Text>
      </Box>

      <SummarySection
        summary={summary}
        onNavigateWarnings={onNavigateWarnings}
        onNavigateErrors={onNavigateErrors}
      />

      <BestPracticesSection
        rules={rules}
        showPassing={showPassing}
        expandedRuleIds={expandedRuleIds}
        showAllRuleIds={showAllRuleIds}
        cursor={cursor}
        focused={focused}
        viewport={bestPracticesViewport}
        scroll={bestPracticesScroll}
        onToggleRule={onToggleRule}
        onShowAllOffenders={onShowAllOffenders}
        onNavigateOffender={onNavigateOffender}
        onToggleShowPassing={onToggleShowPassing}
        renderButton={renderButton}
      />

      <MetricsOverviewSection metrics={metrics} />

      <KafkaSection kafka={kafka} onNavigateKafkaTopic={onNavigateKafkaTopic} />
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Helper: build RuleResult display text (used in tests)
// ---------------------------------------------------------------------------

export function ruleResultSummary(result: RuleResult): string {
  return `${result.status}:${String(result.affectedResources.length)}`;
}
