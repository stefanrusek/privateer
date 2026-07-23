Feature: Secret value masking and reveal
  As a Privateer user
  I want Secret data values to be hidden by default
  So that sensitive data is not accidentally exposed on screen

  Scenario: Secret data values are masked by default
    Given a YamlTab for a Secret named "db-creds" in namespace "default"
    And the Secret has a data key "password" with base64 value "c2VjcmV0"
    When the YamlTab renders in read mode
    Then the yaml frame contains "••••••••"
    And the yaml frame does not contain "c2VjcmV0"

  Scenario: Non-Secret resources are not masked
    Given a YamlTab for a ConfigMap named "app-cfg" in namespace "default"
    And the ConfigMap has a data key "host" with value "localhost"
    When the YamlTab renders in read mode
    Then the yaml frame contains "localhost"
    And the yaml frame does not contain "••••••••"

  Scenario: Reveal secret values after confirmation
    Given a YamlTab for a Secret named "db-creds" in namespace "default"
    And the Secret has a data key "password" with base64 value "c2VjcmV0"
    When the YamlTab renders in read mode
    And I reveal secret values after confirmation
    Then the yaml frame contains "secret"
    And the yaml frame does not contain "c2VjcmV0"
    And the yaml frame does not contain "••••••••"

  Scenario: stringData field is also masked
    Given a YamlTab for a Secret named "api-secret" in namespace "default"
    And the Secret has a stringData key "token" with value "my-token-value"
    When the YamlTab renders in read mode
    Then the yaml frame contains "••••••••"
    And the yaml frame does not contain "my-token-value"
