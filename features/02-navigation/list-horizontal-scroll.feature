Feature: List horizontal scroll with pinned columns
  As a user looking at a resource list with more columns than fit on screen
  I want to scroll right with the right arrow and back with the left arrow
  So that I can see every column while the status dot and Name stay pinned

  Background:
    Given a wide Pod list with a list pane width of 70

  Scenario: Right arrow reveals later columns
    Given the list is at horizontal offset 0
    When I press the right arrow on the list
    Then later columns become visible
    And the status dot and Name columns are still shown

  Scenario: Left arrow returns and clamps at the start
    Given the list is at horizontal offset 1
    When I press the left arrow on the list
    Then the horizontal offset is 0
    When I press the left arrow on the list
    Then the horizontal offset is 0

  Scenario: Right arrow clamps with the last column flush to the edge
    Given the list is at horizontal offset 0
    When I press the right arrow on the list until it stops advancing
    Then the last column is visible
    And no columns are hidden to the right

  Scenario: Status and Name stay pinned at every offset
    Given the list is scrolled fully to the right
    Then the status dot and Name columns are still shown

  Scenario: No scroll when everything fits
    Given a wide Pod list with a list pane width of 200
    And the list is at horizontal offset 0
    When I press the right arrow on the list
    Then the horizontal offset is 0
    And no more-columns markers are shown

  Scenario: Offset resets when the kind changes
    Given the list is scrolled fully to the right
    When I switch the active kind to "Deployment"
    Then the horizontal offset is 0

  Scenario: Offset persists across vertical scroll
    Given the list is at horizontal offset 2
    When I scroll the selection down several rows
    Then the horizontal offset is 2

  Scenario: No row wraps at any offset
    Given the list is scrolled fully to the right
    Then no rendered list row exceeds the pane width
    And no rendered list row wraps to a second line
