Feature: Context switching
  As an operator
  I want to switch Kubernetes contexts at runtime
  So that I can manage multiple clusters without restarting

  Scenario: List available contexts
    Given a context model with contexts "prod,staging,dev" and current "prod"
    Then the available contexts are "prod,staging,dev"
    And the current context is "prod"

  Scenario: Switch context emits reinit signal
    Given a context model with contexts "prod,staging,dev" and current "prod"
    When I switch to context "staging"
    Then the current context is "staging"
    And a reinit signal was emitted

  Scenario: Switch to current context is a no-op
    Given a context model with contexts "prod,staging" and current "prod"
    When I switch to context "prod"
    Then no reinit signal was emitted

  Scenario: Switch to unknown context returns an error
    Given a context model with contexts "prod,staging" and current "prod"
    When I attempt to switch to context "unknown"
    Then the switch fails with error "unknown context: unknown"
    And the current context is still "prod"
