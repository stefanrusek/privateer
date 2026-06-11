Feature: LogsTab — pod log streaming, container selection, and download
  As a Privateer user
  I want to stream a pod's logs with controls and search
  So that I can diagnose running and crashed workloads

  Scenario: Single running container opens logs directly
    Given a pod "order-api-7d9f" with a running container "order-api"
    When I open logs for the pod
    Then the log picker auto-opens the single container
    And the selected log container is "order-api"

  Scenario: Multiple containers default to the running one
    Given a pod "order-api-7d9f" with a running container "order-api"
    And the pod has a terminated container "config-reloader"
    When I open logs for the pod
    Then the log picker does not auto-open
    And the default log container is "order-api"

  Scenario: All-terminated pod offers a picker with no default
    Given a pod "order-api-7d9f" with a terminated container "order-api"
    And the pod has a terminated container "sidecar"
    When I open logs for the pod
    Then the log picker has no default selection

  Scenario: Init containers appear after regular containers
    Given a pod "order-api-7d9f" with a running container "order-api"
    And the pod has an init container "init-db"
    When I open logs for the pod
    Then the log option at index 1 is labeled "init-db (init)"

  Scenario: A previous instance is offered when the container has restarted
    Given a pod "order-api-7d9f" with a running container "order-api" that restarted 2 times
    When I open logs for the pod
    Then the selected log container offers a previous instance

  Scenario: Streamed lines are colorized by level
    Given an open LogsTab for pod "order-api-7d9f" container "order-api"
    When the stream delivers the log line "ERROR payment failed"
    And the stream delivers the log line "WARN slow query"
    And the stream delivers the log line "INFO ready"
    Then the logs frame contains "ERROR payment failed"
    And the logs frame contains "WARN slow query"
    And the logs frame contains "INFO ready"

  Scenario: The buffer caps at its capacity, dropping the oldest lines
    Given an open LogsTab for pod "order-api-7d9f" container "order-api"
    And the log buffer capacity is 3
    When the stream delivers the log lines "line-aaa,line-bbb,line-ccc,line-ddd,line-eee"
    Then the logs frame contains "line-eee"
    And the logs frame does not contain "line-aaa"

  Scenario: Pausing shows the resume live tail affordance
    Given an open LogsTab for pod "order-api-7d9f" container "order-api"
    When I pause the live tail with new lines waiting
    Then the logs frame contains "[Resume live tail ↓]"
    And the logs frame contains "[○ Paused]"

  Scenario: Searching highlights and counts matches
    Given an open LogsTab for pod "order-api-7d9f" container "order-api"
    When the stream delivers the log lines "first retry,second retry,done"
    And I search the logs for "retry"
    Then the logs frame contains "1/2"

  Scenario: Changing the line limit restarts the stream from the new offset
    Given an open LogsTab for pod "order-api-7d9f" container "order-api"
    When I choose the line-limit option "since-1h"
    Then the most recent log stream was opened with since seconds 3600

  Scenario: Download writes the buffer to the Downloads folder with confirmation
    Given an open LogsTab for pod "order-api-7d9f" container "order-api"
    When the stream delivers the log lines "line one,line two"
    And I download the logs
    Then a log file is saved under "Downloads/p9r-logs-order-api-7d9f-order-api"
    And the logs frame contains "✓ Saved"
