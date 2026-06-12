Feature: --no-agent mode
  As an operator who does not want the local LLM
  I want to launch Privateer with --no-agent
  So that the command bar is command-only and agent features are hidden

  Spec 07 §11.4: command bar shows command-only; AgentTab hidden; Space opens
  the command bar in command-only mode where the `!` prefix is implied/optional.

  # ---------------------------------------------------------------------------
  # Mode resolution from CLI flags
  # ---------------------------------------------------------------------------

  Scenario: --no-agent disables the agent
    Given the CLI flags "--no-agent"
    When I resolve the agent mode
    Then the resolved agent mode is disabled

  Scenario: no flags keeps the agent enabled
    Given the CLI flags ""
    When I resolve the agent mode
    Then the resolved agent mode is enabled

  Scenario: unrelated flags keep the agent enabled
    Given the CLI flags "--namespace default"
    When I resolve the agent mode
    Then the resolved agent mode is enabled

  # ---------------------------------------------------------------------------
  # AgentTab visibility
  # ---------------------------------------------------------------------------

  Scenario: AgentTab is hidden when the agent is disabled
    Given the agent mode is disabled
    Then the AgentTab is hidden in no-agent mode

  Scenario: AgentTab is shown when the agent is enabled
    Given the agent mode is enabled
    Then the AgentTab is visible in no-agent mode

  # ---------------------------------------------------------------------------
  # Command bar mode + hint
  # ---------------------------------------------------------------------------

  Scenario: command bar is command-only when the agent is disabled
    Given the agent mode is disabled
    Then the command bar is command-only

  Scenario: command bar accepts agent prompts when the agent is enabled
    Given the agent mode is enabled
    Then the command bar is not command-only

  Scenario: the command-bar hint omits the agent prompt in no-agent mode
    Given the agent mode is disabled
    Then the no-agent command-bar hint is "·  !command"

  # ---------------------------------------------------------------------------
  # Space opens command-only input; `!` prefix optional
  # ---------------------------------------------------------------------------

  Scenario: Space opens a command-only input in no-agent mode
    Given the agent mode is disabled
    When Space is pressed to open the command bar in no-agent mode
    Then the opened command-bar mode is "command"

  Scenario: bare input is treated as command in no-agent mode
    Given the agent mode is disabled
    When the no-agent input "scale deploy/api 3" is normalized
    Then the normalized command is "scale deploy/api 3"

  Scenario: explicit bang prefix is stripped in no-agent mode
    Given the agent mode is disabled
    When the no-agent input "!scale deploy/api 3" is normalized
    Then the normalized command is "scale deploy/api 3"

  Scenario: blank input normalizes to empty in no-agent mode
    Given the agent mode is disabled
    When the no-agent input "   " is normalized
    Then the normalized command is ""
