# Chunk 06 — Inline Logs container picker

**Status:** DRAFT
**Depends on:** 02 (`computeFrame` → `detail` `Rect`; the Logs tab renders inside
it), 04 (`<Button>` + the hit-region registry/overlay layering used to anchor
the dropdown)
**Implements / amends:** `spec/spec-05-logs-exec.md` §3.1 (container selection).
Update it where this changes behavior.

## User story

> As a user opening logs on a multi-container pod, I don't want a full-screen
> modal hijacking the whole UI before I can see anything. I want logs to **start
> immediately on a sensible container**, and I want a small **dropdown under the
> `[container ▾]` button** to switch containers — clickable, and reachable from
> the keyboard.

## The bug being fixed

Opening logs on a multi-container pod calls `pickContainer`
(controller.ts ~3039) → `openPicker` → the **generic full-screen
`PickerOverlay`**, which LiveApp.tsx (~296) renders via an early `return` that
**replaces the entire screen** until a choice is made. Streaming only starts
afterward. Separately the `c` key (`handleLogsInput`, controller.ts ~2463)
**blind-cycles** to the next container with no UI, and the toolbar's
`[container ▾]` is purely decorative. So today there is *no* in-context way to
see and pick a container — only a screen-stealing modal on first open and a
silent cycle afterward.

## Decision (agreed with the user)

**Option 1 — open the default immediately; switch via an inline dropdown.**

1. **No blocking full-screen picker for logs.** Opening logs starts streaming
   the **default container** right away — `buildContainerPicker(...).defaultIndex`
   (first running container, or the first container). This amends Spec 05 §3.1:
   "multiple containers → picker" becomes "stream the default, switch inline."
2. **Inline dropdown** anchored directly under the `[container ▾]` toolbar
   button, rendered as an **overlay on chunk 04's higher layer** — it floats over
   the log lines (logs keep streaming behind it) and does **not** resize or
   cover the rest of the UI. Items are `<Button>`s.
3. **Auto-open only when there is no sensible default** — i.e.
   `defaultIndex === -1` (all containers terminated / waiting). In that one case
   the dropdown opens automatically and no lines stream until the user picks.
   (`buildContainerPicker` already returns `defaultIndex: -1` for this case;
   `options.length === 0` keeps today's "✗ No containers found" hint.)
4. **Shift+`C` opens the dropdown** (replacing the silent `c` blind-cycle), so
   keyboard users get the same discoverable picker the clickable button gives
   mouse users. Plain **`c` is reserved for the global context switcher**
   (chunk 08), so the container opener is the shifted key; the dropdown's primary
   path is the clickable `[container ▾]` button regardless.

The generic full-screen `PickerOverlay` stays in place for the **namespace
picker** and the **exec** container selection — those are out of scope here.

## Behavior

### Opening logs
- `initLogs` no longer routes through the blocking picker. It computes
  `buildContainerPicker`; if `options.length === 0` → hint and stop; else start
  streaming `options[max(defaultIndex,0)]` immediately. When `defaultIndex < 0`,
  start nothing and set `logs.containerPickerOpen = true`.

### The dropdown
- New transient state on the logs model: `containerPickerOpen: boolean` and a
  `containerPickerIndex: number` (defaults to the index of the current
  container). It is **separate** from the generic `this.picker` mechanism.
- Anchored under the `[container ▾]` button (its measured rect, via chunk 04).
  If there isn't room below (button near the bottom of the detail pane), it
  opens **upward**; width fits the longest label; height caps at a few rows and
  scrolls if a pod somehow has many containers.
- Each row is a `<Button>` showing: a **phase dot** (running = green, waiting =
  yellow, terminated = grey), the `label` (already carries `(init)`), and a
  marker (e.g. `✓` / accent) on the **current** container. Selecting a row (click
  or Enter) switches the stream to that container and closes the dropdown.

### Keys while the dropdown is open
- `↑`/`↓` (and `j`/`k`) move `containerPickerIndex` (clamped); `Enter` selects;
  `Esc` closes without changing the container; a **click outside** the dropdown
  closes it (chunk 04's overlay backdrop). No type-to-filter (container lists are
  short).
- Shift+`C` toggles the dropdown open/closed. The old plain-`c` blind-cycle is
  removed (plain `c` belongs to the context switcher, chunk 08).

### What stays the same
- The **previous-instance** logs feature stays on the `P` key + the
  `(previous)` toolbar marker (driven by `hasPrevious`); it is **not** a dropdown
  entry.
- `buildContainerPicker` and `ContainerOption`/`PickerResult`
  (`src/logs/container-picker.ts`) are unchanged — only how the result is
  presented changes.

## Where the logic lives (coverage)

- `src/ui/components/ContainerDropdown.tsx` (new) — pure, **100% covered**:
  given `{ options, currentName, selectedIndex, onSelect }`, renders the anchored
  list of `<Button>`s with phase dots, `(init)` labels, and the current-container
  marker. Frame-tested for: single vs multiple containers, init containers,
  terminated/waiting phases, and the current marker placement.
- `src/ui/container-phase.ts` (new, or co-located) — pure
  `containerPhaseColor(phase): InkColor` mapping; 100% covered.
- Index movement reuses the pure clamp/cycle helper from chunk 01
  (`src/ui/navigation.ts`); no new arithmetic in the controller.
- `controller.ts` (excluded adapter) only: starts the default stream, toggles
  `containerPickerOpen`, moves `containerPickerIndex` via the pure helper, and
  applies the chosen container (reusing the existing container-switch path that
  `c` used). The full-screen `openPicker` call for logs is removed.
- Anchoring (measuring the `[container ▾]` button's rect, choosing up/down) is
  chunk 04's registry/measure machinery — thin adapter glue.

## Acceptance criteria (given-when-then)

```gherkin
Feature: Logs open without a full-screen modal

  Scenario: Multi-container pod streams the default immediately
    Given a pod with two running containers
    When I open its Logs tab
    Then logs stream from the first running container right away
    And no full-screen picker is shown

  Scenario: All-terminated pod auto-opens the inline dropdown
    Given a pod whose containers have all terminated
    When I open its Logs tab
    Then the container dropdown opens inline under the [container ▾] button
    And no lines stream until I choose a container

  Scenario: Pod with no containers shows a hint
    Given a pod body with no container statuses
    When I open its Logs tab
    Then the hint "✗ No containers found" is shown
    And no dropdown opens
```

```gherkin
Feature: Inline container dropdown

  Scenario: Clicking the container button opens the dropdown
    Given the Logs tab is streaming
    When I click the [container ▾] button
    Then a dropdown opens anchored under it
    And the rest of the UI is still visible (not a full-screen modal)

  Scenario: Shift+C opens the dropdown
    Given the Logs tab is focused and streaming
    When I press "C"
    Then the container dropdown opens

  Scenario: Plain c does not open the dropdown
    Given the Logs tab is focused and streaming
    When I press "c"
    Then the container dropdown does NOT open
    And the keystroke is left for the global context switcher

  Scenario: Selecting a container switches the stream
    Given the container dropdown is open
    When I click a different container entry
    Then the log stream switches to that container
    And the dropdown closes

  Scenario: Keyboard selection
    Given the container dropdown is open
    When I press the down arrow and then Enter
    Then the highlighted container becomes the active stream
    And the dropdown closes

  Scenario: Escape closes without changing the container
    Given the container dropdown is open on a non-current entry
    When I press Escape
    Then the dropdown closes
    And the streamed container is unchanged

  Scenario: The dropdown shows phase and marks the current container
    Given a pod with one running and one terminated container
    When the dropdown is open
    Then the running container shows a green dot and the terminated one a grey dot
    And the currently streamed container is marked
```

## Out of scope
- The line-limit `[… ▾]` dropdown (same inline pattern can be reused later) and
  the Download/Timestamps/Wrap toolbar toggles.
- The **namespace** picker and the **exec** container selection — they keep the
  generic full-screen `PickerOverlay` for now.
- The previous-instance toggle (`P`) — unchanged.

## Done when
- Opening logs on a multi-container pod streams the default container
  immediately with **no full-screen modal**; the all-terminated case auto-opens
  the inline dropdown; the no-containers case hints and stops.
- `[container ▾]` is a clickable `<Button>` that opens an inline dropdown
  anchored under it; Shift+`C` opens it too (plain `c` is left for the context
  switcher); ↑/↓/Enter/Esc and click work; outside clicks close it; the dropdown
  floats over the logs without covering the UI.
- The dropdown shows phase dots + `(init)` labels and marks the current
  container; selecting switches the stream.
- Dropdown rendering + phase-color logic live in pure, 100%-covered modules; the
  logs container path no longer calls the full-screen `openPicker`.
- `bun run gate` is green.
