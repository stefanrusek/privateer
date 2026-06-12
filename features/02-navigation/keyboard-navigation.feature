Feature: Keyboard navigation input parsing
  As a user of Privateer
  I want keyboard input to be parsed into structured key events
  So that I can navigate the TUI using the keyboard

  Background:
    Given the keyboard parser is initialized with a fake clock

  Scenario: Parse a printable character
    When I receive the key bytes "a"
    Then the parsed key event has key "a"
    And the parsed key event is not a special key

  Scenario: Parse the up arrow key
    When I receive the key bytes "<ESC>[A"
    Then the parsed key event has key "up"

  Scenario: Parse the down arrow key
    When I receive the key bytes "<ESC>[B"
    Then the parsed key event has key "down"

  Scenario: Parse the right arrow key
    When I receive the key bytes "<ESC>[C"
    Then the parsed key event has key "right"

  Scenario: Parse the left arrow key
    When I receive the key bytes "<ESC>[D"
    Then the parsed key event has key "left"

  Scenario: Parse the Enter key
    When I receive the key bytes "<CR>"
    Then the parsed key event has key "return"

  Scenario: Parse the Escape key
    When I receive the key bytes "<ESC>"
    Then the parsed key event has key "escape"

  Scenario: Parse the Tab key
    When I receive the key bytes "<TAB>"
    Then the parsed key event has key "tab"

  Scenario: Parse Shift+Tab
    When I receive the key bytes "<ESC>[Z"
    Then the parsed key event has key "tab"
    And the parsed key event has shift true

  Scenario: Parse Backspace
    When I receive the key bytes "<DEL>"
    Then the parsed key event has key "backspace"

  Scenario: Parse Ctrl+C
    When I receive the key bytes "<ETX>"
    Then the parsed key event has key "c"
    And the parsed key event has ctrl true

  Scenario: Parse Ctrl+F
    When I receive the key bytes "<ACK>"
    Then the parsed key event has key "f"
    And the parsed key event has ctrl true

  Scenario: Parse Ctrl+B
    When I receive the key bytes "<STX>"
    Then the parsed key event has key "b"
    And the parsed key event has ctrl true

  Scenario: Parse Ctrl+S
    When I receive the key bytes "<DC3>"
    Then the parsed key event has key "s"
    And the parsed key event has ctrl true

  Scenario: The gg chord fires within the 500ms window
    When I press key "g"
    And I advance the clock by 400 ms
    And I press key "g"
    Then the key sequence "gg" fires

  Scenario: The gg chord does not fire after the 500ms window expires
    When I press key "g"
    And I advance the clock by 600 ms
    Then the key sequence "gg" does not fire
    And the single key "g" was emitted once

  Scenario: Modal transitions from normal to search
    Given the mode is "normal"
    When the mode transitions to "search"
    Then the current mode is "search"

  Scenario: Modal transitions from search to normal
    Given the mode is "search"
    When the mode transitions to "normal"
    Then the current mode is "normal"

  Scenario: Modal transitions from normal to command
    Given the mode is "normal"
    When the mode transitions to "command"
    Then the current mode is "command"

  Scenario: Modal transitions from normal to edit
    Given the mode is "normal"
    When the mode transitions to "edit"
    Then the current mode is "edit"

  Scenario: Tab cycles focus from sidebar to list to detail and back
    Given the layout has detail visible
    And the current focus is "sidebar"
    When I press Tab
    Then the current focus is "list"
    When I press Tab
    Then the current focus is "detail"
    When I press Tab
    Then the current focus is "sidebar"

  Scenario: Tab cycles focus from sidebar to list and back when detail hidden
    Given the layout has no detail visible
    And the current focus is "sidebar"
    When I press Tab
    Then the current focus is "list"
    When I press Tab
    Then the current focus is "sidebar"

  Scenario: Shift+Tab cycles focus in reverse with detail visible
    Given the layout has detail visible
    And the current focus is "sidebar"
    When I press Shift+Tab
    Then the current focus is "detail"

  Scenario: Shift+Tab cycles focus in reverse without detail
    Given the layout has no detail visible
    And the current focus is "sidebar"
    When I press Shift+Tab
    Then the current focus is "list"
