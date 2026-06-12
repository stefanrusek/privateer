# Chunk 01 — Focus & keyboard routing model

**Status:** DRAFT
**Depends on:** —
**Implements / amends:** `spec/spec-02-navigation-layout.md` (keyboard model,
focus, region cycling). Update that canonical spec in this chunk where the
behavior below changes it.

## User story

> As a p9r user, I want one consistent rule for moving around — **`Tab` moves
> between regions, the arrow keys act inside the region I'm in** — so I never
> have to remember that an arrow sometimes jumps me to a different pane and
> sometimes doesn't.

## Background — how it works today (for the implementer)

All key routing lives in `src/adapters/live/controller.ts`:

- `handleInput()` (~line 3060) dispatches: modal/overlay handlers first, then a
  Logs-tab branch (only when `focus === 'detail' && detail.tab === 'logs'`,
  ~3122), then global keys, then a `switch (this.app.focus)` to
  `handleSidebarInput` / `handleListInput` / `handleDetailInput`.
- **Tab** (~3169) cycles focus *only* when `focus !== 'detail'`. Inside the
  detail pane, `src/ui/components/DetailPane.tsx` has its own `useInput`
  (`isActive: focused`) that consumes `Tab`/`Shift+Tab` and number keys `1–6`
  to switch tabs (`navigateTab()` helper, DetailPane.tsx ~191).
- **`cycleFocus()`** (~3219) walks `['sidebar','list','detail']` (detail only
  when `showDetail`).
- **Sidebar arrows** (`handleSidebarInput`, ~3329): `↑/↓` move the cursor,
  `←` collapse / go to parent, `→`/Enter expand or select, `h`/`l` =
  collapse-all / expand-all. *(Keep all of this unchanged.)*
- **List arrows** (`handleListInput`, ~3407): `↑/↓` move selection; **`←` sets
  focus to sidebar (3428), `→` sets focus to detail (3432)** — this is the
  cross-region movement we are removing.
- **Detail arrows** (`handleDetailInput`, ~3522): **`←` sets focus to list
  (3534)** — also removed; `[`/`]` cycle the metrics range; `Esc` closes the
  pane; `q` quits.
- `FocusRegion = 'sidebar' | 'list' | 'detail' | 'commandbar'`
  (`src/ui/types.ts:9`). `commandbar` is entered via `/`, `:`/Space, `!` and
  exited with `Esc`/Enter; it is **not** part of the Tab cycle.

## Target keyboard model

`Tab` / `Shift+Tab` move **between** regions. Arrow keys act **within** the
focused region. Nothing else changes focus except a mouse click and opening the
detail pane (see below).

| Region | `↑` / `↓` | `←` / `→` | Notes |
|--------|-----------|-----------|-------|
| **Sidebar** | move cursor (also `j`/`k`) | `←` collapse / parent, `→` expand / select | `h`/`l` collapse-all / expand-all. **Unchanged.** |
| **List** | move selection (also `j`/`k`) | **horizontal scroll** | Scroll behavior is built in **chunk 05**; in this chunk `←/→` become **no-ops** (they must no longer move focus). |
| **Detail** | **scroll content** | **previous / next tab** | Scrolling is built in **chunk 03**; in this chunk `↑/↓` route to a detail-scroll seam that is a no-op until chunk 03. `1–6` jump to a tab. `[`/`]` still cycle the metrics range. |

`Tab` / `Shift+Tab` cycle `sidebar → list → detail → sidebar` (detail included
only while `showDetail`), and must work **from every region, including
detail**.

### Detail tab navigation moves off `Tab`

- `Tab`/`Shift+Tab` must **no longer** switch detail tabs. Remove the
  `&& this.app.focus !== 'detail'` guard so the controller's `cycleFocus`
  handles `Tab` while the detail pane is focused.
- `DetailPane.tsx` must stop consuming `Tab`/`Shift+Tab`. Tab switching moves
  to the controller's detail handler, driven by `←` (previous tab) and `→`
  (next tab), wrapping around the navigable-tab list. Number keys `1–6`
  continue to jump directly to a tab (now handled in the controller, not the
  DetailPane `useInput`).
- The set of navigable tabs per resource kind is the existing logic in
  `DetailPane.tsx` (~41–68). Extract it into a **pure module** (e.g.
  `src/ui/detail-tabs.ts`) with full unit tests so both the controller and the
  component derive the same list from one source.

### Quit (`q`) and close-pane (`Escape`)

- **`q` quits the app from every region** while in normal navigation mode
  (i.e. not while a text input is active — resource-list search, command bar,
  Logs search, or YAML edit, all of which are handled earlier in the dispatch
  and where `q` is a literal character). The existing quit-confirm when
  port-forwards are active (`quit()` → confirm → `forceQuit()`,
  controller.ts ~2231) still applies.
- **Known bug to root-cause:** users report `q` does **not** currently quit —
  only `Ctrl+C` does. Today the global handler guards `q` with
  `focus !== 'detail'` (controller.ts ~3137) and the detail handler quits on
  `q` separately (~3550). Consolidate to a single global `q`-quits-in-normal-
  mode path (remove the `focus !== 'detail'` guard and the detail-handler
  duplicate), and verify the app actually exits in all regions (confirm
  `onExit()` terminates under Bun). The acceptance below must hold.
- **`Escape` closes the detail pane** (and returns focus to the list) whenever
  the pane is open, from any region. `Escape` never quits the app. `Escape`
  while a modal/search/command/edit mode is active still cancels that mode
  (handled earlier in dispatch, unchanged).

### Opening the detail pane focuses it (fixes the `/`-in-Logs bug)

Today `openDetail()` (and the `l`/`e`/Enter actions in `handleListInput`) open
the pane **without** setting `focus = 'detail'`. Because the Logs-tab input
branch only runs when `focus === 'detail'`, pressing `/` while "viewing logs"
falls through to the **global** `/` handler and opens the resource-list search
instead of the logs search.

**Fix:** opening the detail pane (any path through `openDetail`) sets
`focus = 'detail'`. Consequently the focused-region routing applies and the
Logs tab receives its own keys.

- After this, `Tab` returns focus to the list, etc.
- This makes "the thing I just opened is where my keystrokes go" the rule.

## Where the logic lives (coverage)

`controller.ts` is in `src/adapters/**` (excluded from coverage — thin wiring
only). Per the project bar, the **decisions** must live in pure, fully-covered
modules; the controller only calls them:

- `src/ui/detail-tabs.ts` (new) — navigable tabs per kind; previous/next/jump
  resolution. Pure, 100% covered.
- Region cycling: extend or add a pure helper (e.g. `nextRegion(order, current,
  reverse)` in `src/ui/navigation.ts`) covering the cycle math, replacing the
  inline `cycleFocus` arithmetic. Pure, 100% covered.
- The controller change is limited to: removing the Tab guard, removing the
  four `setFocus` calls on list/detail `←/→`, focusing detail on open, and
  delegating tab navigation to the pure helpers.

BDD coverage (`bun run bdd`) exercises the controller wiring end to end (new
scenarios below).

## Acceptance criteria (given-when-then)

```gherkin
Feature: Region cycling with Tab

  Scenario: Tab cycles forward through all open regions
    Given the detail pane is open
    And the sidebar is focused
    When I press Tab
    Then the list is focused
    When I press Tab
    Then the detail pane is focused
    When I press Tab
    Then the sidebar is focused

  Scenario: Tab works from inside the detail pane
    Given the detail pane is open and focused
    When I press Tab
    Then the sidebar is focused
    And the detail tab did NOT change

  Scenario: Shift+Tab cycles backward
    Given the detail pane is open and the list is focused
    When I press Shift+Tab
    Then the sidebar is focused

  Scenario: Detail is skipped when closed
    Given the detail pane is closed and the list is focused
    When I press Tab
    Then the sidebar is focused
```

```gherkin
Feature: Arrows act within the focused region

  Scenario: List left/right no longer move focus
    Given the list is focused and the detail pane is open
    When I press the right arrow
    Then the list is still focused
    When I press the left arrow
    Then the list is still focused

  Scenario: Detail left/right switch tabs
    Given a Pod's detail pane is open and focused on the Overview tab
    When I press the right arrow
    Then the next navigable tab is active
    When I press the left arrow
    Then the Overview tab is active again

  Scenario: Detail tab wraps around
    Given a Pod's detail pane is focused on the last navigable tab
    When I press the right arrow
    Then the first navigable tab is active

  Scenario: Number keys still jump to a tab
    Given a Pod's detail pane is open and focused
    When I press "3"
    Then the third navigable tab is active

  Scenario: Sidebar arrows unchanged
    Given the sidebar is focused on a collapsed category
    When I press the right arrow
    Then the category expands
    When I press the left arrow
    Then the category collapses
```

```gherkin
Feature: Opening the detail pane focuses it

  Scenario: Logs search is reachable after opening logs
    Given a Pod is selected in the list
    When I press "l" to open its Logs tab
    Then the detail pane is focused
    When I press "/"
    Then the Logs search input is active
    And the resource-list search is NOT active

  Scenario: Enter focuses the detail pane
    Given a resource is selected in the list
    When I press Enter
    Then the detail pane is open and focused
```

```gherkin
Feature: Quit and close-pane

  Scenario: q quits from the list
    Given the list is focused in normal mode
    When I press "q"
    And there are no active port-forwards
    Then the app exits

  Scenario: q quits from the detail pane
    Given the detail pane is open and focused in normal mode
    When I press "q"
    Then the app exits

  Scenario: q is a literal character while typing
    Given the Logs search input is active
    When I press "q"
    Then "q" is appended to the search query
    And the app does NOT exit

  Scenario: Escape closes the detail pane, never quits
    Given the detail pane is open and focused
    When I press Escape
    Then the detail pane closes
    And focus returns to the list
    And the app does NOT exit
```

## Out of scope (handled elsewhere)

- The actual list horizontal-scroll behavior (chunk 05) and detail content
  scrolling (chunk 03) — this chunk only frees `←/→` and `↑/↓` from their old
  focus-moving duties and routes them to the right seams.
- Borders / focus highlighting (chunk 02).
- Help-overlay text reflecting the new keymap (chunk 09).

## Done when

- `Tab`/`Shift+Tab` cycle regions from every region including detail; detail
  tabs never change on `Tab`.
- List `←/→` and detail `←` no longer move focus; detail `←/→` switch tabs;
  `1–6` jump tabs.
- Opening the detail pane focuses it; `/` in the Logs tab opens Logs search.
- `q` quits from every region in normal mode (root-caused so it actually
  exits); `Escape` closes the detail pane and never quits.
- Tab-list and region-cycle logic live in pure, 100%-covered modules; new BDD
  scenarios above pass.
- `bun run gate` is green.
