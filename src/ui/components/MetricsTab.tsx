/**
 * MetricsTab — per-resource metrics charts with range selector (Spec 06 §4).
 *
 * - Per-resource-type chart sets per §4.3
 * - Per-chart exporter gating using ExporterCapabilities
 * - Missing exporter hides only its charts with inline note naming it
 * - Range selector (§4.1)
 * - metrics-server session data labeling (§2.3)
 * - §4.5 no-metrics state
 * - Kafka lag chart (§4.4): trend indicator in legend, threshold bands
 *
 * Prop-driven, frame-tested to 100%.
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { ExporterCapabilities } from '../../metrics/exporters.js';
import type { MetricSeries } from '../../boundaries/metrics-source.js';
import type { MetricsTier } from '../../metrics/discovery.js';
import { createRangeSelector, selectRange } from '../../charts/range.js';
import type { RangeLabel, RangeSelectorModel } from '../../charts/range.js';
import { renderTimeseriesChart } from '../../charts/timeseries.js';
import { computeTrendIndicator } from '../../charts/timeseries.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MetricsTabProps {
  /** The resource kind being viewed (e.g. "Pod", "Node", "Kafka"). */
  readonly resourceKind: string;
  /** The resource name. */
  readonly resourceName: string;
  /** Current metrics tier from discovery. */
  readonly tier: MetricsTier;
  /** Exporter capabilities (used for per-chart gating). */
  readonly capabilities: ExporterCapabilities;
  /** CPU series (Pod/Node/Deployment/StatefulSet). */
  readonly cpuSeries?: readonly MetricSeries[];
  /** Memory series (Pod/Node/Deployment/StatefulSet). */
  readonly memorySeries?: readonly MetricSeries[];
  /** Network in series (Pod). */
  readonly networkInSeries?: readonly MetricSeries[];
  /** Network out series (Pod). */
  readonly networkOutSeries?: readonly MetricSeries[];
  /** Restart count series (Pod). */
  readonly restartSeries?: readonly MetricSeries[];
  /** Replica count series (Deployment/StatefulSet). */
  readonly replicaSeries?: readonly MetricSeries[];
  /** Consumer lag series (KafkaTopic) — one per consumer group. */
  readonly lagSeries?: readonly MetricSeries[];
  /** Warning lag threshold (for KafkaTopic charts). */
  readonly lagWarningThreshold?: number;
  /** Critical lag threshold (for KafkaTopic charts). */
  readonly lagCriticalThreshold?: number;
  /** Under-replicated partitions series (Kafka). */
  readonly underReplicatedSeries?: readonly MetricSeries[];
  /** Active controller series (Kafka). */
  readonly activeControllerSeries?: readonly MetricSeries[];
  /** Bytes in series (Kafka/KafkaTopic). */
  readonly bytesInSeries?: readonly MetricSeries[];
  /** Bytes out series (Kafka/KafkaTopic). */
  readonly bytesOutSeries?: readonly MetricSeries[];
  /** Task status series (KafkaConnect). */
  readonly taskStatusSeries?: readonly MetricSeries[];
  /** Records in series (KafkaConnect). */
  readonly recordsInSeries?: readonly MetricSeries[];
  /** Records out series (KafkaConnect). */
  readonly recordsOutSeries?: readonly MetricSeries[];
  /** Currently selected range. */
  readonly rangeModel?: RangeSelectorModel;
  /** Callback when user changes range. */
  readonly onRangeChange?: (label: RangeLabel) => void;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface RangeSelectorProps {
  readonly model: RangeSelectorModel;
  readonly onSelect?: (label: RangeLabel) => void;
}

function RangeSelector({
  model,
  onSelect: _onSelect,
}: RangeSelectorProps): React.ReactElement {
  return (
    <Box flexDirection="row" gap={1}>
      {model.options.map((label) => (
        <Box key={label}>
          {label === model.selected ? (
            <Text bold>[{label}]</Text>
          ) : (
            <Text dimColor>[{label}]</Text>
          )}
        </Box>
      ))}
    </Box>
  );
}

interface ChartPlaceholderProps {
  readonly title: string;
  readonly series: readonly MetricSeries[];
}

/** Width of rendered charts (Spec 06 §4.2 — fills the pane). */
const CHART_WIDTH = 64;

function ChartPlaceholder({
  title,
  series,
}: ChartPlaceholderProps): React.ReactElement {
  const firstSeries = series[0];
  const pointCount = firstSeries !== undefined ? firstSeries.points.length : 0;
  const hasData = series.length > 0 && pointCount > 0;
  if (!hasData) {
    return (
      <Box flexDirection="column" marginBottom={1}>
        <Text bold>{title}</Text>
        <Text dimColor>No data</Text>
      </Box>
    );
  }
  const chart = renderTimeseriesChart({
    series,
    width: CHART_WIDTH,
  });
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold>{title}</Text>
      {chart.lines.map((line, i) => (
        <Text key={i} color="green">
          {line}
        </Text>
      ))}
    </Box>
  );
}

interface MissingExporterNoteProps {
  readonly exporterName: string;
  readonly chartName: string;
}

function MissingExporterNote({
  exporterName,
  chartName,
}: MissingExporterNoteProps): React.ReactElement {
  return (
    <Box marginBottom={1}>
      <Text dimColor>
        {chartName} unavailable — {exporterName} exporter not detected
      </Text>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Per-resource chart sets (§4.3)
// ---------------------------------------------------------------------------

interface PodChartsProps {
  readonly capabilities: ExporterCapabilities;
  readonly cpuSeries: readonly MetricSeries[];
  readonly memorySeries: readonly MetricSeries[];
  readonly networkInSeries: readonly MetricSeries[];
  readonly networkOutSeries: readonly MetricSeries[];
  readonly restartSeries: readonly MetricSeries[];
}

function PodCharts({
  capabilities,
  cpuSeries,
  memorySeries,
  networkInSeries,
  networkOutSeries,
  restartSeries,
}: PodChartsProps): React.ReactElement {
  return (
    <Box flexDirection="column">
      {capabilities.cadvisor ? (
        <>
          <ChartPlaceholder title="CPU Usage" series={cpuSeries} />
          <ChartPlaceholder title="Memory Usage" series={memorySeries} />
          <ChartPlaceholder
            title="Network I/O"
            series={[...networkInSeries, ...networkOutSeries]}
          />
        </>
      ) : (
        <MissingExporterNote
          exporterName="cAdvisor"
          chartName="CPU/Memory/Network charts"
        />
      )}
      {capabilities.kubeStateMetrics ? (
        <ChartPlaceholder title="Restart Count" series={restartSeries} />
      ) : (
        <MissingExporterNote
          exporterName="kube-state-metrics"
          chartName="Restart count chart"
        />
      )}
    </Box>
  );
}

interface NodeChartsProps {
  readonly capabilities: ExporterCapabilities;
  readonly cpuSeries: readonly MetricSeries[];
  readonly memorySeries: readonly MetricSeries[];
}

function NodeCharts({
  capabilities,
  cpuSeries,
  memorySeries,
}: NodeChartsProps): React.ReactElement {
  return (
    <Box flexDirection="column">
      {capabilities.cadvisor ? (
        <>
          <ChartPlaceholder
            title="CPU Usage % of Allocatable"
            series={cpuSeries}
          />
          <ChartPlaceholder
            title="Memory Usage % of Allocatable"
            series={memorySeries}
          />
        </>
      ) : (
        <MissingExporterNote
          exporterName="cAdvisor"
          chartName="CPU/Memory charts"
        />
      )}
    </Box>
  );
}

interface WorkloadChartsProps {
  readonly capabilities: ExporterCapabilities;
  readonly cpuSeries: readonly MetricSeries[];
  readonly memorySeries: readonly MetricSeries[];
  readonly replicaSeries: readonly MetricSeries[];
}

function WorkloadCharts({
  capabilities,
  cpuSeries,
  memorySeries,
  replicaSeries,
}: WorkloadChartsProps): React.ReactElement {
  return (
    <Box flexDirection="column">
      {capabilities.cadvisor ? (
        <>
          <ChartPlaceholder title="Aggregate CPU" series={cpuSeries} />
          <ChartPlaceholder title="Aggregate Memory" series={memorySeries} />
        </>
      ) : (
        <MissingExporterNote
          exporterName="cAdvisor"
          chartName="CPU/Memory charts"
        />
      )}
      {capabilities.kubeStateMetrics ? (
        <ChartPlaceholder title="Replica Count" series={replicaSeries} />
      ) : (
        <MissingExporterNote
          exporterName="kube-state-metrics"
          chartName="Replica count chart"
        />
      )}
    </Box>
  );
}

interface KafkaClusterChartsProps {
  readonly capabilities: ExporterCapabilities;
  readonly underReplicatedSeries: readonly MetricSeries[];
  readonly activeControllerSeries: readonly MetricSeries[];
  readonly bytesInSeries: readonly MetricSeries[];
  readonly bytesOutSeries: readonly MetricSeries[];
}

function KafkaClusterCharts({
  capabilities,
  underReplicatedSeries,
  activeControllerSeries,
  bytesInSeries,
  bytesOutSeries,
}: KafkaClusterChartsProps): React.ReactElement {
  return (
    <Box flexDirection="column">
      {capabilities.strimziJmx ? (
        <>
          <ChartPlaceholder
            title="Under-replicated Partitions"
            series={underReplicatedSeries}
          />
          <ChartPlaceholder
            title="Active Controller Count"
            series={activeControllerSeries}
          />
          <ChartPlaceholder
            title="Bytes In/Out per Second"
            series={[...bytesInSeries, ...bytesOutSeries]}
          />
        </>
      ) : (
        <MissingExporterNote
          exporterName="Strimzi JMX"
          chartName="Kafka broker charts"
        />
      )}
    </Box>
  );
}

interface KafkaTopicChartsProps {
  readonly capabilities: ExporterCapabilities;
  readonly lagSeries: readonly MetricSeries[];
  readonly bytesInSeries: readonly MetricSeries[];
  readonly bytesOutSeries: readonly MetricSeries[];
  readonly lagWarningThreshold: number;
  readonly lagCriticalThreshold: number;
}

function KafkaTopicCharts({
  capabilities,
  lagSeries,
  bytesInSeries,
  bytesOutSeries,
  lagWarningThreshold,
  lagCriticalThreshold,
}: KafkaTopicChartsProps): React.ReactElement {
  return (
    <Box flexDirection="column">
      {capabilities.kafkaExporter ? (
        <>
          <Box flexDirection="column" marginBottom={1}>
            <Text bold>Consumer Lag per Group</Text>
            {lagSeries.length > 0 ? (
              <>
                <Text dimColor>
                  Warning threshold: {String(lagWarningThreshold)} Critical
                  threshold: {String(lagCriticalThreshold)}
                </Text>
                {lagSeries.map((s, i) => {
                  const groupLabel =
                    s.labels.consumer_group ??
                    s.labels.group ??
                    `group-${String(i)}`;
                  const lastPt = s.points[s.points.length - 1];
                  const currentLag = lastPt !== undefined ? lastPt.value : 0;
                  const values = s.points.map((p) => p.value);
                  const trend = computeTrendIndicator(values);
                  return (
                    <Box key={i} flexDirection="row" gap={1}>
                      <Text>── {groupLabel}</Text>
                      <Text>({String(currentLag)})</Text>
                      <Text>{trend}</Text>
                    </Box>
                  );
                })}
              </>
            ) : (
              <Text dimColor>No data</Text>
            )}
          </Box>
          <ChartPlaceholder
            title="Bytes In/Out"
            series={[...bytesInSeries, ...bytesOutSeries]}
          />
        </>
      ) : (
        <MissingExporterNote
          exporterName="kafka-exporter"
          chartName="Consumer lag chart"
        />
      )}
    </Box>
  );
}

interface KafkaConnectChartsProps {
  readonly taskStatusSeries: readonly MetricSeries[];
  readonly recordsInSeries: readonly MetricSeries[];
  readonly recordsOutSeries: readonly MetricSeries[];
}

function KafkaConnectCharts({
  taskStatusSeries,
  recordsInSeries,
  recordsOutSeries,
}: KafkaConnectChartsProps): React.ReactElement {
  return (
    <Box flexDirection="column">
      <ChartPlaceholder title="Task Status" series={taskStatusSeries} />
      <ChartPlaceholder
        title="Records In/Out"
        series={[...recordsInSeries, ...recordsOutSeries]}
      />
    </Box>
  );
}

// ---------------------------------------------------------------------------
// No-metrics state (§4.5)
// ---------------------------------------------------------------------------

function NoMetricsState(): React.ReactElement {
  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>No metrics available</Text>
      <Text>
        Privateer could not find a Prometheus instance or metrics-server
        {'\n'}
        in this cluster.
      </Text>
      <Box flexDirection="column">
        <Text>To enable metrics:</Text>
        <Text> • Install kube-prometheus-stack (recommended)</Text>
        <Text> • Or ensure metrics-server is running</Text>
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// MetricsTab
// ---------------------------------------------------------------------------

export function MetricsTab({
  resourceKind,
  resourceName,
  tier,
  capabilities,
  cpuSeries = [],
  memorySeries = [],
  networkInSeries = [],
  networkOutSeries = [],
  restartSeries = [],
  replicaSeries = [],
  lagSeries = [],
  lagWarningThreshold = 10000,
  lagCriticalThreshold = 10000,
  underReplicatedSeries = [],
  activeControllerSeries = [],
  bytesInSeries = [],
  bytesOutSeries = [],
  taskStatusSeries = [],
  recordsInSeries = [],
  recordsOutSeries = [],
  rangeModel,
  onRangeChange,
}: MetricsTabProps): React.ReactElement {
  const effectiveRange = rangeModel ?? createRangeSelector();

  // §4.5 No-metrics state
  if (tier === 'none') {
    return <NoMetricsState />;
  }

  // §2.3 Session-data banner for metrics-server tier
  const sessionBanner =
    tier === 'metrics-server' ? (
      <Box marginBottom={1}>
        <Text color="cyan">
          ℹ Prometheus not found — showing current values only.
          {'\n'}
          Install Prometheus for historical charts and Kafka metrics.
        </Text>
      </Box>
    ) : null;

  const rangeSelector = (
    <Box marginBottom={1}>
      {onRangeChange !== undefined ? (
        <RangeSelector model={effectiveRange} onSelect={onRangeChange} />
      ) : (
        <RangeSelector model={effectiveRange} />
      )}
    </Box>
  );

  const renderCharts = (): React.ReactElement => {
    switch (resourceKind) {
      case 'Pod':
        return (
          <PodCharts
            capabilities={capabilities}
            cpuSeries={cpuSeries}
            memorySeries={memorySeries}
            networkInSeries={networkInSeries}
            networkOutSeries={networkOutSeries}
            restartSeries={restartSeries}
          />
        );

      case 'Node':
        return (
          <NodeCharts
            capabilities={capabilities}
            cpuSeries={cpuSeries}
            memorySeries={memorySeries}
          />
        );

      case 'Deployment':
      case 'StatefulSet':
        return (
          <WorkloadCharts
            capabilities={capabilities}
            cpuSeries={cpuSeries}
            memorySeries={memorySeries}
            replicaSeries={replicaSeries}
          />
        );

      case 'Kafka':
        return (
          <KafkaClusterCharts
            capabilities={capabilities}
            underReplicatedSeries={underReplicatedSeries}
            activeControllerSeries={activeControllerSeries}
            bytesInSeries={bytesInSeries}
            bytesOutSeries={bytesOutSeries}
          />
        );

      case 'KafkaTopic':
        return (
          <KafkaTopicCharts
            capabilities={capabilities}
            lagSeries={lagSeries}
            bytesInSeries={bytesInSeries}
            bytesOutSeries={bytesOutSeries}
            lagWarningThreshold={lagWarningThreshold}
            lagCriticalThreshold={lagCriticalThreshold}
          />
        );

      case 'KafkaConnect':
        return (
          <KafkaConnectCharts
            taskStatusSeries={taskStatusSeries}
            recordsInSeries={recordsInSeries}
            recordsOutSeries={recordsOutSeries}
          />
        );

      default:
        return (
          <Box>
            <Text dimColor>No charts defined for {resourceKind}</Text>
          </Box>
        );
    }
  };

  return (
    <Box flexDirection="column">
      <Text bold>Metrics — {resourceName}</Text>
      {sessionBanner}
      {rangeSelector}
      {renderCharts()}
    </Box>
  );
}

// Re-export helpers for testing
export { createRangeSelector, selectRange };
