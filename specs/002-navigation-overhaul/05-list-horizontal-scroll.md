# Chunk 05 — List horizontal scroll

**Status:** DRAFT
**Depends on:** 01 (`←/→` freed to no-ops in the list, ready to wire), 02
(`computeFrame` → `list` `Rect`; the list-fit model amended here)
**Implements / amends:** `specs/001-initial-features/spec-02-navigation-layout.md` (list navigation),
`specs/001-initial-features/spec-03-resource-model.md` / `specs/001-initial-features/spec-04-core-views.md` (resource table).
Update the canonical spec where this changes behavior.

## User story

> As a user looking at a resource list that has more columns than fit on screen
> (Pods alone has status, name, ready, restarts, age, IP, node…), I want to
> **scroll right with `→` to see the rest of the columns and `←` to come back**,
> while the **status dot and Name stay pinned** on the left so I never lose track
> of which row I'm reading.

## Decision (agreed with the user)

**Option A — natural-width horizontal viewport, with pinned leading columns.**
This *supersedes* chunk 02's "squeeze every column to fit / truncate the flex
column" approach (see the chunk-02 amendment below). Columns render at fixed
**natural widths**; their sum may exceed the list pane; the pane is a horizontal
**window** that `←/→` pan. The leading columns (the status dot + `Name`) are
**pinned** and never scroll. Content is **clipped** to the window — it is still
never *wrapped* (chunk 02's anti-wrap guarantee holds; we clip instead of
squeeze).

## How it works today (for the implementer)

- `ResourceTable` (`src/ui/components/ResourceTable.tsx`) resolves each column's
  width via `resolveWidth` — fixed widths pass through; percentage widths
  (`Name: 30%`, `Namespace: 20%`, …, `src/resources/columns.ts`) are taken as a
  fraction of `totalWidth`, so columns reflow to the pane and the row always
  fills exactly the pane width. There is **no** horizontal offset anywhere
  (`grep` for `horizontalScroll`/`colOffset` → nothing).
- `TableModel` (`src/ui/resource-table-model.ts`) carries vertical
  `scrollOffset` only.
- Chunk 01 turned the list `←/→` into no-ops (removed their old focus-moving
  duty); this chunk gives them their real behavior.

## Natural widths (deterministic, no data dependency)

A pure helper computes a **stable** absolute width per column so layout doesn't
jitter as rows arrive or as the user scrolls vertically:

```
naturalWidths(columns, baseline = LIST_BASELINE_WIDTH): number[]
```

- **Fixed** columns (`width: number`) → that number.
- **Percentage** columns (`width: "30%"`) → `floor(pct/100 * baseline)`, where
  `LIST_BASELINE_WIDTH` is a defined constant (proposed **120** — today's
  `ResourceTable` default `totalWidth`). This gives percentage columns a stable
  absolute size independent of the actual pane width.
- Natural widths depend only on the column **definitions**, never on row
  content or the current pane — so they're trivially unit-testable and never
  shift under the user.

The **natural total** for a kind is `Σ naturalWidths`. Horizontal scrolling is
possible exactly when `naturalTotal > list.width`.

## Pinned columns

```
pinnedCount(columns): number   // through the Name column inclusive
```

- Pins the leading columns **up to and including `Name`** — i.e. the status-dot
  column (header `''`, width 2) and `Name`. If a kind has no `Name` column, pin
  only the status column (index 0).
- Pinned columns always render at the left of the pane at their natural widths
  and **never scroll**.

## The horizontal window

A pure helper resolves what to render given the offset:

```
resolveRowWindow(columns, widths, pinnedCount, hOffset, paneWidth): {
  pinned: { col, width }[];                 // always fully shown
  scrollable: { col, width, clip: number }[]; // first/last may be clipped
  leftMore:  boolean;                        // columns hidden to the left
  rightMore: boolean;                        // columns hidden to the right
}
clampHOffset(columns, widths, pinnedCount, paneWidth, desired): number
```

- `hOffset` is a **column index** into the *scrollable* columns (snap to column
  boundaries — headers stay aligned; no mid-column header glyphs). `→` advances
  it, `←` retreats it.
- The scrollable viewport width is `paneWidth − Σ pinnedWidths`. Starting at
  `hOffset`, scrollable columns fill the viewport; the **last** visible column
  may be clipped (right edge), signalling `rightMore`.
- `clampHOffset` forbids scrolling into empty space: the maximum offset is the
  smallest index at which the remaining columns still overflow the viewport (so
  the final column lands flush against the right edge and you can't scroll
  past). Minimum is 0.
- When `naturalTotal ≤ paneWidth`, `hOffset` is pinned at 0, `←/→` are no-ops,
  and rendering matches today (left-aligned natural columns, trailing blank on
  ultra-wide terminals).

### Affordance

When `leftMore`/`rightMore`, render a marker in the **header row**: a `‹` at the
pinned/scrollable boundary when there are columns hidden left, and a `›` at the
right edge when there are columns hidden right (cosmetic glyphs; may be tuned).
Each occupies one cell of the header line only and never shifts data columns.

## State & keybindings

- Add `horizontalOffset: number` to `TableModel` (sibling of `scrollOffset`),
  defaulting to 0.
- `←` → `horizontalOffset = clampHOffset(…, current − 1)`; `→` → `… current + 1`.
  Both clamp; both are no-ops when content fits.
- **Reset to 0** when the active kind changes (different column set) — the
  controller already rebuilds the model on kind change; reset there. The offset
  **persists** across vertical scroll, selection, sort, and search within the
  same kind.

## Where the logic lives (coverage)

- `src/ui/list-horizontal.ts` (new) — pure, **100% covered**: `naturalWidths`,
  `pinnedCount`, `resolveRowWindow`, `clampHOffset`, `LIST_BASELINE_WIDTH`.
  Exhaustively tested across: content narrower than pane (no scroll), exactly
  fitting, wider (scroll), clamp boundaries (offset 0 and max), the "last column
  flush, no empty space" rule, a kind with no `Name` column, and clip widths.
- `ResourceTable` consumes the helper to render `pinned ++ scrollable` with the
  header markers; the selected-row highlight applies to the visible (pinned +
  windowed) cells. Component tests assert: pinned columns always present, the
  windowed columns shift with `horizontalOffset`, the rendered row width ≤
  `list.width`, and no wrap — at representative offsets.
- `controller.ts` (excluded adapter) only updates `horizontalOffset` via the
  clamp helper on `←/→` and resets it on kind change; **no width arithmetic**
  in the controller.

## Acceptance criteria (given-when-then)

```gherkin
Feature: List horizontal scroll with pinned columns

  Scenario: Right arrow reveals later columns
    Given the active kind has more natural column width than the list pane
    And the list is focused at horizontal offset 0
    When I press the right arrow
    Then later columns become visible
    And the status dot and Name columns are still shown on the left

  Scenario: Left arrow returns and clamps at the start
    Given the list is scrolled one column to the right
    When I press the left arrow
    Then the view returns to horizontal offset 0
    When I press the left arrow again
    Then the view stays at offset 0

  Scenario: Right arrow clamps with the last column flush to the edge
    Given the list is focused and scrollable
    When I press the right arrow until it stops advancing
    Then the last column is visible against the right edge
    And there is no blank space scrolled in past the last column

  Scenario: Status and Name stay pinned at every offset
    Given the list is scrolled fully to the right
    Then the status dot and Name columns are still visible on the left

  Scenario: No scroll when everything fits
    Given the active kind's natural column total is narrower than the list pane
    When I press the right arrow
    Then nothing scrolls
    And no left/right "more columns" markers are shown

  Scenario: Offset resets when the kind changes
    Given the list is scrolled to the right for Pods
    When I switch the active kind to Deployments
    Then the new list starts at horizontal offset 0

  Scenario: Offset persists across vertical scroll and selection
    Given the list is scrolled two columns to the right
    When I move the selection down several rows
    Then the horizontal offset is unchanged

  Scenario: No row wraps at any offset
    Given the list is scrolled to an arbitrary offset
    Then no row wraps to a second line
    And the rendered row width is <= the list pane inner width
```

## Out of scope
- Vertical scrolling and selection (unchanged).
- Mouse-driven horizontal scroll (no horizontal wheel handling); `←/→` keys
  only. Wheel routing is chunk 04.
- Per-column resize by the user (only the sidebar/detail split resize, chunk 04).

## Done when
- The list `←/→` keys pan the columns horizontally with the status dot + `Name`
  pinned; offsets clamp at both ends (last column flush, no empty scroll-in);
  reset on kind change; persist across vertical scroll/selection/sort/search.
- Columns render at stable natural widths; when the natural total exceeds the
  pane the view is a horizontal window with `‹`/`›` markers; when it fits there
  is no scroll. Content is clipped, never wrapped, at any offset and any pane
  width.
- All width/window/clamp logic lives in pure, 100%-covered `list-horizontal.ts`;
  no width arithmetic in the controller.
- `bun run gate` is green.
