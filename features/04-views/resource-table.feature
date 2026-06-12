Feature: ResourceTable — virtual-scroll list view
  As a Privateer user
  I want to see a paginated, sortable, filterable table of Kubernetes resources
  So that I can quickly find and inspect cluster objects

  Scenario: Status column renders colored dot first
    Given a ResourceTable for kind "Deployment" with 1 resource named "api" in namespace "default"
    Then the table frame contains "●"
    And the table frame contains "Name"

  Scenario: Name column truncates long names with ellipsis
    Given a ResourceTable for kind "Pod" with 1 resource named "very-long-pod-name-that-should-be-truncated-for-sure" in namespace "default"
    And the table width is 40
    Then the table frame contains "…"

  Scenario: Age column is right-aligned in header
    Given a ResourceTable for kind "Deployment" with 1 resource named "api" in namespace "default"
    Then the table frame contains "Age"

  Scenario: Non-Pod resources default to Name ascending sort
    Given a ResourceTable for kind "Deployment" with resources named "beta" and "alpha"
    Then the resource "alpha" appears before "beta" in the table

  Scenario: Pod resources default to Status sort errors first
    Given a ResourceTable for kind "Pod" with a red pod "crasher" and a green pod "healthy"
    Then the resource "crasher" appears before "healthy" in the table

  Scenario: Sort indicator shows ascending arrow on active sort column
    Given a ResourceTable for kind "Deployment" sorted by "Name" ascending
    Then the table frame contains "▲"

  Scenario: Sort indicator shows descending arrow on active sort column
    Given a ResourceTable for kind "Deployment" sorted by "Name" descending
    Then the table frame contains "▼"

  Scenario: New row flashes green for 300ms then returns to normal
    Given a ResourceTable for kind "Deployment" with 0 resources
    And the fake clock starts at 0
    When a new resource "added-resource" is ADDED to the table
    Then the row "added-resource" has state "new"
    When the clock advances by 300 ms
    Then the row "added-resource" has state "default"

  Scenario: Modified row flashes blue for 300ms then returns to normal
    Given a ResourceTable for kind "Deployment" with 1 resource named "my-deploy" in namespace "default"
    And the fake clock starts at 0
    When the resource "my-deploy" receives a MODIFIED event
    Then the row "my-deploy" has state "modified"
    When the clock advances by 300 ms
    Then the row "my-deploy" has state "default"

  Scenario: Deleted row enters deleted state for 500ms then is removed
    Given a ResourceTable for kind "Deployment" with 1 resource named "dying" in namespace "default"
    And the fake clock starts at 0
    When the resource "dying" receives a DELETED event
    Then the row "dying" has state "deleted"
    When the clock advances by 500 ms
    Then the row "dying" is not present in the table

  Scenario: No resources found shows empty state message
    Given a ResourceTable for kind "Deployment" with 0 resources in namespace "default"
    Then the table frame contains "No Deployment found in default"

  Scenario: Search filtered to zero shows no-results message
    Given a ResourceTable for kind "Deployment" with 1 resource named "api" in namespace "default"
    And the search filter is "zzz"
    Then the table frame contains "No results for"
    And the table frame contains "zzz"

  Scenario: 403 permission denied shows permission error
    Given a ResourceTable for kind "Pod" in error state "forbidden"
    Then the table frame contains "Permission denied"
    And the table frame contains "Pod"

  Scenario: Connection error shows retry message
    Given a ResourceTable for kind "Pod" in error state "connection" with attempt 2 of 5
    Then the table frame contains "Connection error"
    And the table frame contains "2/5"

  Scenario: Loading state shows spinner and resource kind
    Given a ResourceTable for kind "Deployment" in loading state
    Then the table frame contains "Loading"
    And the table frame contains "Deployment"

  Scenario: Virtual scroll renders only visible rows
    Given a ResourceTable for kind "Pod" with 100 resources and a visible height of 10
    Then the table renders at most 10 rows

  Scenario: j key scrolls down one row
    Given a ResourceTable for kind "Pod" with 20 resources and a visible height of 5
    When I press "j" on the table
    Then the scroll offset is 1

  Scenario: k key scrolls up one row
    Given a ResourceTable for kind "Pod" with 20 resources and a visible height of 5
    And the scroll offset is 3
    When I press "k" on the table
    Then the scroll offset is 2

  Scenario: k key does not scroll above 0
    Given a ResourceTable for kind "Pod" with 20 resources and a visible height of 5
    And the scroll offset is 0
    When I press "k" on the table
    Then the scroll offset is 0

  Scenario: Ctrl+F scrolls down one page
    Given a ResourceTable for kind "Pod" with 20 resources and a visible height of 5
    When I press "ctrl+f" on the table
    Then the scroll offset is 5

  Scenario: Ctrl+B scrolls up one page
    Given a ResourceTable for kind "Pod" with 20 resources and a visible height of 5
    And the scroll offset is 10
    When I press "ctrl+b" on the table
    Then the scroll offset is 5

  Scenario: G key jumps to last row
    Given a ResourceTable for kind "Pod" with 20 resources and a visible height of 5
    When I press "G" on the table
    Then the scroll offset is 15

  Scenario: gg sequence jumps to first row
    Given a ResourceTable for kind "Pod" with 20 resources and a visible height of 5
    And the scroll offset is 10
    When I press "gg" on the table
    Then the scroll offset is 0

  Scenario: Search filters rows by name substring
    Given a ResourceTable for kind "Deployment" with resources named "frontend" and "backend"
    And the search filter is "front"
    Then the table frame contains "frontend"
    And the table frame does not contain "backend"

  Scenario: Search is case-insensitive
    Given a ResourceTable for kind "Deployment" with resources named "MyApp" and "other"
    And the search filter is "myapp"
    Then the table frame contains "MyApp"
    And the table frame does not contain "other"
