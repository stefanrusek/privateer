Feature: Sidebar navigation
  As a user of Privateer
  I want a sidebar showing all resource categories
  So that I can navigate to any Kubernetes resource type

  Background:
    Given the sidebar is rendered with default data

  Scenario: Sidebar renders all category groups
    Then the sidebar contains "Workloads"
    And the sidebar contains "Networking"
    And the sidebar contains "Configuration"
    And the sidebar contains "Storage"
    And the sidebar contains "Access Control"
    And the sidebar contains "Nodes"
    And the sidebar contains "Namespaces"
    And the sidebar contains "Custom Resources"

  Scenario: Sidebar has Health/Overview root item at top
    Then the sidebar contains "Overview"

  Scenario: Categories are expandable and collapsible
    Given the "Workloads" category is expanded
    Then the sidebar contains "Deployments"
    When the "Workloads" category is collapsed
    Then the sidebar does not contain "Deployments"

  Scenario: Resource count badge is shown for live counts
    Given the "Deployments" resource has a live count of 5
    Then the sidebar contains "5"

  Scenario: Forbidden resource shows lock indicator
    Given the "Deployments" resource is forbidden
    Then the sidebar contains "[!]"

  Scenario: Active item is highlighted
    Given "Deployments" is the active resource kind
    Then the sidebar contains ">"

  Scenario: Collapsed category shows expand indicator
    Given the "Workloads" category is collapsed
    Then the sidebar contains "▶"

  Scenario: Expanded category shows collapse indicator
    Given the "Workloads" category is expanded
    Then the sidebar contains "▼"
