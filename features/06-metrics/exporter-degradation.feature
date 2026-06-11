Feature: Exporter capability detection and degradation
  As a Privateer user
  I want Privateer to detect which metric exporters are present
  So that charts degrade gracefully when exporters are absent

  # ---------------------------------------------------------------------------
  # cAdvisor detection
  # ---------------------------------------------------------------------------

  Scenario: cAdvisor detected when container_cpu_usage_seconds_total present
    Given a metrics exporter probe environment
    And the metric family "container_cpu_usage_seconds_total" is present
    When exporter detection runs
    Then the capability "cadvisor" is enabled

  Scenario: cAdvisor not detected when probe metric absent
    Given a metrics exporter probe environment
    And no metric families are present
    When exporter detection runs
    Then the capability "cadvisor" is disabled

  # ---------------------------------------------------------------------------
  # kube-state-metrics detection
  # ---------------------------------------------------------------------------

  Scenario: kube-state-metrics detected when probe metric present
    Given a metrics exporter probe environment
    And the metric family "kube_pod_container_status_restarts_total" is present
    When exporter detection runs
    Then the capability "kube-state-metrics" is enabled

  Scenario: kube-state-metrics not detected when probe metric absent
    Given a metrics exporter probe environment
    And no metric families are present
    When exporter detection runs
    Then the capability "kube-state-metrics" is disabled

  # ---------------------------------------------------------------------------
  # Kafka Exporter detection
  # ---------------------------------------------------------------------------

  Scenario: Kafka Exporter detected when kafka_consumergroup_lag present
    Given a metrics exporter probe environment
    And the metric family "kafka_consumergroup_lag" is present
    When exporter detection runs
    Then the capability "kafka-exporter" is enabled

  Scenario: Kafka Exporter not detected when probe metric absent
    Given a metrics exporter probe environment
    And no metric families are present
    When exporter detection runs
    Then the capability "kafka-exporter" is disabled

  # ---------------------------------------------------------------------------
  # Strimzi JMX detection
  # ---------------------------------------------------------------------------

  Scenario: Strimzi JMX detected when under-replicated metric present
    Given a metrics exporter probe environment
    And the metric family "kafka_server_replicamanager_underreplicatedpartitions" is present
    When exporter detection runs
    Then the capability "strimzi-jmx" is enabled

  Scenario: Strimzi JMX not detected when probe metric absent
    Given a metrics exporter probe environment
    And no metric families are present
    When exporter detection runs
    Then the capability "strimzi-jmx" is disabled

  # ---------------------------------------------------------------------------
  # Mixed — multiple exporters
  # ---------------------------------------------------------------------------

  Scenario: Multiple exporters detected independently
    Given a metrics exporter probe environment
    And the metric family "container_cpu_usage_seconds_total" is present
    And the metric family "kube_pod_container_status_restarts_total" is present
    When exporter detection runs
    Then the capability "cadvisor" is enabled
    And the capability "kube-state-metrics" is enabled
    And the capability "kafka-exporter" is disabled
    And the capability "strimzi-jmx" is disabled

  # ---------------------------------------------------------------------------
  # MetricsSource unreachable — all capabilities disabled
  # ---------------------------------------------------------------------------

  Scenario: All capabilities disabled when metrics source unreachable
    Given a metrics exporter probe environment
    And the metrics source is unreachable
    When exporter detection runs
    Then the capability "cadvisor" is disabled
    And the capability "kube-state-metrics" is disabled
    And the capability "kafka-exporter" is disabled
    And the capability "strimzi-jmx" is disabled
