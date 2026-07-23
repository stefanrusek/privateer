Feature: Walking skeleton
  As a developer bootstrapping Privateer
  I want the composed application to run end-to-end through the BDD harness
  So that the Spec 08 quality gate is enforceable before any feature lands

  Scenario: The version command reports the build version
    When I run p9r with arguments "version"
    Then the output contains "p9r 0.4.0"
