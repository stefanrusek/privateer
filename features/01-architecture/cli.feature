Feature: Command-line interface
  As an operator
  I want p9r's one-shot subcommands and flags to behave predictably
  So that scripting and shell integration work

  Scenario: version prints the build version
    When I run p9r with arguments "version"
    Then the output contains "p9r 0.3.0"

  Scenario: help prints usage
    When I run p9r with arguments "help"
    Then the output contains "Usage"

  Scenario: completion emits a shell script
    When I run p9r with arguments "completion bash"
    Then the output contains "complete -F _p9r p9r"

  Scenario: an unknown flag reports an error and usage
    When I run p9r with arguments "--bogus"
    Then the output contains "unknown argument"
    And the output contains "Usage"
