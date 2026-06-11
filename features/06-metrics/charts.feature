Feature: Time-series chart and range selector
  As a Privateer user
  I want full ASCII time-series charts in the MetricsTab
  So that I can diagnose resource usage trends over time

  # ---------------------------------------------------------------------------
  # §4.1 Range selector model
  # ---------------------------------------------------------------------------

  Scenario: Default range is 1h
    Given a fresh range selector model
    When I read the selected range
    Then the selected range label is "1h"

  Scenario: Range can be set to 20m
    Given a fresh range selector model
    When I select chart range "20m"
    Then the selected range label is "20m"

  Scenario: Range can be set to 4h
    Given a fresh range selector model
    When I select chart range "4h"
    Then the selected range label is "4h"

  Scenario: Range can be set to 1d
    Given a fresh range selector model
    When I select chart range "1d"
    Then the selected range label is "1d"

  Scenario: Range can be set to 2d
    Given a fresh range selector model
    When I select chart range "2d"
    Then the selected range label is "2d"

  Scenario: All five range options are available
    Given a fresh range selector model
    When I list all chart range options
    Then the chart range options are "20m,1h,4h,1d,2d"

  # ---------------------------------------------------------------------------
  # §4.2 Timeseries chart auto Y-scale
  # ---------------------------------------------------------------------------

  Scenario: Timeseries chart produces 8 rows of output
    Given a timeseries chart with one series of values "[10, 20, 30, 40, 50, 60]"
    When the chart is rendered at width 60
    Then the chart has exactly 8 data rows

  Scenario: Timeseries chart Y-axis has 4 to 5 ticks
    Given a timeseries chart with one series of values "[0, 50, 100]"
    When the chart is rendered at width 60
    Then the chart Y-axis has between 4 and 5 ticks

  Scenario: Timeseries chart renders X time labels
    Given a timeseries chart with a clock set to epoch 1749600000000
    And a series of 6 points spaced 10 minutes apart
    When the chart is rendered at width 60
    Then the chart output contains a time label line

  Scenario: Timeseries chart with all-zero data still renders 8 rows
    Given a timeseries chart with one series of values "[0, 0, 0, 0, 0, 0]"
    When the chart is rendered at width 60
    Then the chart has exactly 8 data rows

  # ---------------------------------------------------------------------------
  # §4.4 Kafka lag chart trend indicators
  # ---------------------------------------------------------------------------

  Scenario: Climbing lag series produces upward trend indicator
    Given a kafka lag series trending upward with values "[100, 200, 300, 400, 500]"
    When the trend indicator is computed
    Then the trend indicator is "↑"

  Scenario: Dropping lag series produces downward trend indicator
    Given a kafka lag series trending downward with values "[500, 400, 300, 200, 100]"
    When the trend indicator is computed
    Then the trend indicator is "↓"

  Scenario: Stable lag series produces stable trend indicator
    Given a kafka lag series that is stable with values "[200, 200, 200, 201, 199]"
    When the trend indicator is computed
    Then the trend indicator is "→"

  # ---------------------------------------------------------------------------
  # §4.5 MetricsTab no-metrics state
  # ---------------------------------------------------------------------------

  Scenario: MetricsTab shows no-metrics message when tier is none
    Given a MetricsTab with metrics tier "none"
    When the MetricsTab is rendered
    Then the rendered output contains "No metrics available"

  Scenario: MetricsTab shows session data banner for metrics-server tier
    Given a MetricsTab with metrics tier "metrics-server"
    When the MetricsTab is rendered
    Then the rendered output contains "Prometheus not found"

  Scenario: MetricsTab hides charts for missing cadvisor exporter
    Given a MetricsTab with metrics tier "prometheus"
    And the cadvisor exporter capability is disabled
    When the MetricsTab is rendered
    Then the rendered output contains "cAdvisor"

  Scenario: MetricsTab shows charts when cadvisor exporter is enabled
    Given a MetricsTab with metrics tier "prometheus"
    And the cadvisor exporter capability is enabled
    When the MetricsTab is rendered
    Then the rendered output contains "CPU"

  Scenario: MetricsTab range selector is shown
    Given a MetricsTab with metrics tier "prometheus"
    And the cadvisor exporter capability is enabled
    When the MetricsTab is rendered
    Then the rendered output contains "20m"
    And the rendered output contains "1h"
