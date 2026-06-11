Feature: Sparkline rendering for resource list columns
  As a Privateer user
  I want sparklines in list view columns
  So that I can see resource usage trends at a glance

  # ---------------------------------------------------------------------------
  # §3.1 Basic sparkline shape from metric series
  # ---------------------------------------------------------------------------

  Scenario: Empty series produces all low-block sparkline
    Given a sparkline series with points "[0, 0, 0, 0, 0, 0, 0, 0, 0, 0]"
    When the sparkline is rendered with max 100
    Then the sparkline string is "▁▁▁▁▁▁▁▁▁▁"

  Scenario: No data series renders grey sparkline
    Given a sparkline series with no data points
    When the sparkline is rendered with max 100
    Then the sparkline color is "grey"

  # ---------------------------------------------------------------------------
  # §3.1 Color thresholds
  # ---------------------------------------------------------------------------

  Scenario: Below 70% threshold renders green
    Given a sparkline series with points "[60, 60, 60, 60, 60, 60, 60, 60, 60, 60]"
    When the sparkline is rendered with max 100
    Then the sparkline color is "green"

  Scenario: At 70% threshold renders yellow
    Given a sparkline series with points "[70, 70, 70, 70, 70, 70, 70, 70, 70, 70]"
    When the sparkline is rendered with max 100
    Then the sparkline color is "yellow"

  Scenario: Above 90% threshold renders red
    Given a sparkline series with points "[95, 95, 95, 95, 95, 95, 95, 95, 95, 95]"
    When the sparkline is rendered with max 100
    Then the sparkline color is "red"

  # ---------------------------------------------------------------------------
  # §2.3 Session data sparklines carry ~ prefix
  # ---------------------------------------------------------------------------

  Scenario: Session data sparkline carries tilde prefix
    Given a sparkline series with points "[50, 50, 50, 50, 50, 50, 50, 50, 50, 50]"
    When the session sparkline is rendered with max 100
    Then the sparkline string starts with "~"

  # ---------------------------------------------------------------------------
  # §3.2 Per-resource-type sparkline columns
  # ---------------------------------------------------------------------------

  Scenario: Pod resource type produces CPU and Memory sparkline columns
    Given a pod sparkline resource with cpu usage 40 and memory usage 60
    When the sparkline columns are computed for resource type "Pod"
    Then the sparkline columns include "CPU" and "Memory"

  Scenario: Node resource type produces CPU and Memory sparkline columns
    Given a node sparkline resource with cpu usage 30 and memory usage 70
    When the sparkline columns are computed for resource type "Node"
    Then the sparkline columns include "CPU" and "Memory"

  Scenario: Deployment resource type produces aggregate CPU and Memory sparkline columns
    Given a deployment sparkline resource with aggregate cpu 50 and memory 55
    When the sparkline columns are computed for resource type "Deployment"
    Then the sparkline columns include "CPU" and "Memory"

  Scenario: StatefulSet resource type produces aggregate CPU and Memory sparkline columns
    Given a statefulset sparkline resource with aggregate cpu 45 and memory 65
    When the sparkline columns are computed for resource type "StatefulSet"
    Then the sparkline columns include "CPU" and "Memory"

  Scenario: KafkaTopic resource type produces consumer lag column
    Given a kafkatopic sparkline resource with lag 1000
    When the sparkline columns are computed for resource type "KafkaTopic"
    Then the sparkline columns include "Lag"

  Scenario: Kafka resource type produces under-replicated partitions column
    Given a kafka sparkline resource with under-replicated partitions 2
    When the sparkline columns are computed for resource type "Kafka"
    Then the sparkline columns include "UnderReplicated"
