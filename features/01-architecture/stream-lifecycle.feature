Feature: Store ingestion and rollup
  As a Privateer state layer
  I want the State Store to correctly ingest watch events
  So that the UI has accurate, up-to-date resource state

  Background:
    Given a fresh state store with context "test-ctx"

  Scenario: ADDED event inserts a resource into the store
    When the watch aggregator receives an ADDED event for Pod "default/web-1"
    Then the store contains Pod "default/web-1" in context "test-ctx"
    And the store lists 1 Pod in namespace "default"

  Scenario: MODIFIED event updates an existing resource
    Given the watch aggregator has received an ADDED event for Pod "default/web-1"
    When the watch aggregator receives a MODIFIED event for Pod "default/web-1"
    Then the store contains Pod "default/web-1" in context "test-ctx"
    And the store lists 1 Pod in namespace "default"

  Scenario: DELETED event removes the resource from the store
    Given the watch aggregator has received an ADDED event for Pod "default/web-1"
    When the watch aggregator receives a DELETED event for Pod "default/web-1"
    Then the store does not contain Pod "default/web-1" in context "test-ctx"
    And the store lists 0 Pods in namespace "default"

  Scenario: managedFields are stripped before storing
    When the watch aggregator receives an ADDED event for Pod "default/slim-1" with managedFields
    Then the stored Pod "default/slim-1" has no managedFields

  Scenario: last-applied-configuration annotation is stripped before storing
    When the watch aggregator receives an ADDED event for Pod "default/slim-2" with last-applied-configuration annotation
    Then the stored Pod "default/slim-2" has no last-applied-configuration annotation

  Scenario: Subscriber is notified asynchronously after a mutation
    Given a subscriber is registered on the store
    When a single ADDED event is emitted and the synchronous notification count is captured
    Then the synchronous notification count is 0
    And after awaiting a microtask the subscriber has been called once

  Scenario: Multiple mutations coalesce into a single notification
    Given a subscriber is registered on the store
    When two ADDED events are emitted and the synchronous notification count is captured
    Then the synchronous notification count is 0
    And after awaiting a microtask the subscriber has been called once

  Scenario: Unsubscribing stops future notifications
    Given a subscriber is registered on the store
    And the subscriber is unsubscribed
    When the watch aggregator receives an ADDED event for Pod "default/gone-1"
    And after awaiting a microtask
    Then the subscriber has been called 0 times

  Scenario: Namespace rollup reflects resource counts by status color
    When the store has Pods "default/green-pod" with color "green" and "default/red-pod" with color "red"
    Then the namespace rollup for "default" in context "test-ctx" has green count 1 and red count 1

  Scenario: Node rollup reflects pods scheduled to a node
    When the watch aggregator receives an ADDED event for Pod "default/pod-on-node" on node "node-1"
    Then the node rollup for "node-1" in context "test-ctx" has total count 1

  Scenario: Multiple contexts are stored independently
    When the watch aggregator for context "other-ctx" receives an ADDED event for Pod "default/other-pod"
    Then the store contains Pod "default/other-pod" in context "other-ctx"
    And the store does not contain Pod "default/other-pod" in context "test-ctx"
