Feature: First-run model download
  As a first-time user of Privateer
  I want a blocking download screen with progress, speed and ETA
  So that I can see the one-time model setup before the TUI launches

  Spec 04 §13 / Spec 07 §11.2: blocking download; rolling 5s speed average;
  ETA; checksum verify; cancel; failure -> retry; completion message.

  Background:
    Given a fresh model download manager

  # ---------------------------------------------------------------------------
  # Progress, speed and ETA
  # ---------------------------------------------------------------------------

  Scenario: progress percent reflects downloaded bytes
    Given the download total is 1000 bytes
    When the download reports 250 bytes at 1000ms
    Then the download percent is 25
    And the download phase is "downloading"

  Scenario: speed is a rolling average of the last 5 seconds
    When the download reports 1000000 bytes at 1000ms
    And the download reports 3000000 bytes at 2000ms
    Then the download speed is 2000000 bytes per second

  Scenario: the rolling window anchors on the last sample before the cutoff
    Given the download total is 100000000 bytes
    When the download reports 0 bytes at 0ms
    And the download reports 2000000 bytes at 1000ms
    And the download reports 12000000 bytes at 6000ms
    Then the download speed is 2000000 bytes per second

  Scenario: ETA is remaining bytes divided by current speed
    Given the download total is 5000000 bytes
    When the download reports 1000000 bytes at 1000ms
    And the download reports 2000000 bytes at 2000ms
    Then the download eta is 3 seconds

  # ---------------------------------------------------------------------------
  # Verify + complete
  # ---------------------------------------------------------------------------

  Scenario: verifying then complete on a valid checksum
    Given the download total is 1000 bytes
    When the download reports 1000 bytes at 1000ms
    And the download verifies successfully
    Then the download phase is "complete"

  Scenario: checksum mismatch fails the download
    Given the download total is 1000 bytes
    When the download reports 1000 bytes at 1000ms
    And the download verification fails with "checksum mismatch"
    Then the download phase is "failed"
    And the download error is "checksum mismatch"

  # ---------------------------------------------------------------------------
  # Cancel + retry
  # ---------------------------------------------------------------------------

  Scenario: cancelling moves the download to cancelled
    When the download reports 500 bytes at 1000ms
    And the download is cancelled
    Then the download phase is "cancelled"

  Scenario: a failed download can be retried back to downloading
    Given the download total is 1000 bytes
    When the download fails with "network error"
    And the download is retried
    Then the download phase is "downloading"
    And the download percent is 0

  # ---------------------------------------------------------------------------
  # FirstRunScreen rendering via the fake downloader
  # ---------------------------------------------------------------------------

  Scenario: the screen renders the trust copy and skip hint
    When I render the first-run screen downloading at 52 percent
    Then the first-run screen contains "Nothing leaves your machine"
    And the first-run screen contains "--no-agent"
    And the first-run screen contains "52%"

  Scenario: the screen shows the ready message on completion
    When I render the first-run screen completed
    Then the first-run screen contains "Model ready"

  Scenario: the screen shows the retry prompt on failure
    When I render the first-run screen failed with "network error"
    Then the first-run screen contains "network error"
    And the first-run screen contains "retry"
