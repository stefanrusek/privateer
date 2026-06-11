Feature: Command bar input parsing
  As a user of Privateer
  I want to use ! commands and natural language in the command bar
  So that I can navigate and control the TUI efficiently

  Background:
    Given the command parser is initialized

  # ---------------------------------------------------------------------------
  # ! commands
  # ---------------------------------------------------------------------------

  Scenario: "!ctx" opens context switcher
    When I parse command "!ctx"
    Then the command action is "ctx"

  Scenario: "!ns default" switches namespace
    When I parse command "!ns default"
    Then the command action is "ns" with argument "default"

  Scenario: "!ns kube-system" switches namespace
    When I parse command "!ns kube-system"
    Then the command action is "ns" with argument "kube-system"

  Scenario: "!q" quits
    When I parse command "!q"
    Then the command action is "quit"

  Scenario: "!quit" quits
    When I parse command "!quit"
    Then the command action is "quit"

  Scenario: "!pods" navigates to Pod
    When I parse command "!pods"
    Then the command action produces navigate to "Pod"

  Scenario: "!deploy" navigates to Deployment via alias
    When I parse command "!deploy"
    Then the command action produces navigate to "Deployment"

  Scenario: "!svc" navigates to Service via alias
    When I parse command "!svc"
    Then the command action produces navigate to "Service"

  Scenario: "!sts" navigates to StatefulSet via alias
    When I parse command "!sts"
    Then the command action produces navigate to "StatefulSet"

  Scenario: "!ds" navigates to DaemonSet via alias
    When I parse command "!ds"
    Then the command action produces navigate to "DaemonSet"

  Scenario: "!cm" navigates to ConfigMap via alias
    When I parse command "!cm"
    Then the command action produces navigate to "ConfigMap"

  Scenario: "!pvc" navigates to PersistentVolumeClaim via alias
    When I parse command "!pvc"
    Then the command action produces navigate to "PersistentVolumeClaim"

  Scenario: "!ing" navigates to Ingress via alias
    When I parse command "!ing"
    Then the command action produces navigate to "Ingress"

  Scenario: "!topics" navigates to KafkaTopic via alias
    When I parse command "!topics"
    Then the command action produces navigate to "KafkaTopic"

  Scenario: "!nodes" navigates to Node
    When I parse command "!nodes"
    Then the command action produces navigate to "Node"

  Scenario: "!secrets" navigates to Secret
    When I parse command "!secrets"
    Then the command action produces navigate to "Secret"

  # Case-insensitive resource commands
  Scenario: "!PODS" (uppercase) navigates to Pod
    When I parse command "!PODS"
    Then the command action produces navigate to "Pod"

  Scenario: "!Deploy" (mixed case) navigates to Deployment
    When I parse command "!Deploy"
    Then the command action produces navigate to "Deployment"

  # Unknown command
  Scenario: "!unknown" returns unknown command
    When I parse command "!unknown"
    Then the command action is unknown

  # Not a ! command (no prefix)
  Scenario: "pods" without ! is not a command
    When I parse command "pods"
    Then the command is not a bang command

  Scenario: Empty string is not a command
    When I parse command ""
    Then the command is not a bang command

  # ---------------------------------------------------------------------------
  # Action executor — navigate
  # ---------------------------------------------------------------------------

  Scenario: Execute navigate action changes resource kind
    Given the executor starts with kind "Pod" namespace "" search ""
    When I execute navigate to "Deployment"
    Then the executor result has kind "Deployment" namespace "" search ""

  Scenario: Execute navigate action clears search
    Given the executor starts with kind "Pod" namespace "default" search "order"
    When I execute navigate to "Service"
    Then the executor result has kind "Service" namespace "default" search ""

  # ---------------------------------------------------------------------------
  # Action executor — filter
  # ---------------------------------------------------------------------------

  Scenario: Execute filter action updates namespace
    Given the executor starts with kind "Pod" namespace "" search ""
    When I execute filter namespace "default" search ""
    Then the executor result has kind "Pod" namespace "default" search ""

  Scenario: Execute filter action updates search
    Given the executor starts with kind "Pod" namespace "default" search ""
    When I execute filter namespace "" search "order"
    Then the executor result has kind "Pod" namespace "default" search "order"

  Scenario: Execute filter with both namespace and search
    Given the executor starts with kind "Pod" namespace "" search ""
    When I execute filter namespace "staging" search "api"
    Then the executor result has kind "Pod" namespace "staging" search "api"

  Scenario: Execute filter with no fields leaves state unchanged
    Given the executor starts with kind "Pod" namespace "default" search "worker"
    When I execute filter with no fields
    Then the executor result has kind "Pod" namespace "default" search "worker"

  # ---------------------------------------------------------------------------
  # Action executor — multi
  # ---------------------------------------------------------------------------

  Scenario: Execute multi navigate then filter namespace
    Given the executor starts with kind "Pod" namespace "default" search "old"
    When I execute multi navigate "Deployment" then filter namespace "staging" search ""
    Then the executor result has kind "Deployment" namespace "staging" search ""

  Scenario: Execute multi navigate then filter search
    Given the executor starts with kind "Service" namespace "" search ""
    When I execute multi navigate "Pod" then filter namespace "" search "error"
    Then the executor result has kind "Pod" namespace "" search "error"
