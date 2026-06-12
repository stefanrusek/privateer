# Chunk 03 — Detail scroll viewport

**Status:** DRAFT
**Depends on:** 01 (detail focus + arrow routing seam), 02 (detail inner
height/width from `computeFrame`)
**Implements / amends:** `spec/spec-04-core-views.md` (detail pane),
`spec/spec-05-actions.md` (logs). Update where this changes behavior.

## User story

> As a user, when a detail tab's content is taller than the pane, I want to
> **scroll it** — with `↑/↓`, PageUp/PageDown, Home/End, and the mouse wheel —
> instead of having it silently clipped. In the Logs tab, scrolling up should
> **pause the live tail** and let me read back through history; returning to the
> bottom should **resume** the tail.

## Today

Each tab renders its whole content into a `<Box>`; `LiveApp` wraps the detail
region in `<Box height={detailRows} overflow="hidden">` (LiveApp.tsx ~347), so
content taller than the pane is **clipped with no way to scroll**. The detail
tabs hold **no scroll state**. Logs always shows the last ~200 lines
(`LOGS_VIEW_LINES`) and auto-tails; there is no history scrollback.

## Model — a generic detail viewport

Treat each read-only detail tab's content as an **ordered list of visual lines**
and show a window into it.

### Content as visual lines

Each in-scope tab projects its content to `readonly ViewLine[]`, where a
`ViewLine` carries the text plus its styling (color/bold/dim) so styling is
preserved through the viewport:

- **YAML**, **Logs** — already line-oriented.
- **Events**, **Overview**, **Metrics**, — flatten their structured rows/chart
  lines into one `ViewLine` per visual row.

Lines are projected at the detail pane's **inner width** (`detail.width` from
chunk 02). Where a tab wants wrapping (e.g. Logs with `wrap` on), it pre-wraps
into multiple `ViewLine`s so the viewport always operates on **visual rows**
(never re-wrapped by Ink). Where a tab truncates (e.g. YAML long lines without
wrap), it truncates to `detail.width`.

### The viewport (pure)

A pure module `src/ui/scroll-viewport.ts` owns the math:

```
interface ScrollState { offset: number; }   // 0 = top

clampOffset(offset, totalLines, viewportHeight): number
visibleSlice(lines, offset, viewportHeight): ViewLine[]
scrollBy(state, delta, totalLines, viewportHeight): ScrollState   // line(s)
pageBy(state, dir, totalLines, viewportHeight): ScrollState        // by height-1
toTop(...) / toBottom(...): ScrollState
scrollbar(offset, totalLines, viewportHeight): { thumbStart, thumbSize } | null
atBottom(offset, totalLines, viewportHeight): boolean
```

- `viewportHeight = detail.height − 1` (the tab bar occupies the top row of the
  detail region).
- Offsets always clamp to `[0, max(0, totalLines − viewportHeight)]`.
- A **scroll indicator** is shown whenever `totalLines > viewportHeight`: a
  one-column scrollbar thumb in a right gutter (or, minimally, `↑`/`↓` "more"
  markers). Position derives from `scrollbar()`.

### Controller wiring

- The controller holds the detail scroll **offset** (and knows `totalLines`
  via the active tab's projected line count and `viewportHeight` via
  `computeFrame`).
- **Reset offset to top (or bottom for Logs) when the active tab or the
  selected resource changes.**
- Key routing (detail focused, normal mode — the seam opened in chunk 01):
  - `↑`/`↓` → `scrollBy(±1)`
  - `PageUp`/`PageDown` → `pageBy`
  - `Home`/`End` (and `g`/`G` for vi-style) → `toTop`/`toBottom`
  - Mouse wheel over the detail region → `scrollBy(±N)` (wired in chunk 04;
    it calls the same module).
- Tab-switch keys (`←/→`, `1–6`) and Logs' own letter keys keep working
  (chunk 01); only otherwise-unhandled motion keys drive the viewport.

## Logs: pause/resume on scroll

The Logs tab streams into a 10 000-line `RingBuffer`. Replace the fixed
"last 200 lines, always tailing" view with the viewport:

- **Live (offset at bottom):** the viewport is pinned to the newest lines;
  `logs.live === true`; new lines keep it pinned to the bottom.
- **Scrolling up** (`↑`/PageUp/wheel-up) moves the offset back into history and
  **sets `logs.live = false`** (paused). The existing "N new lines" badge
  (`logs.newLines`) counts lines that arrive while paused.
- **Returning to the bottom** (`End`/`G`, or scrolling down past the last line)
  **sets `logs.live = true`** and resumes tailing; `newLines` resets to 0.
- The manual pause toggle `p` (handleLogsInput, controller.ts ~2428) still
  works and is consistent with this: `p` to pause leaves the offset where it is;
  `p` to resume jumps to the bottom.
- The `wrap` toggle (`w`) re-projects lines (wrapped vs truncated); after a wrap
  change, re-clamp the offset.
- Logs search (`/`, `n`/`N`) should **scroll the viewport to the current
  match** so matches are visible (uses the same offset).

## Out of scope

- **Agent tab** keeps its own input/transcript behavior (it is interactive);
  this chunk covers overview / yaml / events / metrics / logs.
- **YAML edit mode** — the editor (chunk 07) manages its own cursor and
  scrolling; this chunk covers YAML in read mode only.
- Mouse-wheel event plumbing itself — chunk 04 (this chunk exposes the
  `scrollBy` entry point the wheel handler calls).

## Where the logic lives (coverage)

- `src/ui/scroll-viewport.ts` — pure, **100% covered** (clamping, paging,
  scrollbar math, `atBottom`, empty/short/tall content, viewportHeight ≤ 0
  edge cases).
- Per-tab `ViewLine` projection — pure helpers, covered by unit + frame tests
  (assert line counts and that no line exceeds `detail.width`).
- Logs pause/resume offset↔`live` coupling — covered by controller-level unit
  tests on the pure logs-view builder; BDD scenario for the end-to-end feel.
- `controller.ts` (excluded adapter) only stores the offset and calls the pure
  helpers.

## Acceptance criteria (given-when-then)

```gherkin
Feature: Detail content scrolls

  Scenario: Arrow keys scroll a tall tab
    Given a resource's YAML tab is open and focused
    And the YAML is taller than the detail pane
    When I press the down arrow
    Then the content scrolls down by one line
    When I press PageDown
    Then the content scrolls down by about one pane height
    When I press End
    Then the last line is visible
    When I press Home
    Then the first line is visible

  Scenario: Scroll indicator appears only when needed
    Given a detail tab whose content fits the pane
    Then no scroll indicator is shown
    Given a detail tab whose content exceeds the pane
    Then a scroll indicator shows the current position

  Scenario: Offset resets when switching tabs
    Given a tab scrolled to the middle
    When I switch to another tab
    Then the new tab starts at its top (Logs starts at its bottom)
```

```gherkin
Feature: Logs pause/resume on scroll

  Scenario: Scrolling up pauses the tail
    Given the Logs tab is focused and live
    When I scroll up into history
    Then the tail is paused
    And newly arriving lines increment the "new lines" badge without moving the view

  Scenario: Returning to the bottom resumes the tail
    Given the Logs tab is paused and scrolled into history
    When I press End
    Then the tail resumes
    And the newest lines are shown
    And the "new lines" badge resets to 0

  Scenario: Search scrolls to the match
    Given the Logs tab has a search query with matches off-screen
    When I jump to the next match with "n"
    Then the viewport scrolls so the current match is visible
```

## Done when

- Every in-scope detail tab scrolls via `↑/↓`, PageUp/PageDown, Home/End
  (and `g`/`G`); a scroll indicator shows position when content exceeds the
  pane; nothing is silently clipped.
- Logs scroll-up pauses the tail and walks the ring buffer; End/scroll-to-
  bottom resumes; search scrolls to the current match.
- `src/ui/scroll-viewport.ts` and the line-projection helpers are pure and
  100% covered; BDD scenarios pass.
- `bun run gate` is green.
