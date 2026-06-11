Feature: Kafka detection and KFK-013 lag metrics empty state
  As a Privateer user
  I want the health engine to detect Kafka and report missing lag metrics
  So that I know when consumer lag monitoring is unavailable

  # ---------------------------------------------------------------------------
  # KFK-013: Kafka detected but no lag metrics exported
  # ---------------------------------------------------------------------------

  Scenario: KFK-013 is skipped when no Kafka is detected
    Given a health rule evaluation environment
    And no Kafka is present in the cluster
    When health rule "KFK-013" is evaluated
    Then the health rule result status is "skipped"

  Scenario: KFK-013 fires when Strimzi Kafka is detected but no kafkaExporter
    Given a health rule evaluation environment
    And Strimzi Kafka is present via CRD
    And the kafkaExporter capability is not enabled
    When health rule "KFK-013" is evaluated
    Then the health rule result status is "warn"

  Scenario: KFK-013 fires when bare Kafka is detected but no kafkaExporter
    Given a health rule evaluation environment
    And bare Kafka is present via pod labels
    And the kafkaExporter capability is not enabled
    When health rule "KFK-013" is evaluated
    Then the health rule result status is "warn"

  Scenario: KFK-013 is ok when Strimzi Kafka is detected with kafkaExporter
    Given a health rule evaluation environment
    And Strimzi Kafka is present via CRD
    And the kafkaExporter capability is enabled
    When health rule "KFK-013" is evaluated
    Then the health rule result status is "ok"

  Scenario: KFK-013 is ok when bare Kafka is detected with kafkaExporter
    Given a health rule evaluation environment
    And bare Kafka is present via pod labels
    And the kafkaExporter capability is enabled
    When health rule "KFK-013" is evaluated
    Then the health rule result status is "ok"

  # ---------------------------------------------------------------------------
  # KFK-013 empty state: detail message verifies §2.2.1 actionable guidance
  # ---------------------------------------------------------------------------

  Scenario: KFK-013 detail describes missing Kafka Exporter when no exporter
    Given a health rule evaluation environment
    And Strimzi Kafka is present via CRD
    And the kafkaExporter capability is not enabled
    When health rule "KFK-013" is evaluated
    Then the health rule result detail mentions "Kafka Exporter"

  # ---------------------------------------------------------------------------
  # Kafka detection applicability: Strimzi-only rules skip on bare Kafka
  # ---------------------------------------------------------------------------

  Scenario: KFK-003 is skipped for bare Kafka (Strimzi-only rule)
    Given a health rule evaluation environment
    And bare Kafka is present via pod labels
    When health rule "KFK-003" is evaluated
    Then the health rule result status is "skipped"

  Scenario: KFK-003 applies when Strimzi is present
    Given a health rule evaluation environment
    And Strimzi Kafka is present via CRD
    And the strimziPresent capability is enabled
    When health rule "KFK-003" is evaluated
    Then the health rule result status is "ok"

  # ---------------------------------------------------------------------------
  # KFK-007: Broker count inspection works for both Strimzi and bare
  # ---------------------------------------------------------------------------

  Scenario: KFK-007 fires for bare Kafka with 1 broker pod
    Given a health rule evaluation environment
    And bare Kafka is present via pod labels
    When health rule "KFK-007" is evaluated
    Then the health rule result status is "warn"

  Scenario: KFK-007 is skipped when no Kafka is detected
    Given a health rule evaluation environment
    And no Kafka is present in the cluster
    When health rule "KFK-007" is evaluated
    Then the health rule result status is "skipped"
