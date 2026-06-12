/**
 * Exporter capability detection via MetricsSource.probeSeries (Spec 06 §2.2.1).
 *
 * Probes four metric families — one per exporter — to determine which charts
 * are available. Each chart degrades individually: a missing exporter hides
 * only its own charts.
 *
 * Boundaries consumed:
 *   - MetricsSource — probeSeries per metric family
 */
import type { MetricsSource } from '../boundaries/metrics-source.js';

/** Capability set gating individual chart groups (Spec 06 §2.2.1). */
export interface ExporterCapabilities {
  /** cAdvisor (kubelet-embedded) — CPU & memory charts and sparklines. */
  readonly cadvisor: boolean;
  /** kube-state-metrics — restart-over-time and replica-count charts. */
  readonly kubeStateMetrics: boolean;
  /** Kafka Exporter — consumer lag charts (opt-in even with Strimzi). */
  readonly kafkaExporter: boolean;
  /** Strimzi/Kafka JMX metrics — broker health charts, KFK-006. */
  readonly strimziJmx: boolean;
}

/** Probe metrics per exporter (Spec 06 §2.2.1). */
const EXPORTER_PROBES = {
  cadvisor: 'container_cpu_usage_seconds_total',
  kubeStateMetrics: 'kube_pod_container_status_restarts_total',
  kafkaExporter: 'kafka_consumergroup_lag',
  strimziJmx: 'kafka_server_replicamanager_underreplicatedpartitions',
} as const satisfies Record<keyof ExporterCapabilities, string>;

/**
 * Probe each metric family and return the capability set.
 * Capabilities default to false on any error from the MetricsSource.
 */
export async function detectExporterCapabilities(
  source: MetricsSource,
): Promise<ExporterCapabilities> {
  const [cadvisor, kubeStateMetrics, kafkaExporter, strimziJmx] =
    await Promise.all([
      probeCapability(source, EXPORTER_PROBES.cadvisor),
      probeCapability(source, EXPORTER_PROBES.kubeStateMetrics),
      probeCapability(source, EXPORTER_PROBES.kafkaExporter),
      probeCapability(source, EXPORTER_PROBES.strimziJmx),
    ]);

  return { cadvisor, kubeStateMetrics, kafkaExporter, strimziJmx };
}

async function probeCapability(
  source: MetricsSource,
  metricName: string,
): Promise<boolean> {
  const result = await source.probeSeries(metricName);
  if (!result.ok) {
    return false;
  }
  return result.value;
}
