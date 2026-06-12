@exec
Feature: Exec suspend-and-handover (Spec 05 §4.2–4.3)

  # ---------------------------------------------------------------------------
  # Command-input history
  # ---------------------------------------------------------------------------

  Scenario: Default command is /bin/bash when history is empty
    Given an empty exec history
    When I request the exec command with empty input
    Then the resolved command is "/bin/bash"

  Scenario: Non-empty input overrides the default
    Given an empty exec history
    When I request the exec command with input "/bin/sh"
    Then the resolved command is "/bin/sh"

  Scenario: Up arrow cycles through persisted history
    Given an exec history containing "python3" then "/bin/sh"
    When I press up in the command input
    Then the visible command input is "/bin/sh"
    When I press up in the command input
    Then the visible command input is "python3"

  Scenario: Down arrow returns toward the current edit buffer
    Given an exec history containing "python3" then "/bin/sh"
    When I press up in the command input
    And I press up in the command input
    And I press down in the command input
    Then the visible command input is "/bin/sh"

  Scenario: History is capped at 10 entries
    Given an exec history with 11 entries ending with "cmd11"
    When I press up in the command input
    Then the visible command input is "cmd11"
    And the history length is 10

  Scenario: Submitting a command persists it to exec-history file
    Given an empty exec history
    When I submit the exec command "/bin/sh"
    Then the exec-history file contains "/bin/sh"

  Scenario: Duplicate consecutive command is not appended twice
    Given an exec history containing "python3" then "/bin/sh"
    When I submit the exec command "/bin/sh"
    Then the exec-history file line count is 2

  # ---------------------------------------------------------------------------
  # Container selection
  # ---------------------------------------------------------------------------

  Scenario: Single running container is auto-selected
    Given a pod with one running container "api"
    When I request container selection for exec
    Then the selected container is "api"
    And no picker is shown

  Scenario: Multiple containers require a picker
    Given a pod with containers "api" running and "sidecar" running
    When I request container selection for exec
    Then a container picker is shown with options "api" and "sidecar"

  Scenario: Default selection in picker is the first running container
    Given a pod with containers "api" running and "sidecar" waiting
    When I request container selection for exec
    Then the picker default selection is "api"

  Scenario: Picker includes terminated containers as unselectable entries
    Given a pod with containers "api" running and "old" terminated
    When I request container selection for exec
    Then the picker shows "old" as terminated

  # ---------------------------------------------------------------------------
  # Suspend-and-handover orchestrator
  # ---------------------------------------------------------------------------

  Scenario: Starting a session suspends the TTY
    Given a fake TTY and a fake exec session
    When I start an exec handover for container "api" with command "/bin/bash"
    Then the TTY is suspended

  Scenario: Input from TTY is forwarded to the session
    Given a fake TTY and a fake exec session
    When I start an exec handover for container "api" with command "/bin/bash"
    And the TTY emits input "hello"
    Then the session received data "hello"

  Scenario: Output from session is written to the TTY
    Given a fake TTY and a fake exec session
    When I start an exec handover for container "api" with command "/bin/bash"
    And the session emits output "world"
    Then the TTY output contains "world"

  Scenario: Resize events are forwarded to the session
    Given a fake TTY and a fake exec session
    When I start an exec handover for container "api" with command "/bin/bash"
    And the TTY resizes to 120 columns and 40 rows
    Then the session received a resize to 120 columns and 40 rows

  Scenario: Clean shell exit resumes the TTY
    Given a fake TTY and a fake exec session
    When I start an exec handover for container "api" with command "/bin/bash"
    And the session closes cleanly
    Then the TTY is resumed

  Scenario: Connection drop prints a notice and resumes the TTY
    Given a fake TTY and a fake exec session
    When I start an exec handover for container "api" with command "/bin/bash"
    And the session drops with error "connection reset"
    Then the TTY output contains "connection reset"
    And the TTY is resumed
