Feature: YAML edit, diff, and save
  As a Privateer user
  I want to view, edit, and save resource YAML
  So that I can modify Kubernetes resources in place

  Scenario: View resource YAML in read mode
    Given a YamlTab for a ConfigMap named "app-config" in namespace "default"
    When the YamlTab renders in read mode
    Then the yaml frame contains "apiVersion"
    And the yaml frame contains "app-config"

  Scenario: Edit YAML and see diff before saving
    Given a YamlTab for a ConfigMap named "app-config" in namespace "default"
    And the ConfigMap has data key "replicas" with value "2"
    When I enter yaml edit mode
    And I update the yaml content with "replicas" changed to "3"
    And I open the diff view
    Then the diff frame shows a change from "2" to "3"

  Scenario: Save changes to resource via diff view
    Given a YamlTab for a ConfigMap named "app-config" in namespace "default"
    And the ConfigMap has data key "tier" with value "frontend"
    When I enter yaml edit mode
    And I update the yaml content with "tier" changed to "backend"
    And I open the diff view
    And I apply the diff
    Then the yaml save succeeded

  Scenario: Handle 409 conflict with reload option
    Given a YamlTab for a ConfigMap named "conflict-cfg" in namespace "default"
    And the ConfigMap has data key "env" with value "staging"
    When I enter yaml edit mode
    And I update the yaml content with "env" changed to "production"
    And the resource is updated server-side to version "2"
    And I open the diff view
    And I apply the diff expecting a conflict
    Then the diff frame shows a conflict error
    And the diff frame shows a reload option

  Scenario: Discard changes cancels edit mode
    Given a YamlTab for a ConfigMap named "app-config" in namespace "default"
    When I enter yaml edit mode
    And I discard yaml edits
    Then the yaml frame is in read mode

  Scenario: Invalid YAML shows validation error
    Given a YamlTab for a ConfigMap named "app-config" in namespace "default"
    When I enter yaml edit mode
    And I set the yaml content to invalid YAML
    Then the yaml validation error is shown
