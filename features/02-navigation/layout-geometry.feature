Feature: Layout geometry single source
  As a maintainer of Privateer
  I want every region size and position to come from one geometry module
  So that the list, detail, and metrics charts never wrap at any terminal size

  Scenario Outline: List fits its pane at any size
    Given a terminal of <cols> columns and <rows> rows
    And the sidebar ratio is 0.2 and the vertical ratio is 0.4
    And the detail pane is <detail>
    When I compute the layout frame
    Then the list inner width is at least 1 and less than <cols>
    And the list region stays inside the terminal width
    And no region has a negative dimension

    Examples:
      | cols | rows | detail |
      | 80   | 24   | closed |
      | 80   | 24   | open   |
      | 120  | 40   | open   |
      | 200  | 50   | open   |
      | 60   | 20   | open   |

  Scenario: Opening the detail pane does not change the list width
    Given a terminal of 100 columns and 40 rows
    And the sidebar ratio is 0.2 and the vertical ratio is 0.4
    When I compute the layout frame with the detail pane closed
    And I compute the layout frame with the detail pane open
    Then the list inner width is the same in both frames
    And the detail inner width equals the list inner width

  Scenario: Detail pane derives from the vertical split with one shared line
    Given a terminal of 100 columns and 40 rows
    And the sidebar ratio is 0.2 and the vertical ratio is 0.4
    And the detail pane is open
    When I compute the layout frame
    Then the list and detail inner heights plus the shared line equal the body height
    And the list│detail handle sits between the list and the detail pane

  Scenario: Sidebar width honours its minimum on a wide low-ratio terminal
    Given a terminal of 120 columns and 40 rows
    And the sidebar ratio is 0.1 and the vertical ratio is 0.4
    And the detail pane is closed
    When I compute the layout frame
    Then the sidebar inner width is 18

  Scenario: Geometry degrades gracefully on a tiny terminal
    Given a terminal of 3 columns and 4 rows
    And the sidebar ratio is 0.2 and the vertical ratio is 0.4
    And the detail pane is open
    When I compute the layout frame
    Then no region has a negative dimension
    And the computed frame has no detail pane
