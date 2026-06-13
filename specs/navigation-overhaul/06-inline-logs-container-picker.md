# Chunk 06 — Logs toolbar: inline dropdowns & accelerators

**Status:** DRAFT
**Depends on:** 02 (`computeFrame` → `detail` `Rect`; the Logs tab renders inside
it), 04 (`<DropdownButton>` / `<Button>` + accelerator convention + the
hit-region registry/overlay layering used to anchor the dropdowns)
**Implements / amends:** `spec/spec-05-logs-exec.md` §3.1 (container selection)
and §3.2 (Logs toolbar). Update it where this changes behavior.

## User story

> As a user opening logs on a multi-container pod, I don't want a full-screen
> modal hijacking the whole UI before I can see anything. I want logs to **start
> immediately on a sensible container**, a small **dropdown under the
> `[Container ▾]` button** to switch containers, a **working line-limit
> dropdown**, and every toolbar control to show **which key triggers it** —
> clickable and keyboard-reachable alike.

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
2. **`<DropdownButton>` (chunk 04)** anchored directly under the `[Co̲ntainer ▾]`
   toolbar button — an overlay on chunk 04's higher layer that floats over the
   log lines (logs keep streaming behind it) and does **not** resize or cover the
   rest of the UI. Unfiltered (container lists are short).
3. **Auto-open only when there is no sensible default** — i.e.
   `defaultIndex === -1` (all containers terminated / waiting). In that one case
   the dropdown opens automatically and no lines stream until the user picks.
   (`buildContainerPicker` already returns `defaultIndex: -1` for this case;
   `options.length === 0` keeps today's "✗ No containers found" hint.)
4. **Accelerator `o` opens the dropdown** — a letter inside "C**o**ntainer",
   rendered underlined (`[Co̲ntainer ▾]`) per chunk 04's accelerator convention.
   This replaces the silent `c` blind-cycle; plain **`c` is reserved for the
   global context switcher** (chunk 08). `n`/`t` were rejected (`n` = global
   namespace picker, `t` = Logs timestamps toggle). The dropdown's primary path
   is the clickable button regardless.

This **whole chunk reworks the Logs toolbar** onto chunk 04's components: the
`[100 l̲ines ▾]` line-limit becomes a working `DropdownButton` too, and the
remaining toggles (pause / timestamps / wrap / download) become accelerator
`<Button>`s with their trigger letters underlined. The generic full-screen
`PickerOverlay` is now used only for the **exec** container selection (out of
scope here); the **namespace** picker moved to a `DropdownButton` in chunk 04.

## Behavior

### Opening logs
- `initLogs` no longer routes through the blocking picker. It computes
  `buildContainerPicker`; if `options.length === 0` → hint and stop; else start
  streaming `options[max(defaultIndex,0)]` immediately. When `defaultIndex < 0`,
  start nothing and set `logs.containerPickerOpen = true`.

### The container dropdown
- New transient state on the logs model: `containerPickerOpen: boolean` and a
  `containerPickerIndex: number` (defaults to the index of the current
  container). It is **separate** from the generic `this.picker` mechanism, and
  drives a chunk-04 `<DropdownButton>` anchored under `[Co̲ntainer ▾]` (its
  measured rect, opening upward if there's no room below).
- Each item shows a **phase dot** (running = green, waiting = yellow,
  terminated = grey), the `label` (already carries `(init)`), and a marker
  (`✓` / accent) on the **current** container. Selecting (click or `Enter`)
  switches the stream and closes the dropdown.

### The line-limit dropdown
- The `[100 l̲ines ▾]` toolbar control becomes a `<DropdownButton>` listing
  `LINE_OPTIONS` (accelerator `l`), replacing the current blind `L`-cycle.
  Selecting an option sets `logs.limit` and restarts the stream (the existing
  `startLogStream` path). Same anchored-overlay behavior as the container
  dropdown.

### The rest of the toolbar
- Pause (`p`), Timestamps (`t`), Wrap (`w`), Download (`d`) render as accelerator
  `<Button>`s with their trigger letter underlined; clicking toggles/fires the
  same action as the key. (Download moves from `D` to lowercase `d`; Previous
  stays `P` — see below.) No behavior change beyond click parity + underlines.

### Keys while a dropdown is open
- `↑`/`↓` (and `j`/`k`) move the selection (clamped); `Enter` selects; `Esc`
  closes without changing anything; a **click outside** closes it (chunk 04's
  overlay backdrop). No type-to-filter (these lists are short).
- The accelerator (`o` container, `l` line-limit) toggles its own dropdown
  open/closed. The old plain-`c` blind-cycle is removed (plain `c` belongs to the
  context switcher, chunk 08).

### What stays the same
- The **previous-instance** logs feature stays on the `P` key + the
  `(previous)` toolbar marker (driven by `hasPrevious`); it is **not** a dropdown
  entry. (It keeps the shifted key — it's a modal reload, not a toolbar pick.)
- `buildContainerPicker` and `ContainerOption`/`PickerResult`
  (`src/logs/container-picker.ts`) are unchanged — only how the result is
  presented changes.

## Where the logic lives (coverage)

- The dropdowns reuse chunk 04's `<DropdownButton>` — no bespoke dropdown
  component. The container/line-limit specifics are pure **item builders**:
  - `src/ui/logs-toolbar.ts` (new) — pure, **100% covered**:
    `buildContainerItems(options, currentName)` → dropdown items (label, phase
    dot color, `(init)`, current marker) and `buildLineLimitItems(current)`;
    plus the toolbar's accelerator map. Frame-tested for single/multiple
    containers, init containers, terminated/waiting phases, and current-marker
    placement.
  - `src/ui/container-phase.ts` (new, or co-located) — pure
    `containerPhaseColor(phase): InkColor`; 100% covered.
- Index movement reuses the pure clamp helper from chunk 01
  (`src/ui/navigation.ts`); no new arithmetic in the controller.
- `controller.ts` (excluded adapter) only: starts the default stream, toggles
  the dropdown-open flags, moves the selection via the pure helper, and applies
  the chosen container/line-limit (reusing the existing switch paths). The
  full-screen `openPicker` call for logs is removed.
- Anchoring/measuring the trigger buttons and the accelerator wiring are chunk
  04's machinery — thin adapter glue.

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
    When I click the [Container ▾] button
    Then a dropdown opens anchored under it
    And the rest of the UI is still visible (not a full-screen modal)

  Scenario: The accelerator o opens the dropdown
    Given the Logs tab is focused and streaming
    When I press "o"
    Then the container dropdown opens
    And the "o" in "[Container ▾]" is rendered underlined

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

```gherkin
Feature: Line-limit dropdown and toolbar accelerators

  Scenario: The line-limit control opens a dropdown
    Given the Logs tab is streaming
    When I click the [100 lines ▾] button (or press "l")
    Then a dropdown of line-limit options opens anchored under it

  Scenario: Choosing a line limit restarts the stream
    Given the line-limit dropdown is open
    When I choose "1000 lines"
    Then the stream restarts with a 1000-line limit
    And the toolbar shows "[1000 lines ▾]"

  Scenario: Toolbar toggles work by accelerator and by click
    Given the Logs tab is focused
    When I press "t"
    Then timestamps toggle
    When I click the [Timestamps] button
    Then timestamps toggle back
    And each toolbar button shows its accelerator letter underlined
```

## Out of scope
- The **exec** container selection — it keeps the generic full-screen
  `PickerOverlay` for now. (The **namespace** picker is handled in chunk 04 as a
  filterable `DropdownButton`.)
- The previous-instance toggle (`P`) — unchanged.
- Detail-content scrolling of the log lines themselves (chunk 03).

## Done when
- Opening logs on a multi-container pod streams the default container
  immediately with **no full-screen modal**; the all-terminated case auto-opens
  the inline dropdown; the no-containers case hints and stops.
- `[Co̲ntainer ▾]` and `[100 l̲ines ▾]` are `DropdownButton`s (accelerators `o`
  and `l`, underlined) anchored under their triggers; plain `c` is left for the
  context switcher; ↑/↓/Enter/Esc and click work; outside clicks close them; the
  dropdowns float over the logs without covering the UI.
- The container dropdown shows phase dots + `(init)` labels and marks the
  current container; selecting switches the stream. The line-limit dropdown sets
  the limit and restarts the stream. Pause/timestamps/wrap/download are
  accelerator `<Button>`s (click parity + underlined letters).
- The toolbar item builders + phase-color logic live in pure, 100%-covered
  modules; the logs container path no longer calls the full-screen `openPicker`.
- `bun run gate` is green.
