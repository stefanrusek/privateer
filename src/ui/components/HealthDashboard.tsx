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
  EvaluatedRule,
  RuleResult,
  RuleStatus,
} from '../../health/types.js';

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

export interface HealthDashboardProps {
  clusterName: string;
  summary: ClusterSummary;
  rules: EvaluatedRule[];
  /** Whether the OK rules section is expanded. */
  showPassing: boolean;
  metrics: MetricsOverviewData | null;
  kafka: KafkaSectionData;

  // Interaction callbacks
  onNavigateWarnings: () => void;
  onNavigateErrors: () => void;
  onShowRule: (ruleId: string) => void;
  onToggleShowPassing: () => void;
  onNavigateKafkaTopic: (topicName: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Visible status icons for each rule status. */
type NonSkippableStatus = Exclude<RuleStatus, 'skipped'>;

function statusIcon(status: NonSkippableStatus): string {
  switch (status) {
    case 'error':
      return '✕';
    case 'warn':
      return '⚠';
    case 'ok':
      return '✓';
    case 'suppressed':
      return '○';
  }
}

type InkColor = 'red' | 'yellow' | 'green' | 'grey' | 'cyan' | 'white';

function statusColor(status: NonSkippableStatus): InkColor {
  switch (status) {
    case 'error':
      return 'red';
    case 'warn':
      return 'yellow';
    case 'ok':
      return 'green';
    case 'suppressed':
      return 'grey';
  }
}

function severityLabel(status: NonSkippableStatus): string {
  switch (status) {
    case 'error':
      return 'ERROR';
    case 'warn':
      return 'WARN ';
    case 'ok':
      return 'OK   ';
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
    </Box>
  );
}

// ---------------------------------------------------------------------------
// BestPracticesSection
// ---------------------------------------------------------------------------

interface BestPracticesSectionProps {
  rules: EvaluatedRule[];
  showPassing: boolean;
  onShowRule: (ruleId: string) => void;
  onToggleShowPassing: () => void;
}

function RuleRow({
  evaluated,
  onShowRule: _onShowRule,
}: {
  evaluated: EvaluatedRule;
  onShowRule: (ruleId: string) => void;
}): React.ReactElement {
  const { rule, result } = evaluated;
  // Rules with 'skipped' status are filtered out before display; cast is safe.
  const displayStatus = result.status as NonSkippableStatus;
  const icon = statusIcon(displayStatus);
  const color = statusColor(displayStatus);
  const label = severityLabel(displayStatus);
  const title = rule.title(result);
  const showable = result.status === 'error' || result.status === 'warn';

  return (
    <Box flexDirection="row">
      <Text color={color}>{icon} </Text>
      <Text color={color}>{label} </Text>
      <Text>{title}</Text>
      {showable && (
        <>
          <Text> </Text>
          <Text color="cyan" underline>
            [show]
          </Text>
        </>
      )}
    </Box>
  );
}

function BestPracticesSection({
  rules,
  showPassing,
  onShowRule,
  onToggleShowPassing: _onToggleShowPassing,
}: BestPracticesSectionProps): React.ReactElement {
  const issueCount = rules.filter(
    (e) => e.result.status === 'error' || e.result.status === 'warn',
  ).length;

  const nonOkRules = rules.filter(
    (e) =>
      e.result.status === 'error' ||
      e.result.status === 'warn' ||
      e.result.status === 'suppressed',
  );
  const okRules = rules.filter((e) => e.result.status === 'ok');

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box flexDirection="row">
        <Text bold>BEST PRACTICES</Text>
        <Text>{'  '}</Text>
        {issueCount > 0 && (
          <Text color="yellow">{String(issueCount)} issues</Text>
        )}
      </Box>
      <Text dimColor>{'─'.repeat(65)}</Text>
      {nonOkRules.map((e) => (
        <RuleRow key={e.rule.id} evaluated={e} onShowRule={onShowRule} />
      ))}
      {okRules.length > 0 &&
        (showPassing ? (
          <>
            {okRules.map((e) => (
              <RuleRow key={e.rule.id} evaluated={e} onShowRule={onShowRule} />
            ))}
            <Box>
              <Text color="cyan" underline>
                [hide passing]
              </Text>
            </Box>
          </>
        ) : (
          <Box flexDirection="row">
            <Text dimColor>{String(okRules.length)} passing rules </Text>
            <Text color="cyan" underline>
              [show passing]
            </Text>
          </Box>
        ))}
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
  metrics,
  kafka,
  onNavigateWarnings,
  onNavigateErrors,
  onShowRule,
  onToggleShowPassing,
  onNavigateKafkaTopic,
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
        onShowRule={onShowRule}
        onToggleShowPassing={onToggleShowPassing}
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
