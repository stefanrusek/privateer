Feature: Mouse interaction input parsing
  As a user of Privateer
  I want mouse events to be parsed from SGR terminal sequences
  So that I can interact with the TUI using my mouse

  Background:
    Given the mouse parser is initialized

  Scenario: Parse a left button press event
    When I receive the SGR sequence "<ESC>[<0;10;5M"
    Then the parsed mouse event has type "down"
    And the parsed mouse event has button 0
    And the parsed mouse event has x 10 and y 5

  Scenario: Parse a left button release event
    When I receive the SGR sequence "<ESC>[<0;10;5m"
    Then the parsed mouse event has type "up"
    And the parsed mouse event has button 0
    And the parsed mouse event has x 10 and y 5

  Scenario: Parse a mouse motion event
    When I receive the SGR sequence "<ESC>[<35;20;15M"
    Then the parsed mouse event has type "move"
    And the parsed mouse event has x 20 and y 15

  Scenario: Parse a mouse drag event
    When I receive the SGR sequence "<ESC>[<32;20;15M"
    Then the parsed mouse event has type "drag"
    And the parsed mouse event has button 0

  Scenario: Parse a scroll up event
    When I receive the SGR sequence "<ESC>[<64;5;5M"
    Then the parsed mouse event has type "scrollUp"

  Scenario: Parse a scroll down event
    When I receive the SGR sequence "<ESC>[<65;5;5M"
    Then the parsed mouse event has type "scrollDown"

  Scenario: Parse modifier keys on a click
    When I receive the SGR sequence "<ESC>[<4;10;5M"
    Then the parsed mouse event has type "down"
    And the parsed mouse event has shift true

  Scenario: Reject malformed SGR sequences
    When I receive the SGR sequence "not-a-sequence"
    Then the parsed mouse event is null

  Scenario: Hit testing returns topmost region at a point
    Given the hit-test registry is cleared
    And region "back" is registered at x 0 y 0 width 20 height 10 z 1
    And region "front" is registered at x 5 y 5 width 10 height 5 z 2
    When I hit-test point x 7 y 7
    Then the hit-test result is "front"

  Scenario: Hit testing returns null when no region covers the point
    Given the hit-test registry is cleared
    And region "box" is registered at x 0 y 0 width 10 height 10 z 1
    When I hit-test point x 50 y 50
    Then the hit-test result is null

  Scenario: Hit testing clears all regions on clear
    Given the hit-test registry is cleared
    And region "box" is registered at x 0 y 0 width 10 height 10 z 1
    When the hit-test registry is reset
    And I hit-test point x 5 y 5
    Then the hit-test result is null

  Scenario: Drag emits delta events from press to motion to release
    Given the drag tracker is initialized
    And region "handle" is registered as a drag handle at x 10 y 10 width 5 height 5
    When a mouse down event at x 12 y 12
    And a mouse move event at x 15 y 14
    Then a drag delta event is emitted with dx 3 dy 2
    When a mouse up event at x 15 y 14
    Then a drag release event is emitted
