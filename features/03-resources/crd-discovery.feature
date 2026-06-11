Feature: CRD discovery and sidebar grouping
  As the Privateer sidebar
  I want CRDs grouped by API group
  So that the sidebar tree matches the spec

  Scenario: CRDs are grouped by API group
    Given the following CRD definitions
      | group                 | kind           | plural          | namespaced |
      | kafka.strimzi.io      | Kafka          | kafkas          | true       |
      | kafka.strimzi.io      | KafkaTopic     | kafkatopics     | true       |
      | doppler.com           | DopplerSecret  | dopplersecrets  | true       |
      | monitoring.coreos.com | PrometheusRule | prometheusrules | true       |
    Then the sidebar group "kafka.strimzi.io" contains kinds "Kafka,KafkaTopic"
    And the sidebar group "doppler.com" contains kinds "DopplerSecret"
    And the sidebar group "monitoring.coreos.com" contains kinds "PrometheusRule"

  Scenario: Empty CRD list produces no groups
    Given no CRD definitions exist
    Then there are no sidebar groups

  Scenario: CRDs within a group are sorted by kind name
    Given the following CRD definitions
      | group            | kind       | plural      | namespaced |
      | kafka.strimzi.io | KafkaTopic | kafkatopics | true       |
      | kafka.strimzi.io | Kafka      | kafkas      | true       |
    Then the sidebar group "kafka.strimzi.io" has kinds in order "Kafka,KafkaTopic"
