Feature: Prometheus source discovery cascade
  As a Privateer user
  I want metrics discovery to find the best available Prometheus source
  So that I get the richest metrics experience automatically

  # ---------------------------------------------------------------------------
  # Tier 1 — config override wins immediately
  # ---------------------------------------------------------------------------

  Scenario: Config override resolves with prometheus tier
    Given a metrics discovery environment with config URL "http://config-prometheus:9090"
    When discovery runs
    Then the resolved metrics tier is "prometheus"
    And the resolved metrics source URL is "http://config-prometheus:9090"
    And the discovery source label is "config"

  # ---------------------------------------------------------------------------
  # Tier 2 — PROMETHEUS_URL env var
  # ---------------------------------------------------------------------------

  Scenario: PROMETHEUS_URL env var resolves when no config override
    Given a metrics discovery environment with env URL "http://env-prometheus:9090"
    When discovery runs
    Then the resolved metrics tier is "prometheus"
    And the resolved metrics source URL is "http://env-prometheus:9090"
    And the discovery source label is "env"

  Scenario: Config override takes priority over env var
    Given a metrics discovery environment with config URL "http://config-prometheus:9090"
    And the env URL is "http://env-prometheus:9090"
    When discovery runs
    Then the resolved metrics source URL is "http://config-prometheus:9090"
    And the discovery source label is "config"

  # ---------------------------------------------------------------------------
  # Tier 3 — ServiceMonitor CRD scan
  # ---------------------------------------------------------------------------

  Scenario: ServiceMonitor CRD scan resolves when no config or env
    Given a metrics discovery environment with no config or env URL
    And a ServiceMonitor exists pointing to "http://sm-prometheus:9090"
    When discovery runs
    Then the resolved metrics tier is "prometheus"
    And the resolved metrics source URL is "http://sm-prometheus:9090"
    And the discovery source label is "servicemonitor"

  Scenario: ServiceMonitor scan skipped when forbidden
    Given a metrics discovery environment with no config or env URL
    And the kube client forbids ServiceMonitor access
    And the standard namespace probes all fail
    And the pod annotation scan finds no pods
    When discovery runs
    Then the resolved metrics tier is "metrics-server"

  # ---------------------------------------------------------------------------
  # Tier 4 — standard namespace probe
  # ---------------------------------------------------------------------------

  Scenario: Standard namespace probe resolves prometheus-operated
    Given a metrics discovery environment with no config or env URL
    And no ServiceMonitors exist
    And the standard probe for "http://prometheus-operated.monitoring:9090" succeeds
    When discovery runs
    Then the resolved metrics tier is "prometheus"
    And the resolved metrics source URL is "http://prometheus-operated.monitoring:9090"
    And the discovery source label is "namespace-probe"

  Scenario: Standard namespace probe resolves prometheus.monitoring
    Given a metrics discovery environment with no config or env URL
    And no ServiceMonitors exist
    And the standard probe for "http://prometheus.monitoring:9090" succeeds
    When discovery runs
    Then the resolved metrics tier is "prometheus"
    And the resolved metrics source URL is "http://prometheus.monitoring:9090"
    And the discovery source label is "namespace-probe"

  Scenario: Standard namespace probe resolves prometheus-server.monitoring
    Given a metrics discovery environment with no config or env URL
    And no ServiceMonitors exist
    And the standard probe for "http://prometheus-server.monitoring:9090" succeeds
    When discovery runs
    Then the resolved metrics tier is "prometheus"
    And the resolved metrics source URL is "http://prometheus-server.monitoring:9090"
    And the discovery source label is "namespace-probe"

  Scenario: Standard namespace probe tries all three in order
    Given a metrics discovery environment with no config or env URL
    And no ServiceMonitors exist
    And no standard namespace probes succeed
    And the pod annotation scan finds no pods
    When discovery runs
    Then the resolved metrics tier is "metrics-server"

  # ---------------------------------------------------------------------------
  # Tier 5 — pod annotation scan
  # ---------------------------------------------------------------------------

  Scenario: Pod annotation scan resolves when standard probes fail
    Given a metrics discovery environment with no config or env URL
    And no ServiceMonitors exist
    And no standard namespace probes succeed
    And a scraped pod exists at "http://pod-metrics:8080/metrics"
    When discovery runs
    Then the resolved metrics tier is "prometheus"
    And the resolved metrics source URL is "http://pod-metrics:8080/metrics"
    And the discovery source label is "pod-annotation"

  # ---------------------------------------------------------------------------
  # Tier 6 — metrics-server fallback
  # ---------------------------------------------------------------------------

  Scenario: Falls back to metrics-server when nothing found
    Given a metrics discovery environment with no config or env URL
    And no ServiceMonitors exist
    And no standard namespace probes succeed
    And the pod annotation scan finds no pods
    When discovery runs
    Then the resolved metrics tier is "metrics-server"

  Scenario: Resolves none when metrics-server also unavailable
    Given a metrics discovery environment with no config or env URL
    And no ServiceMonitors exist
    And no standard namespace probes succeed
    And the pod annotation scan finds no pods
    And metrics-server is unavailable
    When discovery runs
    Then the resolved metrics tier is "none"

  # ---------------------------------------------------------------------------
  # Re-run on context switch
  # ---------------------------------------------------------------------------

  Scenario: Discovery re-runs and updates tier after context switch
    Given a metrics discovery environment with no config or env URL
    And no ServiceMonitors exist
    And no standard namespace probes succeed
    And the pod annotation scan finds no pods
    When discovery runs
    Then the resolved metrics tier is "metrics-server"
    When a ServiceMonitor is added pointing to "http://new-prometheus:9090"
    And discovery runs again
    Then the resolved metrics tier is "prometheus"
    And the resolved metrics source URL is "http://new-prometheus:9090"
