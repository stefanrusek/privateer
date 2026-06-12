Feature: EventsTab — on-demand event fetching and filtering
  As a Privateer user
  I want to see Kubernetes events for the selected resource
  So that I can diagnose issues quickly

  Scenario: Default view shows only warning events
    Given an EventsTab for pod "order-api" in namespace "default"
    And the fake client has a Warning event with reason "BackOff" and message "Back-off restarting failed container"
    And the fake client has a Normal event with reason "Pulled" and message "Successfully pulled image"
    When the EventsTab loads
    Then the events frame contains "Warning"
    And the events frame contains "BackOff"
    And the events frame does not contain "Pulled"

  Scenario: Toggle to All shows normal events too
    Given an EventsTab for pod "order-api" in namespace "default"
    And the fake client has a Warning event with reason "BackOff" and message "Back-off restarting failed container"
    And the fake client has a Normal event with reason "Pulled" and message "Successfully pulled image"
    When the EventsTab loads
    And I toggle to show all events
    Then the events frame contains "Pulled"
    And the events frame contains "BackOff"

  Scenario: Warning count appears in events output
    Given an EventsTab for pod "order-api" in namespace "default"
    And the fake client has 3 Warning events
    When the EventsTab loads
    Then the events frame contains "3"

  Scenario: Empty warning state shows prompt to show all
    Given an EventsTab for pod "order-api" in namespace "default"
    And the fake client has no events
    When the EventsTab loads
    Then the events frame contains "No warning events"
    And the events frame contains "Show all events"

  Scenario: Empty all-events state shows no events message
    Given an EventsTab for pod "order-api" in namespace "default"
    And the fake client has no events
    When the EventsTab loads
    And I toggle to show all events
    Then the events frame contains "No events"

  Scenario: Events are sorted by last timestamp descending
    Given an EventsTab for pod "order-api" in namespace "default"
    And the fake client has a Warning event with reason "OlderEvent" at time "2026-06-10T10:00:00Z"
    And the fake client has a Warning event with reason "NewerEvent" at time "2026-06-10T12:00:00Z"
    When the EventsTab loads
    Then the events frame shows "NewerEvent" before "OlderEvent"

  Scenario: Event columns are rendered
    Given an EventsTab for pod "order-api" in namespace "default"
    And the fake client has a Warning event with reason "BackOff" count 5 and message "Back-off restarting"
    When the EventsTab loads
    Then the events frame contains "Type"
    And the events frame contains "Reason"
    And the events frame contains "Age"
    And the events frame contains "Count"
    And the events frame contains "Message"
    And the events frame contains "5"
    And the events frame contains "Back-off restarting"
