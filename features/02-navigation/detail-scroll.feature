Feature: Detail tabs scroll their content
  As a user of Privateer
  I want every read-only detail tab to scroll when its content is taller than
  the pane, so nothing is silently clipped (navigation-overhaul chunk 03).

  Background:
    Given a tall detail tab whose content exceeds the viewport

  Scenario: The down arrow scrolls a tall tab by one line
    When I scroll the detail viewport down by one line
    Then the first visible line has moved down by one
    And no line beyond the viewport offset is shown

  Scenario: PageDown advances by about a page
    When I page the detail viewport down
    Then the first visible line has advanced by about one page

  Scenario: End reaches the last line
    When I scroll the detail viewport to the bottom
    Then the last line of the content is visible
    And the viewport is pinned to the bottom

  Scenario: Home returns to the top
    When I scroll the detail viewport to the bottom
    And I scroll the detail viewport to the top
    Then the first line of the content is visible

  Scenario: A short tab shows no scroll indicator
    Given a short detail tab whose content fits the viewport
    Then no scroll indicator is shown
    And every content line is visible

  Scenario Outline: Tall non-Logs tabs are all scrollable
    Given a tall "<tab>" tab
    When I scroll the detail viewport to the bottom
    Then the last line of the content is visible

    Examples:
      | tab      |
      | overview |
      | yaml     |
      | events   |
      | metrics  |
