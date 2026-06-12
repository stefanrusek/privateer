Feature: Secret redaction invariant — no reveal path through the agent
  As a security requirement
  I want Secret data/stringData to be unconditionally redacted at the dispatcher boundary
  So that no model output can ever contain real secret values

  Background:
    Given an agent tool dispatcher is initialized

  # ---------------------------------------------------------------------------
  # Adversarial fixtures — direct dispatcher access
  # ---------------------------------------------------------------------------

  Scenario: list_resources for Secret kind never reveals data values
    Given the store has a Secret "default/db-creds" with data key "password" value "P@ssw0rd123!"
    When I dispatch "list_resources" with kind "Secret"
    Then the result JSON does not contain "P@ssw0rd123!"

  Scenario: list_resources for Secret kind never reveals stringData values
    Given the store has a Secret "default/api-key" with stringData key "key" value "sk-live-TOPSECRET"
    When I dispatch "list_resources" with kind "Secret"
    Then the result JSON does not contain "sk-live-TOPSECRET"

  Scenario: get_resource for Secret never reveals data values
    Given the store has a Secret "default/tls-cert" with data key "tls.key" value "-----BEGIN RSA PRIVATE KEY-----"
    When I dispatch "get_resource" with kind "Secret" name "tls-cert" namespace "default"
    Then the result JSON does not contain "-----BEGIN RSA PRIVATE KEY-----"

  Scenario: get_resource for Secret never reveals stringData values
    Given the store has a Secret "production/service-token" with stringData key "token" value "eyJhbGciOiJSUzI1NiIsImtpZCI6IiJ9"
    When I dispatch "get_resource" with kind "Secret" name "service-token" namespace "production"
    Then the result JSON does not contain "eyJhbGciOiJSUzI1NiIsImtpZCI6IiJ9"

  Scenario: Secret with multiple data keys — all are redacted
    Given the store has a Secret "default/multi-key" with multiple data keys
      | key      | value          |
      | username | admin          |
      | password | secret123      |
      | token    | tok-abcdef1234 |
    When I dispatch "get_resource" with kind "Secret" name "multi-key" namespace "default"
    Then the result JSON does not contain "admin"
    And the result JSON does not contain "secret123"
    And the result JSON does not contain "tok-abcdef1234"

  Scenario: Non-Secret resources are not redacted
    Given the store has a ConfigMap "default/app-config" with data key "config.yaml" value "host: localhost"
    When I dispatch "get_resource" with kind "ConfigMap" name "app-config" namespace "default"
    Then the result is not null

  Scenario: Erroring Secret pod (adversarial) — list_resources never reveals data
    Given the store has an erroring Secret "default/erroring-secret" with data key "secretValue" value "MUST_NOT_APPEAR"
    When I dispatch "list_resources" with kind "Secret" and status "error"
    Then the result JSON does not contain "MUST_NOT_APPEAR"
