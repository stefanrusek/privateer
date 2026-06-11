Feature: Health rule catalog — representative rules across categories
  As a Privateer user
  I want the health engine to evaluate best-practice rules against my cluster state
  So that I can identify and fix configuration issues

  # ---------------------------------------------------------------------------
  # OBS-002: Pod has no readiness probe
  # ---------------------------------------------------------------------------

  Scenario: OBS-002 fires when a pod has no readiness probe
    Given a health rule evaluation environment
    And a Pod "api" in namespace "default" with no readiness probe
    When health rule "OBS-002" is evaluated
    Then the health rule result status is "warn"
    And the affected resource name is "api"

  Scenario: OBS-002 is ok when a pod has a readiness probe
    Given a health rule evaluation environment
    And a Pod "api" in namespace "default" with a readiness probe
    When health rule "OBS-002" is evaluated
    Then the health rule result status is "ok"

  Scenario: OBS-002 respects suppression annotation
    Given a health rule evaluation environment
    And a Pod "api" in namespace "default" suppressing rule "OBS-002" with no readiness probe
    When health rule "OBS-002" is evaluated
    Then the health rule result status is "ok"

  # ---------------------------------------------------------------------------
  # OBS-003: Pod has no startup probe
  # ---------------------------------------------------------------------------

  Scenario: OBS-003 fires when a pod has no startup probe
    Given a health rule evaluation environment
    And a Pod "worker" in namespace "default" with no startup probe
    When health rule "OBS-003" is evaluated
    Then the health rule result status is "warn"

  # ---------------------------------------------------------------------------
  # OBS-010: No Prometheus found in cluster
  # ---------------------------------------------------------------------------

  Scenario: OBS-010 fires when no metrics capabilities are present
    Given a health rule evaluation environment
    And no exporter capabilities are enabled
    When health rule "OBS-010" is evaluated
    Then the health rule result status is "warn"

  Scenario: OBS-010 is ok when kafkaExporter capability is present
    Given a health rule evaluation environment
    And the kafkaExporter capability is enabled
    When health rule "OBS-010" is evaluated
    Then the health rule result status is "ok"

  # ---------------------------------------------------------------------------
  # OBS-011: No ServiceMonitors defined (Prometheus present but nothing monitored)
  # ---------------------------------------------------------------------------

  Scenario: OBS-011 is skipped when Prometheus is not present
    Given a health rule evaluation environment
    And no exporter capabilities are enabled
    When health rule "OBS-011" is evaluated
    Then the health rule result status is "skipped"

  Scenario: OBS-011 fires when Prometheus is present but no ServiceMonitors exist
    Given a health rule evaluation environment
    And the kafkaExporter capability is enabled
    When health rule "OBS-011" is evaluated
    Then the health rule result status is "warn"

  Scenario: OBS-011 is ok when ServiceMonitors are defined
    Given a health rule evaluation environment
    And the kafkaExporter capability is enabled
    And a ServiceMonitor "app-monitor" in namespace "monitoring" exists
    When health rule "OBS-011" is evaluated
    Then the health rule result status is "ok"

  # ---------------------------------------------------------------------------
  # OBS-012: Pod has no prometheus.io/scrape annotation
  # ---------------------------------------------------------------------------

  Scenario: OBS-012 fires when a pod has no scrape annotation
    Given a health rule evaluation environment
    And a Pod "api" in namespace "default" with no scrape annotation
    When health rule "OBS-012" is evaluated
    Then the health rule result status is "warn"

  Scenario: OBS-012 is ok when a pod has prometheus.io/scrape=true
    Given a health rule evaluation environment
    And a Pod "api" in namespace "default" with scrape annotation "true"
    When health rule "OBS-012" is evaluated
    Then the health rule result status is "ok"

  # ---------------------------------------------------------------------------
  # REL-003: StatefulSet has only 1 replica
  # ---------------------------------------------------------------------------

  Scenario: REL-003 fires when a StatefulSet has 1 replica
    Given a health rule evaluation environment
    And a StatefulSet "db" in namespace "default" with 1 replica
    When health rule "REL-003" is evaluated
    Then the health rule result status is "warn"
    And the affected resource name is "db"

  Scenario: REL-003 is ok when a StatefulSet has 3 replicas
    Given a health rule evaluation environment
    And a StatefulSet "db" in namespace "default" with 3 replicas
    When health rule "REL-003" is evaluated
    Then the health rule result status is "ok"

  # ---------------------------------------------------------------------------
  # REL-004: CronJob has no concurrencyPolicy
  # ---------------------------------------------------------------------------

  Scenario: REL-004 fires when a CronJob has no concurrencyPolicy
    Given a health rule evaluation environment
    And a CronJob "backup" in namespace "default" with no concurrencyPolicy
    When health rule "REL-004" is evaluated
    Then the health rule result status is "warn"

  Scenario: REL-004 is ok when a CronJob has concurrencyPolicy set to Forbid
    Given a health rule evaluation environment
    And a CronJob "backup" in namespace "default" with concurrencyPolicy "Forbid"
    When health rule "REL-004" is evaluated
    Then the health rule result status is "ok"

  # ---------------------------------------------------------------------------
  # STO-002: PVC uses default StorageClass
  # ---------------------------------------------------------------------------

  Scenario: STO-002 fires when a PVC has no storageClassName
    Given a health rule evaluation environment
    And a PVC "data" in namespace "default" with no storageClassName
    When health rule "STO-002" is evaluated
    Then the health rule result status is "warn"

  Scenario: STO-002 is ok when a PVC has an explicit storageClassName
    Given a health rule evaluation environment
    And a PVC "data" in namespace "default" with storageClassName "fast-ssd"
    When health rule "STO-002" is evaluated
    Then the health rule result status is "ok"

  # ---------------------------------------------------------------------------
  # STO-003: PV reclaim policy Delete with no backup annotation
  # ---------------------------------------------------------------------------

  Scenario: STO-003 fires when a PV has Delete reclaim policy and no backup annotation
    Given a health rule evaluation environment
    And a PV "pv-1" with reclaimPolicy "Delete" and no backup annotation
    When health rule "STO-003" is evaluated
    Then the health rule result status is "warn"

  Scenario: STO-003 is ok when a PV has Delete policy with velero backup annotation
    Given a health rule evaluation environment
    And a PV "pv-1" with reclaimPolicy "Delete" and velero backup annotation
    When health rule "STO-003" is evaluated
    Then the health rule result status is "ok"

  Scenario: STO-003 is ok when a PV has Retain reclaim policy
    Given a health rule evaluation environment
    And a PV "pv-1" with reclaimPolicy "Retain" and no backup annotation
    When health rule "STO-003" is evaluated
    Then the health rule result status is "ok"

  # ---------------------------------------------------------------------------
  # SEC-005: Opaque Secret with no managing operator (suppressed when no operator)
  # ---------------------------------------------------------------------------

  Scenario: SEC-005 is suppressed when no secrets operator is detected
    Given a health rule evaluation environment
    And no secrets operator capability is enabled
    And an Opaque Secret "my-secret" in namespace "default"
    When health rule "SEC-005" is evaluated
    Then the health rule result status is "suppressed"

  Scenario: SEC-005 fires when secrets operator is present and secret is unmanaged
    Given a health rule evaluation environment
    And the secretsOperator capability is enabled
    And an Opaque Secret "my-secret" in namespace "default"
    When health rule "SEC-005" is evaluated
    Then the health rule result status is "error"

  # ---------------------------------------------------------------------------
  # Suppression annotation — cross-rule boundary test
  # ---------------------------------------------------------------------------

  Scenario: Suppression annotation on StatefulSet prevents REL-003 from flagging it
    Given a health rule evaluation environment
    And a StatefulSet "db" in namespace "default" with 1 replica suppressing "REL-003"
    When health rule "REL-003" is evaluated
    Then the health rule result status is "ok"
