# Chunk 04 — Mouse: wheel, drag-resize, header clicks

**Status:** DRAFT
**Depends on:** 02 (`computeFrame` Rects, handle segments, header sub-region
coords), 03 (detail `scrollBy` entry point)
**Implements / amends:** `spec/spec-02-navigation-layout.md` (mouse). Update
where this changes behavior.

## User stories

> As a user, the mouse wheel should scroll **whatever my cursor is over** — the
> detail pane when I'm over it, the list when I'm over the list, the sidebar
> when I'm over the sidebar.

> As a user, I want to **drag the visible border lines** to resize the panes
> (sidebar width and the list/detail split), because today's drag handle is
> invisible and I can't find it.

> As a user, I want to **click the context** to switch context and **click the
> namespace** to change namespace.

## Today (all ad-hoc; to be replaced)

- `handleMouseClick` (controller.ts ~2739) hard-codes `contentTop = 2`,
  hit-tests `x <= sidebarWidthCols()` for the sidebar, then derives `listRows`
  from `verticalRatio` to split list/detail, and maps list rows by
  `y − contentTop − 1 + scrollOffset`.
- `handleMouseScroll` (~2896) checks **only `x`** (sidebar vs right) and always
  scrolls the sidebar or the list — never the detail pane, even when the cursor
  is over it. **This is the bug** behind "wheel scrolls the pod list while the
  detail pane is focused."
- `handleMouseDrag` (~2870) tracks an **invisible** splitter at
  `splitterRow() = 2 + listRows` with a ±1 tolerance, adjusts only
  `verticalRatio`, and has **no horizontal (sidebar) resize**.
- `clickDetailTabBar` (~2829) maps tab clicks using `sidebarWidthCols() + 1` as
  the origin; the `✕` close button is rendered but **not clickable**.
- MouseRouter (LiveApp.tsx ~23) sets mouse modes (`1003l 1015l 1002h`), routes
  `click`/`scroll` from ink-mouse, and parses SGR **drag** (button 32) + release
  straight off stdin. **Keep this plumbing**; only the geometry it feeds changes.

With borders (chunk 02) the row/column offsets shift (the frame's cells start
inside their borders), so the inline arithmetic is now wrong as well as
duplicated. Everything must derive from `computeFrame`.

## Single hit-test (pure)

Add `src/ui/hit-test.ts` (pure, 100% covered) consuming the chunk-02 frame:

```
hitTest(frame, x, y):
  | { region: 'header', part: 'context' | 'namespace' | 'search' | 'other' }
  | { region: 'sidebar', rowInContent: number }
  | { region: 'list',    rowInContent: number }   // -1 = header/blank row
  | { region: 'detail',  rowInContent: number, onTabBar: boolean }
  | { region: 'commandBar' }
  | { region: 'sidebarHandle' }     // the sidebar│right vertical line (+tolerance)
  | { region: 'verticalHandle' }    // the list│detail line (+tolerance)
  | { region: 'border' | 'none' }

sidebarRatioFromX(frame, x): number   // clamped to [MIN, MAX]
verticalRatioFromY(frame, y): number  // clamped to [0.2, 0.8]
```

- `rowInContent` is relative to each region's inner `Rect` (so list-row mapping
  becomes `rowInContent + table.scrollOffset`, with no magic `−1`/`−2`).
- Handle hit-testing includes a small tolerance (±1 cell) so the thin lines are
  easy to grab.
- Header parts derive from the context/namespace coordinate ranges chunk 02
  exposes.

The controller's `handleMouseClick` / `handleMouseScroll` / `handleMouseDrag`
become thin wrappers that call `hitTest` and dispatch. No geometry arithmetic
remains in `controller.ts`.

## Wheel routing by geometry (the bug fix)

`handleMouseScroll(x, y, direction)` (extend the signature to carry `y`; the
MouseRouter already has `position.y`):

- `hitTest` → **sidebar**: move the sidebar cursor (as today).
- → **list**: move the list selection / scroll (as today).
- → **detail**: scroll the detail viewport by `±WHEEL_LINES` (proposed 3) via
  the chunk-03 `scrollBy` — including Logs pause/resume coupling.
- → **header / commandBar / border / none**: ignored.

Routing is **purely by cursor position**, independent of which region has
keyboard focus.

## Drag-resize on the border handles

Replace the invisible-splitter logic. On SGR drag (button 32):

- On drag **start**, `hitTest` the press point:
  - `sidebarHandle` → begin a **horizontal** resize; while dragging, set
    `sidebarRatio = sidebarRatioFromX(frame, x)`.
  - `verticalHandle` → begin a **vertical** resize; while dragging, set
    `verticalRatio = verticalRatioFromY(frame, y)` (only when detail is open).
  - otherwise → ignore the drag.
- Latch the active handle for the duration of the drag (don't re-hit-test each
  motion event — once grabbed, keep resizing that axis until release), so the
  drag doesn't "slip" off the thin line.
- On **release**, stop; persist via `saveLayout()` (as today).
- **Affordance:** while a handle is grabbed (and optionally on hover), render
  that border segment highlighted (accent) so the user sees what they're
  dragging. (Cosmetic; the frame already supports per-segment accent.)
- Both axes clamp (sidebar to its min/max; vertical 0.2–0.8).

## Header & detail clicks

- Click **context** part → open the context switcher
  (`contextSwitcherOpen = true`).
- Click **namespace** part → open the namespace picker (`openNamespacePicker`).
- Click **search** part → focus search (`mode: 'search'`).
- Click **detail tab bar** (`onTabBar`) → switch to the clicked tab (rewrite
  `clickDetailTabBar` to use `frame.detail.x` as origin) and focus detail.
- Click the **`✕`** close button (a known x-range at the end of the tab bar) →
  **close the detail pane** (newly wired).
- Click within a region's content → focus that region (and select the list row /
  sidebar entry as today). Second click on the selected list row still opens
  the detail pane.
- Click **command bar** → focus the agent input (as today).

## Where the logic lives (coverage)

- `src/ui/hit-test.ts` — pure, **100% covered**: region resolution for points
  across the whole frame (corners, borders, handles with tolerance, header
  parts), and the ratio-from-coordinate math with clamping.
- `controller.ts` (excluded adapter) holds only the drag-latch flag and the
  thin dispatch; it performs **no** geometry arithmetic.
- BDD scenarios cover the end-to-end mouse behaviors below.

## Acceptance criteria (given-when-then)

```gherkin
Feature: Wheel routes by cursor position

  Scenario: Wheel over the detail pane scrolls the detail content
    Given the detail pane is open and the list is focused
    When I scroll the wheel with the cursor over the detail pane
    Then the detail content scrolls
    And the list selection does NOT move

  Scenario: Wheel over the list scrolls the list
    Given the detail pane is open and focused
    When I scroll the wheel with the cursor over the list
    Then the list scrolls
    And the detail content does NOT move

  Scenario: Wheel over the sidebar scrolls the sidebar
    When I scroll the wheel with the cursor over the sidebar
    Then the sidebar cursor moves
```

```gherkin
Feature: Drag-resize via border handles

  Scenario: Drag the sidebar border to resize horizontally
    When I press on the sidebar│right border line and drag right
    Then the sidebar widens
    And the new sidebarRatio is persisted on release

  Scenario: Drag the list/detail border to resize vertically
    Given the detail pane is open
    When I press on the list│detail border line and drag down
    Then the list grows and the detail shrinks
    And the new verticalRatio is persisted on release

  Scenario: A grabbed handle does not slip
    Given I have grabbed the list│detail border
    When my drag wanders a column left or right
    Then I am still resizing vertically until I release
```

```gherkin
Feature: Header and detail clicks

  Scenario: Click the context opens the switcher
    When I click the context in the header
    Then the context switcher opens

  Scenario: Click the namespace opens the picker
    When I click the namespace in the header
    Then the namespace picker opens

  Scenario: Click a detail tab switches to it
    Given the detail pane is open
    When I click the "YAML" tab in the tab bar
    Then the YAML tab is active and the detail pane is focused

  Scenario: Click the close button closes the pane
    Given the detail pane is open
    When I click the ✕ in the tab bar
    Then the detail pane closes
```

## Out of scope

- The frame geometry itself (chunk 02) and the detail viewport math (chunk 03);
  this chunk only hit-tests and dispatches into them.
- Any change to mouse-mode setup / SGR parsing in MouseRouter (kept as-is).

## Done when

- The wheel scrolls the region under the cursor (detail included), independent
  of focus.
- The two visible border lines are drag handles: sidebar│right resizes width,
  list│detail resizes the split; ratios persist; a grabbed handle latches.
- Clicking the context/namespace opens the right dialog; clicking a detail tab
  switches it; clicking `✕` closes the pane; clicks focus/select as before.
- All mouse hit-testing derives from `computeFrame` via a pure, 100%-covered
  `hit-test.ts`; no geometry arithmetic remains in the mouse handlers.
- `bun run gate` is green.
