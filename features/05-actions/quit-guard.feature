Feature: Quit guard — inline confirmation when port-forwards are active
  As a Privateer user
  I want to be warned before quitting with active port-forwards
  So that I do not accidentally close active connections

  # ---------------------------------------------------------------------------
  # QuitGuard component rendering
  # ---------------------------------------------------------------------------

  Scenario: Quit guard shows count and buttons
    Given a QuitGuardPrompt with 2 active forwards
    Then the quit guard frame contains "2 port-forwards active"
    And the quit guard frame contains "Quit"
    And the quit guard frame contains "Cancel"

  Scenario: Quit guard uses singular for one forward
    Given a QuitGuardPrompt with 1 active forward
    Then the quit guard frame contains "1 port-forward active"

  Scenario: Quit guard shows cancel as default (listed second)
    Given a QuitGuardPrompt with 2 active forwards
    Then the quit guard frame shows "Quit" before "Cancel"
