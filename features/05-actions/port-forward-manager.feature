Feature: Port-Forward Manager overlay
  As a Privateer user
  I want to see and manage active kubectl port-forwards
  So that I can track connections and stop them when needed

  # ---------------------------------------------------------------------------
  # Manager overlay rendering
  # ---------------------------------------------------------------------------

  Scenario: Manager shows title border
    Given a PortForwardManager with no forwards
    Then the manager frame contains "Port Forwards"

  Scenario: Manager shows New Forward and Close buttons
    Given a PortForwardManager with no forwards
    Then the manager frame contains "+ New Forward"
    And the manager frame contains "Close"

  Scenario: Manager shows active forward with green indicator
    Given a PortForwardManager with a healthy forward from "order-api" port 8080 to local 8080
    Then the manager frame contains "●"
    And the manager frame contains "order-api"
    And the manager frame contains "8080"

  Scenario: Manager shows starting forward with indicator
    Given a PortForwardManager with a starting forward from "order-api" port 8080 to local 8080
    Then the manager frame contains "●"
    And the manager frame contains "order-api"

  Scenario: Manager shows failed forward with retry button
    Given a PortForwardManager with a failed forward from "order-api" port 8080 to local 8080
    Then the manager frame contains "✕"
    And the manager frame contains "order-api"
    And the manager frame contains "retry"

  Scenario: Manager shows stop button for active forward
    Given a PortForwardManager with a healthy forward from "order-api" port 8080 to local 8080
    Then the manager frame contains "✕"

  Scenario: Manager shows recents section with restore
    Given a PortForwardManager with a recent forward from "old-pod" port 5432 to local 5432
    Then the manager frame contains "RECENT"
    And the manager frame contains "old-pod"
    And the manager frame contains "Restore"

  Scenario: Manager shows multiple active forwards
    Given a PortForwardManager with 2 healthy forwards
    Then the manager frame contains "8080"
    And the manager frame contains "9090"

  # ---------------------------------------------------------------------------
  # Status bar indicator
  # ---------------------------------------------------------------------------

  Scenario: Status bar shows forward count indicator
    Given a forward count indicator with 2 active forwards
    Then the indicator frame contains "⇄ 2"

  Scenario: Status bar shows no indicator when zero forwards
    Given a forward count indicator with 0 active forwards
    Then the indicator frame does not contain "⇄"
