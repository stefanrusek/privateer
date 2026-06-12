# Chunk 02 — Region chrome & layout math

**Status:** DRAFT
**Depends on:** —
**Implements / amends:** `spec/spec-02-navigation-layout.md` (layout, regions,
sizing). Update that canonical spec where this changes it.

## User stories

> As a user, I always want to see **which region is focused**, with a clear
> bordered box and a title on each region, so navigation never feels
> ambiguous.

> As a user, I never want the resource list, the detail divider, or the metrics
> charts to **wrap by a character** or spill past their pane at any terminal
> size or when the detail pane opens.

## Two problems, one root cause

There is no single source of truth for region geometry. Several places compute
widths/heights independently and disagree by a column or more:

- `controller.tableWidth()` (controller.ts ~635) returns
  `max(60, columns − sidebar − 2)`. The `max(60, …)` floor can exceed the
  **real** list-pane width on narrow terminals or with a wide sidebar, so the
  table renders one (or more) columns wider than its pane → **the list wraps by
  one char**.
- The detail divider is `'╌'.repeat(max(10, termCols − 36))` (LiveApp.tsx
  ~349) — sized to the **whole terminal** minus a magic 36, not the detail
  pane's inner width → it **wraps when the detail pane opens**.
- The metrics charts render at a hard-coded `CHART_WIDTH = 64`
  (MetricsTab.tsx ~110/129) regardless of pane width → **every chart line
  wraps** whenever the detail pane is narrower than 64 columns.
- `controller.sidebarWidthCols()` and `AppRoot`'s sidebar width are computed
  with the same formula in two places (controller.ts ~2702, AppRoot.tsx ~67) —
  duplication that must not drift.

Adding borders (below) consumes columns and rows, which would make all of this
worse — so we centralize the math **and** add borders in this chunk.

## Part A — Region chrome (borders + titles + focus highlight)

The three Tab-cycle regions — **sidebar, list, detail** — each render inside a
bordered box with a **title** in the top border, at all times.

- **Focused region:** highlighted border (a single accent color, e.g. `cyan`)
  and a **bold** title.
- **Unfocused regions:** dim border and dim title.
- **Changing focus changes only styling, never dimensions** — no region grows,
  shrinks, or reflows when focus moves. (This is why borders are always
  present, even when unfocused.)

Titles:

| Region | Title content |
|--------|---------------|
| Sidebar | `Resources` |
| List | active kind + count, e.g. `Pods (12)`; with namespace when set, e.g. `Pods · default (12)` |
| Detail | resource kind + name, e.g. `Pod · web-7d9` |

The **header** (namespace/search row) and the **command bar** remain
full-width single-line chrome **outside** the three bordered regions, unchanged.

> Border style: `borderStyle="round"`, accent color `cyan` for the focused
> region, default/`gray` dim for the others. These are the proposed defaults;
> they are cosmetic and may be tuned during implementation without a spec
> change.

## Part B — Single source of truth for geometry

Introduce a **pure, 100%-covered** module `src/ui/layout-geometry.ts`:

```
computeLayout(input: {
  columns: number;       // terminal columns
  rows: number;          // terminal rows
  sidebarRatio: number;
  verticalRatio: number; // detail pane's share of the list+detail split
  showDetail: boolean;
}): {
  sidebar: Rect;   // { x, y, width, height } — INNER content area (inside border)
  list:    Rect;
  detail:  Rect | null;  // null when showDetail is false
}
```

Rules the module encodes:

- Each bordered box consumes **1 column on each side** and **1 row top and
  bottom**; the title lives in the top border row (no extra row).
- `Rect.width`/`Rect.height` are the **inner** content dimensions (what the
  content may use without wrapping). `Rect.x`/`Rect.y` are absolute terminal
  coordinates of the inner top-left (these feed mouse hit-testing in chunk 04).
- Sidebar outer width = `max(MIN_SIDEBAR, round(sidebarRatio × columns))`.
- The list + detail share the right column vertically by `verticalRatio` (the
  detail pane's share), matching today's `verticalRatio` semantics
  (clamped 0.2–0.8); each gets its own border.
- **No magic floors that exceed the real pane.** When the terminal is too small
  to show meaningful content, the inner dimensions clamp toward a minimum and
  content is **truncated**, never wrapped. (A `max(60, …)`-style floor that can
  exceed the available width is forbidden.)
- Degrade gracefully at extreme sizes (tiny terminals): inner dimensions never
  go negative; minimums defined and unit-tested.

All consumers derive from `computeLayout`:

- `controller.tableWidth()` → `list.width`.
- `controller.visibleHeight()` → `list.height`.
- `AppRoot`/`LiveApp` box `width`/`height` props for each region.
- The detail divider (if kept) sizes to `detail.width` — or is removed in
  favor of the bordered chrome + tab bar.
- `MetricsTab` receives an available width and sizes charts to it (see Part C).
- `controller.sidebarWidthCols()` and AppRoot's sidebar width both call the
  module — the formula exists in exactly one place.

## Part C — Content fits its pane (the wrap fixes)

1. **Resource list:** `ResourceTable` is given `totalWidth = list.width`
   exactly. Column-width resolution (`resolveWidth`, ResourceTable.tsx ~39)
   must guarantee the **sum of resolved column widths is ≤ `totalWidth`** at
   every width — distribute any rounding remainder rather than letting floors
   drift, and truncate the last/flex column if needed. Result: the list never
   wraps and never spills, with detail open or closed.

2. **Metrics charts:** thread the detail pane's inner width into `MetricsTab`
   and replace the hard-coded `CHART_WIDTH = 64` with
   `min(available, MAX_CHART_WIDTH)` where `available` derives from
   `detail.width` (minus any title gutter). Charts and their text lines must
   fit within `detail.width`. `renderTimeseriesChart({ width })` is already
   width-parameterized — feed it the computed width.

3. **Detail divider / dividers:** any decorative rule (`╌` etc.) sizes to
   `detail.width`, or is dropped in favor of the bordered chrome.

## Where the logic lives (coverage)

- `src/ui/layout-geometry.ts` — pure, **100% covered** (lines/branches/
  functions/statements), exhaustively unit-tested across terminal sizes
  (tiny, typical, ultra-wide), both `showDetail` states, and the
  `sidebarRatio`/`verticalRatio` clamp boundaries.
- `ResourceTable` width distribution — pure component logic, covered by frame
  tests asserting total rendered width ≤ pane and no wrap.
- `MetricsTab` chart-width selection — covered by frame tests.
- `controller.ts` (excluded adapter) only calls `computeLayout` and passes
  widths through; it must contain no geometry arithmetic of its own.

## Acceptance criteria (given-when-then)

```gherkin
Feature: Region chrome and focus indicator

  Scenario: All three regions are bordered and titled
    Given the detail pane is open
    Then the sidebar, list, and detail regions each render a border and a title

  Scenario: Focus is shown without moving anything
    Given the list is focused
    Then the list's border and title are highlighted
    And the sidebar and detail borders are dim
    When I press Tab to focus the detail pane
    Then the detail border/title become highlighted and the list's dim
    And every region keeps the exact same width and height as before
```

```gherkin
Feature: Content never wraps

  Scenario Outline: List fits its pane at any size
    Given the terminal is <cols>x<rows>
    And the active kind is "Pod"
    When the list renders with the detail pane <detail>
    Then no list row wraps to a second line
    And the total rendered list width is <= the list pane inner width

    Examples:
      | cols | rows | detail  |
      | 80   | 24   | closed  |
      | 80   | 24   | open    |
      | 120  | 40   | open    |
      | 200  | 50   | open    |
      | 60   | 20   | open    |

  Scenario: Metrics charts fit the detail pane
    Given a Pod's detail pane is open on the Metrics tab
    And the detail pane inner width is 48 columns
    Then every metrics chart line is <= 48 columns wide
    And no chart line wraps

  Scenario: Detail divider fits the detail pane
    Given the detail pane is open
    Then any divider rule is <= the detail pane inner width
    And it does not wrap
```

```gherkin
Feature: One geometry source

  Scenario: tableWidth and visibleHeight derive from computeLayout
    Given a terminal of any size
    Then controller.tableWidth() equals computeLayout(...).list.width
    And controller.visibleHeight() equals computeLayout(...).list.height
```

## Out of scope (handled elsewhere)

- Using `Rect.x/y` for mouse hit-testing — that's chunk 04 (this chunk just
  exposes the coordinates).
- List horizontal scrolling when content legitimately exceeds the pane — chunk
  05. (This chunk guarantees *default* columns fit; chunk 05 adds opt-in wider
  layouts with a scroll offset.)
- Detail-content vertical scrolling — chunk 03.

## Done when

- Sidebar, list, and detail always render bordered + titled; the focused region
  is highlighted with zero layout movement on focus change.
- `src/ui/layout-geometry.ts` is the single geometry source, 100% covered;
  `tableWidth()`/`visibleHeight()` and all box sizing derive from it; no magic
  width floors/offsets remain (`max(60,…)`, `−2`, `termCols−36`,
  `CHART_WIDTH=64`).
- The list, detail divider, and metrics charts never wrap or spill at any
  terminal size, detail open or closed (acceptance scenarios pass).
- `bun run gate` is green.
