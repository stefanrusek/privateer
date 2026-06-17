Feature: Measured widgets — Buttons, DropdownButton, accelerators, overlays
  As a user of Privateer
  I want clickable tabs, close button, header chips, and a namespace dropdown
  So that mouse and accelerator keys drive the same actions through one registry

  # These scenarios drive the pure registry + dispatch + accelerator helpers over
  # button/list/overlay entries — exactly the entries the measured React wrappers
  # in src/adapters/live/ register. (BDD step files may not import src/adapters/**;
  # the wrappers are thin glue verified by tmux per the build-order's tier rules.)

  Scenario: Clicking a detail tab Button fires its handler over the region
    Given a registry with the detail region and a "tab.yaml" button nested in it
    When I press inside the "tab.yaml" button
    Then the action is a button press for "tab.yaml"

  Scenario: A nested Button wins the click over its region at the same layer
    Given a registry with the detail region and a "detail.close" button nested in it
    When I press inside the "detail.close" button
    Then the action is a button press for "detail.close"

  Scenario: Clicking the region outside any button focuses the region
    Given a registry with the detail region and a "tab.yaml" button nested in it
    When I press the detail region away from the button
    Then the action focuses the "detail" region

  Scenario: An open overlay captures clicks above the base region
    Given a registry with the list region and a namespace overlay open above it
    When I press an overlay item at overlay row 1
    Then the action is a button press for "header.namespace.item.kube-system"
    And the list row beneath is NOT selected

  Scenario: An outside click hits the overlay backdrop, not the list
    Given a registry with the list region and a namespace overlay open above it
    When I press far outside the overlay
    Then the action is a button press for "header.namespace.backdrop"

  Scenario: An accelerator key activates its button
    Given active button "Container ▾" with accelerator "o" and button "100 lines ▾" with accelerator "l"
    When I press the accelerator key "o"
    Then the matched button is "container"
    And the "o" in "Container ▾" renders underlined

  Scenario: A filterable dropdown narrows to matching items as I type
    Given the namespace items "default", "kube-system", "kube-public"
    When I filter the items by "kube"
    Then the visible items are "kube-system,kube-public"
