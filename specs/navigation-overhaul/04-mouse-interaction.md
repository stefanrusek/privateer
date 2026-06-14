# Chunk 04 — Mouse: registry, components, dispatch

**Status:** DRAFT
**Depends on:** 02 (`computeFrame` region `Rect`s + handle `Segment`s), 03
(detail `scrollBy` entry point + Logs pause/resume coupling), 01 (`app.focus`
region model + `setFocus`)
**Implements / amends:** `spec/spec-02-navigation-layout.md` (mouse). Update it
where this changes behavior.

> **This chunk replaces p9r's entire mouse stack**, not just the geometry. The
> old plan (a pure `hit-test.ts` mapping absolute terminal coordinates to
> regions) is superseded by a **hit-region registry**: interactive things
> register their rect with a single dispatcher, and one SGR stream feeds every
> mouse gesture (click, drag, wheel) through it. ink-mouse is removed.

## Why (decisions baked in)

Today there are **two** mouse code paths fighting each other (LiveApp.tsx
`MouseRouter`, ~23): ink-mouse parses `click`/`scroll`, while drag/release are
parsed straight off `process.stdin` because ink-mouse's drag event is broken
(see CLAUDE.md). ink-mouse also force-enables any-motion tracking (1003h), which
we immediately undo. Click dispatch is then a wall of hard-coded arithmetic in
`controller.ts` (`handleMouseClick` ~2739, `handleMouseScroll` ~2896,
`handleMouseDrag` ~2870, `clickDetailTabBar` ~2829) that assumes `contentTop=2`,
derives row indices from `verticalRatio`, and — post-chunk-02 borders — is now
wrong as well as duplicated. Wheel checks only `x`, so it scrolls the list even
when the cursor is over the detail pane (a reported bug). The `✕` close button
is drawn but not clickable.

The chosen design (agreed with the user):

1. **One dispatcher over one SGR stream.** A single `process.stdin` listener
   parses *all* SGR mouse reports (press / release / motion-drag / wheel). No
   ink-mouse, no second parser, no 1003h tug-of-war.
2. **A hit-region registry.** Every interactive thing registers a rect plus a
   press/wheel handler. The dispatcher finds the **topmost** registered entry
   containing the point and delegates. This kills the per-widget coordinate
   math.
3. **Four components, layered.**
   - `<Button>` — a discrete, **non-nestable leaf** widget (tabs, `✕`, header
     chips, picker items, YAML save/cancel). It **measures its own rendered
     rect** (Yoga) and registers it; clicking it fires `onClick`. Measuring —
     not recomputing geometry — is the whole point: no fragile x-range math.
   - `<FocusableRegion>` — the root-level focusable layout container (header,
     detail, command bar). Its rect comes from `computeFrame` (chunk 02) as a
     prop; clicking it focuses the region (drives chunk 01's `app.focus`); the
     wheel over it scrolls it.
   - `<SelectableList>` — composes `FocusableRegion` and adds a row model
     (sidebar + resource list). It maps a local click `y` to a row index
     (`rowInContent + scrollOffset`) **itself**, so per-row geometry is local
     and survives layout changes. Rows are **not** Buttons (a 200-row list must
     not churn 200 registry entries per render).
   - `<DropdownButton>` — a `<Button>` trigger **plus** an anchored overlay list
     (a `SelectableList` of item `<Button>`s on the overlay layer). The single
     reusable "click/key opens a list, pick an item" widget. **Optional
     type-to-filter** for long/dynamic lists. Used by the Logs container &
     line-limit pickers (chunk 06, no filter — short lists) and the header
     **namespace** filter (filter **on** — long, dynamic). The header **context**
     indicator is a plain `<Button>` (not a DropdownButton) because contexts are
     few and the context switcher carries reconnect/error state (chunk 08).
4. **Uniform dispatch contract.** Every registered entry exposes `{ rect,
   layer, handlePress(localX, localY), handleWheel?(dir) }`. The dispatcher's
   only job is "find topmost entry at (x,y), translate to local coords,
   delegate." Buttons fire `onClick`; lists select/open a row; bare regions
   focus; handles begin a drag. No `if (isList)`/`if (isButton)` in the router.

## Event flow

```mermaid
flowchart LR
  stdin["process.stdin 'data'"] --> parse["parseSgrMouse()\n(pure)"]
  parse --> ev["MouseEvent[]\npress / release / drag / wheel"]
  ev --> disp["dispatch(event, registrySnapshot, dragLatch)\n(pure)"]
  disp --> act["Action"]
  act --> ctl["controller executes\n(setFocus / selectRow / openDetail /\nButton.onClick / setRatio / scrollBy)"]
  reg["registry\n(frame-derived + measured entries)"] --> disp
```

The decision is **pure and fully tested**; the controller only executes the
returned `Action`.

## Reuse what already exists — do NOT reinvent (critical)

The repo **already has tested, 100%-covered pure modules for the hard parts**,
currently **orphaned** (only `src/ui/types.ts` imports a type from them; the live
app bypasses them via ink-mouse + an inline stdin regex):

- `src/input/mouse.ts` — `parseSgrMouse`, `MouseEvent`, and the
  `MOUSE_ENABLE`/`MOUSE_DISABLE`/`suspendMouse`/`resumeMouse` mode strings. This
  **is** the SGR parser this chunk needs; extend it (add wheel/drag normalization
  if missing) rather than writing a new `sgr.ts`.
- `src/input/hit-testing.ts` — a topmost-wins registry (`HitTestRegistry`). This
  **is** the `registry.ts`/`topmostAt` this chunk needs; extend it with the
  `layer` field if absent.
- `src/input/drag.ts` — `DragTracker`, a press→motion→release latch. This **is**
  the drag-latch / no-slip mechanism.

So this chunk's real job is **integration, not greenfield**: wire these existing
modules into the live path, delete ink-mouse, and add only what's genuinely new
(the `dispatch` reducer, `ratios`, `accelerator`, `measure`, and the React
wrappers). Treat the module names below as the *capabilities* to provide — map
them onto `src/input/*` where it already exists.

**Bug to fix while here:** `src/input/mouse.ts`'s `MOUSE_ENABLE` turns on
`1003h` (any-motion), which directly contradicts the live code
(`LiveApp.tsx` writes `1003l … 1002h`) and the CLAUDE.md gotcha that 1003h must
stay suppressed. Reconcile to the live behavior (1000h + 1002h + 1006h on;
1003h off) and hard-disable all modes on quit/suspend/exit.

## Pure modules (capabilities — map onto `src/input/*`; `src/ui/**`, 100% covered)

- **`sgr.ts`** — `parseSgrMouse(chunk: string): MouseEvent[]`. Decodes SGR
  reports `\e[<b;x;yM` (press/motion) and `\e[<b;x;ym` (release):
  - button number from `b & 0b11`; **motion/drag** flag `b & 0x20`; **wheel**
    `b & 0x40` (low bits: `64`=up, `65`=down); modifiers `shift 4`, `meta 8`,
    `ctrl 16`.
  - emits `{ type: 'press'|'release'|'drag'|'wheel', x, y, button, dir?, mods }`
    with **0-based** coordinates (terminal reports 1-based).
  - tolerant of multiple reports in one chunk and of interleaved non-mouse
    bytes. This subsumes both today's regexes (the ink-mouse press/scroll path
    **and** the hand-rolled `\[<32;…M` drag regex).
- **`registry.ts`** — the entry model and matchers:
  - `Entry = { id, rect: Rect, layer: number, kind: 'region'|'list'|'button'|'handle', ... }`.
  - `topmostAt(entries, x, y): Entry | null` — highest `layer` whose `rect`
    contains the point; ties broken by most-recent registration. (Layers let
    overlays/pickers sit above base regions — see "Overlays".)
  - `toLocal(entry, x, y): { localX, localY }`.
  - a small immutable register/unregister/snapshot surface used by the
    components and controller.
- **`dispatch.ts`** — `dispatch(event, snapshot, dragLatch): Action`, the single
  routing decision:
  ```
  Action =
    | { kind: 'focusRegion'; region }
    | { kind: 'selectRow'; region; index }       // first click on a row
    | { kind: 'openDetailRow'; region; index }   // click on the selected row
    | { kind: 'buttonPress'; id }
    | { kind: 'beginDrag'; handle: 'sidebar' | 'vertical' }
    | { kind: 'dragTo'; handle; ratio }          // ratio already clamped
    | { kind: 'endDrag'; handle }
    | { kind: 'wheel'; region; dir }
    | { kind: 'none' }
  ```
  - **Drag latch:** once a `press` lands on a `handle`, the latch records it;
    subsequent `drag` events route to that handle **regardless of where the
    cursor wanders** (the "no slip" requirement) until `release`. Latch state is
    passed in and updated by the controller; the *decision* is pure.
  - Wheel resolves to the topmost **region** (Buttons/handles don't take
    wheel).
- **`ratios.ts`** (or co-located) — `sidebarRatioFromX(frame, x)` clamped to
  `[MIN, MAX]`; `verticalRatioFromY(frame, y)` clamped to `[0.2, 0.8]`. Pure.
- **`measure.ts`** — `absoluteRect(node): Rect`, walking a Yoga node's parent
  chain summing `getComputedLeft()/getComputedTop()` (+ own width/height). Takes
  an abstract `{ left, top, width, height, parent }` node so it is unit-tested
  with a **fake** tree — no real Yoga needed in tests. This is the only piece of
  geometry the framework computes for us; everything else is frame-derived.
- **`accelerator.ts`** — pure label/key helpers: `renderAccelerator(label, key)`
  → the segments to underline, and `matchAccelerator(buttons, keypress)` → the
  button to fire. Used by `Button`/`DropdownButton` and read by the chunk-09 help
  overlay so advertised keys can't drift from real ones.

## Adapter wiring (`src/adapters/live/**`, excluded — thin glue, BDD-exercised)

- **`mouse-router.ts`** — one `process.stdin.on('data', …)` listener →
  `parseSgrMouse` → `dispatch` → execute each `Action` on the controller.
  Owns the **mouse-mode lifecycle**: enable `1000h` (click) + `1002h`
  (button-held motion) + `1006h` (SGR) on start; **hard-disable all mouse modes
  on quit / suspend (exec handover) / process exit** so escape sequences never
  leak into the user's shell (CLAUDE.md gotcha — this is already our
  responsibility today, just consolidated). `1003h` (any-motion) stays **off**.
  Removes `MouseProvider`/`useMouse` and the `@zenobius/ink-mouse` dependency
  (drop it from `package.json` + lockfile).
- **`Button.tsx` / `FocusableRegion.tsx` / `SelectableList.tsx` /
  `DropdownButton.tsx`** — thin React wrappers: refs + `useEffect` that
  register/unregister entries and (for `Button`) call `measure.ts` against
  `ref.current.yogaNode` on mount/layout. All *decisions* live in the pure
  modules above; these only wire refs, effects, and callbacks. They render their
  children (Button adds no chrome; the bordered grid is still drawn by chunk 02's
  frame renderer). `DropdownButton` is pure composition over the other three: a
  trigger `Button` + an open/closed flag + an anchored overlay `SelectableList`;
  the anchor/up-vs-down placement reuses the trigger's measured rect.
- **Registry instance** — owned by the controller. The controller registers the
  **frame-derived** entries (the five region rects and the two handle segments)
  whenever `computeFrame` changes; components register the **measured** Button
  entries and the list/region entries on mount.

### Coverage note

Today mouse decoding is split between an **uncovered** dependency (ink-mouse) and
the adapter. After this chunk, *all* parsing and routing decisions are in pure
`src/ui/**` / `src/input/**` under the 100/100/100/100 bar; only ref-touching
wiring and the stdin/mode lifecycle remain in `src/adapters/**`.

**Component placement (mandatory):** the four React wrappers (`Button`,
`FocusableRegion`, `SelectableList`, `DropdownButton`) live in
**`src/adapters/live/`**, *not* `src/ui/components/` where the other 22
components live. This is deliberate: they touch `ref.current.yogaNode` and
`useEffect`-based measure/register, which cannot be meaningfully asserted under
`ink-testing-library`, so they belong in the coverage-excluded, eslint-relaxed
adapter dir (the same place the stdin listener and mode toggles already live).
Verified facts: `vitest.config.ts:31` excludes `src/adapters/**`;
`eslint.config.mjs:110` turns `no-restricted-syntax` off there. To keep their
*decisions* covered, any branch logic (e.g. the **nested-Button winner** rule)
lives in pure `registry.ts`/helpers the wrapper merely calls. `measure.ts` stays
pure and is tested against a **fake** `{left,top,width,height,parent}` node tree
(the real `yogaNode` walk is exercised by BDD, as with all adapter glue).

**Measurement note (verified):** the absolute-rect walk is sound — `ink-mouse`,
the dependency this chunk removes, already implements exactly it
(`getComputedLayout().left/top` summed up the `parentNode` chain). Two
constraints: a `<Button>`'s measured ref must attach to a **`<Box>`** (an
`ink-virtual-text` node has no `yogaNode`), and measurement must run in
`useEffect` (post-commit) and re-run on resize/content change.

## Components in detail

### `<Button onClick label? id? accelerator?>`
- Leaf only. **Buttons must not contain Buttons** — the design forbids nesting
  (overlapping equal-layer rects make "topmost" ambiguous). Honor this in the
  component tree; on a detected nested Button, log to `~/.config/p9r/debug.log`
  (never stdout/stderr) and treat the inner one as authoritative.
- Measures its rendered rect and registers `{ kind:'button', rect, layer,
  handlePress: () => onClick() }`. Re-measures on terminal resize / content
  change; unregisters on unmount.
- **Adopters this chunk:** detail **tab labels**, the detail **`✕`** close
  button, the header **context** chip (→ context switcher) and **search** chip
  (→ focus search). (Chunk 06's Logs toolbar and chunk 07's YAML **Save/Cancel**
  adopt Buttons in those chunks — "for free" once this exists. The header
  **namespace** chip is a `DropdownButton`, below.)

### Accelerator keys (discoverability)
- A `Button`/`DropdownButton` may declare an **`accelerator`** — a single key
  that is a **letter within its label**. The label renders that letter
  **underlined** so the key is self-documenting (e.g. `[Co̲ntainer ▾]`,
  `[100 l̲ines ▾]`). Pressing the key while the owning region/tab is active fires
  the same handler a click would; clicking and the key are interchangeable.
- Accelerators must be **unused in their active scope** and prefer lowercase
  (we advertise vim-style keys). Pure helpers render the underlined label and
  map a keypress to the matching accelerator; the help overlay (chunk 09) reads
  the same registry so it can never drift from the real keys.
- **Fallback when the key isn't in the label** (e.g. a toggle that flips between
  "Live"/"Paused"): render the key as an underlined **prefix badge** —
  `p̲:Paused` — so the accelerator is still shown. Prefer an in-word letter when
  one is available and free.

### `<DropdownButton trigger items selectedIndex onSelect filterable? accelerator?>`
- Composition over the primitives: the `trigger` is a `<Button>` (with optional
  `accelerator`); opening it renders an **anchored overlay** `SelectableList` of
  item `<Button>`s on the overlay layer (higher than base regions, with a
  full-area backdrop — see "Overlays"). The anchor sits directly under the
  trigger's measured rect, flipping **upward** when there isn't room below.
- `filterable` adds a one-line type-to-filter at the top of the overlay (for
  long, dynamic lists); when off, the list is shown as-is (short lists).
- Keyboard while open: `↑/↓` (`j/k` when not filtering) move; `Enter` selects;
  `Esc` closes; click selects; outside-click closes via the backdrop.
- **Adopters:** the header **namespace** chip (`filterable`), and — in chunk 06 —
  the Logs **container** (`accelerator: 'o'`) and **line-limit**
  (`accelerator: 'l'`) pickers (both unfiltered). This **retires the full-screen
  `PickerOverlay` for the namespace picker**; `PickerOverlay` remains only for
  the exec container selection (out of scope here).

### `<FocusableRegion regionId rect focused onWheel>`
- Receives its `rect` from `computeFrame` (no measuring). Registers
  `{ kind:'region', rect, layer:0, handlePress: () => setFocus(regionId),
  handleWheel: onWheel }`.
- Consumes chunk 01's focus model: `focused` drives chunk 02's highlight;
  clicking it calls `setFocus(regionId)`. Keyboard `Tab` focus (chunk 01) and
  mouse focus therefore share the single `app.focus` source — no parallel focus
  notion.
- Used directly by **header**, **detail**, **command bar**.

### `<SelectableList regionId rect focused rows scrollOffset selectedIndex …>`
- Composes `FocusableRegion`; overrides `handlePress(localX, localY)` to map
  `index = localY + scrollOffset` (no magic `−1`/`−2`; the rect is already the
  inner content area). `localY` outside the row band → focus only.
- Click semantics: first click on a row → `selectRow`; click on the
  **already-selected** row → `openDetailRow` (opens + focuses detail, per chunk
  01). Matches today's "second click opens" behavior.
- Instances: the **sidebar** tree and the **resource list**.

## Behaviors (all via the dispatcher)

### Wheel routes by cursor position (the bug fix)
`dispatch` resolves the wheel to the topmost **region** under the cursor and
returns `{ kind:'wheel', region, dir }`, independent of `app.focus`:
- **sidebar** → move sidebar cursor; **list** → scroll/move list selection;
  **detail** → `scrollBy(±WHEEL_LINES)` (proposed 3) via chunk 03, including
  Logs pause/resume; **header / commandBar / handles / none** → ignored.

### Drag-resize on the visible border handles
The two shared border lines (chunk 02 `handles.sidebar`, `handles.vertical`) are
registered as `handle` entries with a **±1-cell tolerance** so the thin lines are
easy to grab. On `press` → `beginDrag`; each `drag` → `dragTo` with the clamped
ratio (`sidebarRatioFromX` / `verticalRatioFromY`); on `release` → `endDrag` and
`saveLayout()`. The latch (above) prevents slipping off the line mid-drag.
Vertical resize only when detail is open. **Affordance:** a grabbed (and
optionally hovered) handle segment renders accent-highlighted (chunk 02's frame
already supports per-segment accent).

### Clicks
- **Context** Button → open the context switcher; **namespace** DropdownButton →
  open its anchored, filterable namespace list; **search** Button →
  `mode:'search'`.
- **Detail tab** Button → switch to that tab and focus detail.
- **`✕`** Button → close the detail pane (newly wired).
- **Region / row** (FocusableRegion / SelectableList) → focus, and for lists
  select/open per above.
- **Command bar** region → focus the agent input.

This **supersedes the stale rows in canonical `spec-02 §9` (Mouse Support)**:
"Command bar context | Click to open context switcher" (the context trigger is now
the **header** chip, chunk 08) and "double-click to open detail" (now a **second
click on the already-selected row**). Update §9 accordingly.

### Overlays & z-ordering
**Ink has no visual compositor** — it cannot paint a floating box over
already-rendered content via a true z-layer (verified: today's full-screen
overlays in `AppRoot.tsx`/`LiveApp.tsx` work by **early-return replacement** of
the whole tree, with a comment noting "Ink cannot reclaim overflowed rows"). So
the registry's `layer` field governs **hit-test priority only**, not painting.
A non-full-screen *anchored* overlay (a `DropdownButton` list) must therefore be
**rendered inside the normal flex tree** — e.g. an absolutely-positioned `<Box>`
within its region, or by reserving rows — not "drawn on top" at arbitrary cells.

Modals/overlays (context switcher, namespace picker, help, confirm, and chunk
06's container picker) register their entries on a **higher layer** plus a
full-area backdrop entry on that layer, so (a) their Buttons/rows win
`topmostAt` over the base regions beneath, and (b) clicks outside the overlay
hit the backdrop (swallow / close per the overlay's own rules) rather than
leaking to the list underneath.

## Acceptance criteria (given-when-then)

```gherkin
Feature: One SGR stream, no ink-mouse

  Scenario: All gestures parse from a single stdin listener
    Given the TUI is running
    Then no code imports "@zenobius/ink-mouse"
    And press, drag, release, and wheel are all produced by parseSgrMouse

  Scenario: Mouse modes are torn down on exit
    Given the TUI has enabled mouse reporting
    When the app quits or suspends for an exec handover
    Then all mouse modes (1000/1002/1003/1006) are disabled
    And no escape sequences leak into the shell
```

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
Feature: Buttons dispatch clicks

  Scenario: Click a detail tab switches to it
    Given the detail pane is open
    When I click the "YAML" tab
    Then the YAML tab is active and the detail pane is focused

  Scenario: Click the close button closes the pane
    Given the detail pane is open
    When I click the ✕
    Then the detail pane closes

  Scenario: Click the context opens the switcher
    When I click the context chip in the header
    Then the context switcher opens

  Scenario: Click the namespace opens the picker
    When I click the namespace chip in the header
    Then the namespace picker opens

  Scenario: Buttons do not nest
    Then no Button is rendered inside another Button
```

```gherkin
Feature: DropdownButton and accelerator keys

  Scenario: A DropdownButton opens an anchored list
    When I click the namespace chip in the header
    Then a list opens anchored under the chip
    And it is not a full-screen overlay

  Scenario: A filterable DropdownButton filters as I type
    Given the namespace DropdownButton is open over many namespaces
    When I type part of a namespace name
    Then the list narrows to matching entries

  Scenario: An accelerator key activates its button
    Given a button labelled "[Co̲ntainer ▾]" with accelerator "o" is active
    When I press "o"
    Then the same action fires as clicking it
    And the "o" in the label is rendered underlined
```

```gherkin
Feature: Region and row clicks via the registry

  Scenario: Clicking a region focuses it
    Given the list is focused
    When I click inside the sidebar
    Then the sidebar is focused

  Scenario: Second click on the selected row opens detail
    Given a row is selected in the list
    When I click that same row again
    Then the detail pane opens and is focused

  Scenario: An open overlay captures clicks above the list
    Given the namespace picker is open over the list
    When I click a namespace entry in the picker
    Then that namespace is selected
    And the list row beneath the click is NOT selected
```

## The one invariant (adversarial coverage)

**Mouse modes (1000/1002/1003/1006) must be hard-disabled on EVERY exit path** so
escape sequences never leak into the user's shell (CLAUDE.md gotcha). One
happy-path test is insufficient for the invariant whose failure corrupts the
user's terminal. Require adversarial tests: teardown on normal quit, on
suspend (exec handover **and** chunk 07's `$EDITOR` pop-out), on
crash/uncaught-exception, on `SIGINT`/`SIGTERM`, and **idempotent double
teardown**. This invariant is owned here and **re-asserted by chunk 07** on its
suspend path. (The existing `disableMouseReporting()` in the suspend runner
already does the teardown — reuse it, don't reinvent.)

## Implementation constraints (gate)

- The `Action` union and any discriminated-union `switch` must be **exhaustive
  with no `default`** (eslint `switch-exhaustiveness-check` is an error).
- Optional props use `?:` (not `| undefined`) and call sites guard reads
  (`exactOptionalPropertyTypes` is enforced repo-wide, including adapters).
- Pure helpers stay in `src/ui/**` / `src/input/**` (never co-located inside an
  excluded adapter wrapper, or they fall out of coverage).

## Out of scope
- Frame geometry (chunk 02) and detail viewport math (chunk 03); this chunk
  consumes their rects/handles/`scrollBy`.
- The inline Logs-container picker (chunk 06) and YAML Save/Cancel (chunk 07)
  themselves — they merely *adopt* `<Button>` in their own chunks.

## Done when
- ink-mouse is gone; one stdin listener + pure `parseSgrMouse` produce every
  mouse gesture; mouse modes are hard-disabled on quit/suspend/exit.
- `src/ui/mouse/**` holds all parsing/registry/dispatch/ratio/measure logic,
  100% covered; `controller.ts` only executes returned `Action`s and holds the
  drag latch — no geometry arithmetic remains in the mouse handlers.
- Wheel scrolls the region under the cursor (detail included) regardless of
  focus; the two visible borders drag-resize with a latch and persist; clicking
  a tab/`✕`/context/namespace does the right thing; region/row clicks
  focus/select/open; overlays capture clicks above the base regions.
- `<Button>` (non-nestable), `<FocusableRegion>`, `<SelectableList>`, and
  `<DropdownButton>` exist and are the only way mouse targets are registered.
- `<DropdownButton>` backs the header **namespace** filter (anchored, filterable
  — retiring the full-screen `PickerOverlay` for namespaces) and is reused by the
  Logs toolbar in chunk 06; **accelerator keys** render underlined and fire the
  same handler as a click, sourced from one registry the help overlay reads.
- `bun run gate` is green.
