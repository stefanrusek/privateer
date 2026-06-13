# Chunk 02 — Region chrome & layout math

**Status:** DRAFT
**Depends on:** —
**Implements / amends:** `spec/spec-02-navigation-layout.md` (layout, regions,
sizing, header). Update that canonical spec where this changes it.

## User stories

> As a user, I want the whole UI to read as **one connected framed grid** with
> a title on every region, and I always want to see **which region is focused**,
> so navigation is never ambiguous.

> As a user, I never want the resource list, the detail content, or the metrics
> charts to **wrap by a character** or spill past their pane at any terminal
> size or when the detail pane opens.

> As a user, I want to see the **current context** in the header and click it
> (or the namespace) to change it.

## The frame (Option A)

All five regions are bordered, and the borders **collapse** into one connected
grid (adjacent regions share a single line, with correct box-drawing
junctions — `┬ ┴ ├ ┤ ┼`). The layout:

```
┌──────────────────────────────────────┐
│ <context> · ns: <namespace>   /<search>│  header   (full width)
├──────┬───────────────────────────────┤
│ side │ list                          │
│ bar  │                               │
│      ├───────────────────────────────┤  ← list│detail line = VERTICAL resize
│      │ detail                        │
├──────┴───────────────────────────────┤
│ Space agent · / search · ? help · q  │  command bar (full width)
└──────────────────────────────────────┘
         ↑ sidebar│right line = HORIZONTAL resize
```

- **Header** and **command bar** are full-width cells (top and bottom).
- **Sidebar** spans the full height between them.
- **List** sits above **detail** in the right column; when `showDetail` is
  false, the list fills the right column and there is no list│detail line.
- When detail is closed, the sidebar│right vertical line still exists (it's the
  horizontal-resize handle).

### Drag handles (coordinates only here; behavior in chunk 04)

The two shared lines are the resize handles:

- **sidebar│right** vertical line → horizontal resize (`sidebarRatio`).
- **list│detail** horizontal line → vertical resize (`verticalRatio`).

This chunk only needs to **expose these segments' coordinates** from the
geometry module. The drag interaction itself (replacing the current
undiscoverable `handleMouseDrag`/`splitterRow`, which has no visible handle and
no horizontal resize at all) is chunk 04.

## Header content

The header cell shows, left to right:

1. **Current context** (e.g. `docker-desktop`).
2. **Namespace** filter (e.g. `ns: default`).
3. **Search** field (right-aligned, e.g. `/web`).

- The context and namespace are **distinct clickable chips**. In chunk 04 they
  are rendered as measured `<Button>`s (context → context switcher, namespace →
  namespace picker, search → focus search), so this chunk does **not** need to
  expose their coordinate ranges — it only needs to render the three pieces as
  separate inline elements the Buttons can wrap. (Today only `n` opens the
  namespace picker and `!ctx` opens the switcher.)
- The context string is the single source already in `state.context`.

## Region titles & focus highlight

Each region carries a title in its top border:

| Region | Title |
|--------|-------|
| Sidebar | `Resources` |
| List | active kind + count, e.g. `Pods · default (12)` |
| Detail | resource kind + name, e.g. `Pod · web-7d9` |
| Header / Command bar | no title needed (single-line chrome) |

- **Focused region:** the border segments enclosing it render as a **double
  line** in an accent color (proposed `cyan`) and its title is **bold**.
  Unfocused regions render as single lines. Where a double-line (focused) edge
  meets a single-line (unfocused) edge, the frame uses the correct **mixed
  single/double junction** glyph (`╞ ╡ ╤ ╧ ╪ ╟ ╢ ╓ ╖ ╘ ╛` …). Because a
  double-line glyph still occupies exactly one cell, switching weight causes
  **no layout movement**.
- **Unfocused regions:** single-line dim border, dim title.
- **Changing focus changes only border weight/color and title style, never
  dimensions** — no region grows, shrinks, or reflows on focus change. (This is
  why borders are always drawn.)

> Accent color, single/double weight, and glyph set are cosmetic and may be
> tuned during implementation without a spec change — but the frame model must
> support per-segment line weight and the mixed junctions, with tests.

## Root cause being fixed: no single geometry source

Several places compute geometry independently and disagree by a column or more,
which (a) causes the wrap bugs and (b) makes collapsed borders + drag handles
impossible to place correctly:

- `controller.tableWidth()` = `max(60, columns − sidebar − 2)` (controller.ts
  ~635) — the `max(60,…)` floor can exceed the real list-pane width → **list
  wraps by one char**.
- Detail divider `'╌'.repeat(max(10, termCols − 36))` (LiveApp.tsx ~349) —
  sized to the whole terminal → **wraps when detail opens**. (With the bordered
  grid + tab bar this divider should simply be removed.)
- Metrics charts hard-code `CHART_WIDTH = 64` (MetricsTab.tsx ~110/129) → **chart
  lines wrap** whenever the detail pane is narrower than 64.
- Sidebar width formula is duplicated (controller.ts ~2702, AppRoot.tsx ~67) —
  must not drift.

## Single source of truth: `src/ui/layout-geometry.ts` (new, pure)

```
computeFrame(input: {
  columns: number;
  rows: number;
  sidebarRatio: number;
  verticalRatio: number;   // detail pane's share of the list+detail split
  showDetail: boolean;
}): {
  header:     Rect;        // inner content rect of each region
  sidebar:    Rect;
  list:       Rect;
  detail:     Rect | null; // null when showDetail is false
  commandBar: Rect;
  handles: {
    sidebar:  Segment;     // vertical drag handle (x, yStart..yEnd)
    vertical: Segment | null; // list│detail handle, null when detail closed
  };
  // Optional: a renderable border-glyph grid (see "Rendering" below).
}
```

- `Rect = { x, y, width, height }` — **inner** content area (inside the
  border), in absolute terminal coordinates. `x/y` feed mouse hit-testing
  (chunk 04); `width/height` bound content so it never wraps.
- Each bordered cell consumes 1 column per side and 1 row top/bottom; **shared
  (collapsed) edges are counted once**, not twice.
- `sidebarRatio` (clamped) sets the sidebar outer width; `verticalRatio`
  (clamped 0.2–0.8) splits list/detail, matching today's semantics.
- **No floor that can exceed the real pane.** When the terminal is too small,
  inner dimensions clamp toward defined minimums and content is **truncated**,
  never wrapped. A `max(60,…)`-style floor is forbidden.
- Degrades gracefully at extreme sizes (never negative); minimums unit-tested.

### Rendering the collapsed grid

Ink's per-`Box` `borderStyle` draws each box's four borders independently, so
two adjacent boxes show a **double** line and can't form `┼` junctions. The
collapsed grid is therefore drawn by a **pure frame model** (part of
`layout-geometry.ts` or a sibling `src/ui/frame.ts`) that emits the correct
box-drawing glyph for every border cell (corners, tees, crosses) given each
segment's **line weight** (single/double) and accent. The focused region's
segments are double-weight; mixed single/double junctions are resolved to the
correct glyph. A thin Ink renderer paints that glyph grid and positions each
region's content inside its `Rect`. The frame model is pure and 100%-covered;
the Ink renderer is thin adapter glue.

### All consumers derive from the frame

- `controller.tableWidth()` → `list.width`; `controller.visibleHeight()` →
  `list.height`.
- Region box sizes/positions in `AppRoot`/`LiveApp`.
- `MetricsTab` chart width = `min(detail.width, MAX_CHART_WIDTH)` (replaces
  `CHART_WIDTH = 64`); the divider is removed.
- `controller.sidebarWidthCols()` and AppRoot's sidebar width call the module —
  one formula.
- Mouse hit-testing (chunk 04) consumes the region `Rect`s and the `handles`
  segments; the header context/namespace/search chips are measured `<Button>`s
  in chunk 04, not frame coordinates.

## Content fits its pane (wrap fixes)

1. **List:** `ResourceTable` gets `list.width` as its pane width. Columns render
   at **stable natural widths** and the pane is a **horizontal viewport**
   (chunk 05): the row is **clipped** to `list.width`, never squeezed and never
   wrapped, detail open or closed. (This supersedes the earlier "Σ column widths
   ≤ totalWidth / truncate the flex column" approach — see chunk 05 for the
   natural-width + pinned-column model.)
2. **Metrics charts:** thread `detail.width` into `MetricsTab`; charts and text
   fit within it (`renderTimeseriesChart({ width })` is already
   width-parameterized).
3. **Dividers:** the ad-hoc `╌` divider is removed in favor of the bordered
   chrome + tab bar.

## Where the logic lives (coverage)

- `src/ui/layout-geometry.ts` (+ frame model) — pure, **100% covered**,
  exhaustively tested across terminal sizes (tiny/typical/ultra-wide), both
  `showDetail` states, ratio clamp boundaries, and **junction-glyph
  correctness** for the collapsed grid (including mixed single/double junctions
  where a focused double-border meets a single-border neighbor).
- `ResourceTable` width distribution + `MetricsTab` chart width — frame tests
  asserting rendered width ≤ pane and no wrap.
- `controller.ts` (excluded adapter) calls the module and passes widths
  through; it contains no geometry arithmetic of its own.

## Acceptance criteria (given-when-then)

```gherkin
Feature: Collapsed bordered grid

  Scenario: All regions are bordered and share collapsed edges
    Given the detail pane is open
    Then the header, sidebar, list, detail, and command bar each render inside
      the connected frame
    And adjacent regions share a single border line (no double lines)
    And the line junctions use the correct box-drawing glyphs

  Scenario: Focus is shown without moving anything
    Given the list is focused
    Then the border enclosing the list is a double line in the accent color
    And the list title is bold
    And the other regions' borders are single dim lines
    And edges where the list's double border meets a neighbor use the correct
      mixed single/double junction glyph
    When I press Tab to focus the detail pane
    Then the detail border becomes double/accent and the list's reverts to single
    And every region keeps the exact same width and height as before
```

```gherkin
Feature: Header shows and exposes context + namespace

  Scenario: Current context is shown left of the namespace
    Given the current context is "docker-desktop" and the namespace is "default"
    Then the header shows the context to the left of "ns: default"

  Scenario: Context and namespace are distinct clickable chips
    Then the header renders the context and the namespace as separate inline
      elements that chunk 04 can wrap as individual Buttons
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
    Then every metrics chart line is <= 48 columns wide and does not wrap
```

```gherkin
Feature: One geometry source

  Scenario: tableWidth and visibleHeight derive from computeFrame
    Given a terminal of any size
    Then controller.tableWidth() equals computeFrame(...).list.width
    And controller.visibleHeight() equals computeFrame(...).list.height
```

## Out of scope (handled elsewhere)

- Mouse behavior: drag-resize on the handle segments, header context/namespace
  clicks, and wheel routing — all chunk 04 (this chunk only exposes the region
  rects and handle segments).
- List horizontal scrolling when content legitimately exceeds the pane — chunk
  05.
- Detail-content vertical scrolling — chunk 03.
- Context-switcher polish (feedback, per-context memory, `c` key) — chunk 08.

## Done when

- All five regions render inside one collapsed bordered grid with correct
  junctions and titles; the focused region is highlighted with zero layout
  movement on focus change.
- The header shows the current context left of the namespace as separate inline
  chips (wrappable as Buttons in chunk 04), and the frame exposes the handle
  segment coordinates.
- `src/ui/layout-geometry.ts` is the single geometry source, 100% covered;
  `tableWidth()`/`visibleHeight()` and all sizing derive from it; no magic
  width floors/offsets remain (`max(60,…)`, `−2`, `termCols−36`,
  `CHART_WIDTH=64`); the `╌` divider is gone.
- List and metrics charts never wrap or spill at any terminal size, detail open
  or closed.
- `bun run gate` is green.
