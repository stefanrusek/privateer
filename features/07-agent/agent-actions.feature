Feature: Agent action parsing and loop
  As the agent layer
  I want to parse model output into AgentActions and run the round loop
  So that user queries produce typed actions dispatched to the UI

  Background:
    Given an agent loop is initialized

  # ---------------------------------------------------------------------------
  # Parser — navigate
  # ---------------------------------------------------------------------------

  Scenario: parse navigate action
    When I parse model output '{"action":"navigate","resource":"Pod"}'
    Then the parsed action is navigate to "Pod"

  Scenario: parse navigate fails with empty resource
    When I parse model output '{"action":"navigate","resource":""}'
    Then the parse fails

  # ---------------------------------------------------------------------------
  # Parser — filter
  # ---------------------------------------------------------------------------

  Scenario: parse filter action with namespace and search
    When I parse model output '{"action":"filter","namespace":"default","search":"order"}'
    Then the parsed action is filter with namespace "default" and search "order"

  Scenario: parse filter action with only namespace
    When I parse model output '{"action":"filter","namespace":"staging"}'
    Then the parsed action is filter with namespace "staging"

  Scenario: parse bare filter action
    When I parse model output '{"action":"filter"}'
    Then the parsed action is filter

  # ---------------------------------------------------------------------------
  # Parser — answer
  # ---------------------------------------------------------------------------

  Scenario: parse answer action
    When I parse model output '{"action":"answer","text":"There are 5 running pods."}'
    Then the parsed action is answer with text "There are 5 running pods."

  # ---------------------------------------------------------------------------
  # Parser — multi
  # ---------------------------------------------------------------------------

  Scenario: parse multi action
    When I parse model output '{"action":"multi","steps":[{"action":"navigate","resource":"Pod"},{"action":"filter","search":"error"}]}'
    Then the parsed multi action has 2 steps

  # ---------------------------------------------------------------------------
  # Parser — unknown
  # ---------------------------------------------------------------------------

  Scenario: parse unknown action
    When I parse model output '{"action":"unknown","raw":"I could not understand this"}'
    Then the parsed action is unknown with raw "I could not understand this"

  # ---------------------------------------------------------------------------
  # Parser — JSON extraction
  # ---------------------------------------------------------------------------

  Scenario: parse JSON in markdown code block
    When I parse model output '```json\n{"action":"navigate","resource":"Pod"}\n```'
    Then the parsed action is navigate to "Pod"

  Scenario: parse fails for empty content
    When I parse model output ''
    Then the parse fails

  Scenario: parse fails for invalid JSON
    When I parse model output '{not valid json}'
    Then the parse fails

  # ---------------------------------------------------------------------------
  # Loop — happy path
  # ---------------------------------------------------------------------------

  Scenario: loop returns action from immediate answer
    Given the fixture engine will answer '{"action":"answer","text":"Hello."}'
    When I run the agent loop with query "test query"
    Then the loop result is action with kind "answer"

  Scenario: loop returns action after one tool call round
    Given the fixture engine will call tool "list_resources" then answer '{"action":"answer","text":"Found 2 pods."}'
    When I run the agent loop with query "show me pods"
    Then the loop result is action with kind "answer"
    And the tool "list_resources" was called

  # ---------------------------------------------------------------------------
  # Loop — error cases
  # ---------------------------------------------------------------------------

  Scenario: loop returns error on engine failure
    Given the fixture engine will error with "model crashed"
    When I run the agent loop with query "test"
    Then the loop result is error

  Scenario: loop returns parseError when model emits invalid JSON
    Given the fixture engine will answer 'not json at all'
    When I run the agent loop with query "test"
    Then the loop result is parseError

  Scenario: loop returns timeout after 15 seconds
    Given the fixture engine will never respond
    When I run the agent loop with query "test" and advance clock 15001ms
    Then the loop result is timeout

  Scenario: loop returns error after 5 tool call rounds
    Given the fixture engine will call tool "list_resources" 5 times with no final answer
    When I run the agent loop with query "test"
    Then the loop result is error with message containing "Maximum tool call rounds"
