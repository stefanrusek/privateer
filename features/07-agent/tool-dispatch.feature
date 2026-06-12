Feature: Agent tool dispatcher
  As the agent layer
  I want to dispatch tool calls against the State Store
  So that the model can inspect cluster state without network calls

  Background:
    Given an agent tool dispatcher is initialized

  # ---------------------------------------------------------------------------
  # list_resources
  # ---------------------------------------------------------------------------

  Scenario: list_resources returns all pods
    Given the store has a Pod "default/pod-a"
    And the store has a Pod "default/pod-b"
    When I dispatch "list_resources" with kind "Pod"
    Then the result contains 2 resources

  Scenario: list_resources filters by namespace
    Given the store has a Pod "default/pod-a"
    And the store has a Pod "kube-system/pod-b"
    When I dispatch "list_resources" with kind "Pod" and namespace "default"
    Then the result contains 1 resources
    And the result resource 0 has name "pod-a"

  Scenario: list_resources filters by status error
    Given the store has a healthy Pod "default/pod-ok"
    And the store has an erroring Pod "default/pod-err"
    When I dispatch "list_resources" with kind "Pod" and status "error"
    Then the result contains 1 resources
    And the result resource 0 has name "pod-err"

  Scenario: list_resources returns empty for unknown kind
    When I dispatch "list_resources" with kind "UnknownKind"
    Then the result contains 0 resources

  # ---------------------------------------------------------------------------
  # Secret redaction
  # ---------------------------------------------------------------------------

  Scenario: list_resources never exposes Secret data values
    Given the store has a Secret "default/my-secret" with data key "password" value "supersecret"
    When I dispatch "list_resources" with kind "Secret"
    Then the result JSON does not contain "supersecret"

  Scenario: get_resource never exposes Secret data values
    Given the store has a Secret "default/my-secret" with data key "token" value "REAL_TOKEN_VALUE"
    When I dispatch "get_resource" with kind "Secret" name "my-secret" namespace "default"
    Then the result JSON does not contain "REAL_TOKEN_VALUE"

  Scenario: get_resource never exposes Secret stringData values
    Given the store has a Secret "default/my-secret" with stringData key "apiKey" value "sk-SECRETKEY123"
    When I dispatch "get_resource" with kind "Secret" name "my-secret" namespace "default"
    Then the result JSON does not contain "sk-SECRETKEY123"

  # ---------------------------------------------------------------------------
  # count_resources
  # ---------------------------------------------------------------------------

  Scenario: count_resources returns correct totals
    Given the store has a healthy Pod "default/pod-ok"
    And the store has an erroring Pod "default/pod-err"
    When I dispatch "count_resources" with kind "Pod"
    Then the count result has total 2

  Scenario: count_resources filters by error status
    Given the store has a healthy Pod "default/pod-ok"
    And the store has an erroring Pod "default/pod-err"
    When I dispatch "count_resources" with kind "Pod" and status "error"
    Then the count result has total 1

  # ---------------------------------------------------------------------------
  # Unknown tool
  # ---------------------------------------------------------------------------

  Scenario: dispatching unknown tool throws
    When I dispatch unknown tool "nonexistent_tool"
    Then the dispatch throws with message containing "Unknown tool"
