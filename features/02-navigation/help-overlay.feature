Feature: Accurate, grouped help overlay
  As a user of Privateer
  I want the `?` help overlay to be accurate and grouped by where I am
  So that I can learn the keys for my current region instead of a stale flat list

  # These scenarios drive the pure keymap registry + grouping/ordering helpers
  # (src/ui/keymap.ts) — the single source of truth the HelpOverlay React glue
  # renders. (BDD step files may not import src/adapters/**; the overlay's
  # rendering is covered by its component test + tmux per the build-order tiers.)

  Scenario: Help is grouped by scope
    When I build the help groups for focus "list"
    Then the help groups include "Global"
    And the help groups include "Sidebar"
    And the help groups include "List"
    And the help groups include "Detail (all tabs)"

  Scenario: Help leads with my current context
    When I build the help groups for the detail tab "logs"
    Then the first help group is "Detail · Logs"
    And the help groups include "Global"

  Scenario: Every list action key is documented
    When I build the help groups for focus "list"
    Then the "List" group documents keys "e, y, d, l, x, p"

  Scenario: Every button accelerator is documented
    Then every measured-button accelerator appears in the keymap

  Scenario: The registry is internally consistent
    Then the keymap reports no consistency issues
