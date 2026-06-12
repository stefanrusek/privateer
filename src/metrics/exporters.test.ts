/**
 * Unit tests for exporter capability detection (Spec 06 §2.2.1).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { detectExporterCapabilities } from './exporters.js';
import { FakeMetricsSource } from '../boundaries/metrics-source.fake.js';

describe('detectExporterCapabilities', () => {
  let source: FakeMetricsSource;

  beforeEach(() => {
    source = new FakeMetricsSource();
  });

  it('all capabilities disabled when no metrics present', async () => {
    const caps = await detectExporterCapabilities(source);
    expect(caps.cadvisor).toBe(false);
    expect(caps.kubeStateMetrics).toBe(false);
    expect(caps.kafkaExporter).toBe(false);
    expect(caps.strimziJmx).toBe(false);
  });

  it('cadvisor enabled when container_cpu_usage_seconds_total present', async () => {
    source.setKnownSeries('container_cpu_usage_seconds_total');
    const caps = await detectExporterCapabilities(source);
    expect(caps.cadvisor).toBe(true);
    expect(caps.kubeStateMetrics).toBe(false);
    expect(caps.kafkaExporter).toBe(false);
    expect(caps.strimziJmx).toBe(false);
  });

  it('kube-state-metrics enabled when kube_pod_container_status_restarts_total present', async () => {
    source.setKnownSeries('kube_pod_container_status_restarts_total');
    const caps = await detectExporterCapabilities(source);
    expect(caps.cadvisor).toBe(false);
    expect(caps.kubeStateMetrics).toBe(true);
    expect(caps.kafkaExporter).toBe(false);
    expect(caps.strimziJmx).toBe(false);
  });

  it('kafka-exporter enabled when kafka_consumergroup_lag present', async () => {
    source.setKnownSeries('kafka_consumergroup_lag');
    const caps = await detectExporterCapabilities(source);
    expect(caps.cadvisor).toBe(false);
    expect(caps.kubeStateMetrics).toBe(false);
    expect(caps.kafkaExporter).toBe(true);
    expect(caps.strimziJmx).toBe(false);
  });

  it('strimzi-jmx enabled when kafka_server_replicamanager_underreplicatedpartitions present', async () => {
    source.setKnownSeries(
      'kafka_server_replicamanager_underreplicatedpartitions',
    );
    const caps = await detectExporterCapabilities(source);
    expect(caps.cadvisor).toBe(false);
    expect(caps.kubeStateMetrics).toBe(false);
    expect(caps.kafkaExporter).toBe(false);
    expect(caps.strimziJmx).toBe(true);
  });

  it('multiple exporters detected independently', async () => {
    source.setKnownSeries(
      'container_cpu_usage_seconds_total',
      'kube_pod_container_status_restarts_total',
    );
    const caps = await detectExporterCapabilities(source);
    expect(caps.cadvisor).toBe(true);
    expect(caps.kubeStateMetrics).toBe(true);
    expect(caps.kafkaExporter).toBe(false);
    expect(caps.strimziJmx).toBe(false);
  });

  it('all capabilities enabled when all probe metrics present', async () => {
    source.setKnownSeries(
      'container_cpu_usage_seconds_total',
      'kube_pod_container_status_restarts_total',
      'kafka_consumergroup_lag',
      'kafka_server_replicamanager_underreplicatedpartitions',
    );
    const caps = await detectExporterCapabilities(source);
    expect(caps.cadvisor).toBe(true);
    expect(caps.kubeStateMetrics).toBe(true);
    expect(caps.kafkaExporter).toBe(true);
    expect(caps.strimziJmx).toBe(true);
  });

  it('all capabilities disabled when source is unreachable', async () => {
    source.setKnownSeries(
      'container_cpu_usage_seconds_total',
      'kube_pod_container_status_restarts_total',
      'kafka_consumergroup_lag',
      'kafka_server_replicamanager_underreplicatedpartitions',
    );
    source.setReachable(false);
    const caps = await detectExporterCapabilities(source);
    expect(caps.cadvisor).toBe(false);
    expect(caps.kubeStateMetrics).toBe(false);
    expect(caps.kafkaExporter).toBe(false);
    expect(caps.strimziJmx).toBe(false);
  });
});
