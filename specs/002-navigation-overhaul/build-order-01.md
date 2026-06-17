# Navigation Overhaul — Build Order
**Document:** build-order-01 (for `specs/002-navigation-overhaul/`)
**Inputs:** spec chunks 01–10 in `specs/002-navigation-overhaul/` (+ canonical
`spec/`, the codebase, `CLAUDE.md`).
**Consumer:** unattended implementation pipeline — each **build chunk** is
independently implementable and testable, **done only when `bun run gate` is
green** (format · lint · lint:grep · typecheck · unit @ 100/100/100/100 · bdd).
**Relationship to the spec:** the spec files stay coherent *behavior* units; this
plan maps them to *build* units. Two spec chunks are split for build
(02→02a/02b, 04→04a/04b) per the spec README's "Build-order notes."

---

## Sequencing principles

1. **The gate already exists — don't weaken it.** No scaffold phase; every chunk
   ends green at 100% coverage with no new escape hatches.
2. **Pure cores before their wiring.** Each chunk front-loads its pure module(s)
   in `src/ui`/`src/input` (100% covered) and adds only thin glue in the
   coverage-excluded `src/adapters/live/`.
3. **Reuse, don't reinvent.** The mouse parser/registry/drag-latch already exist
   and are tested under `src/input/{mouse,hit-testing,drag}.ts` (today orphaned);
   chunk 04 **integrates** them, it does not re-create them.
4. **Quarantine the one unproven dependency behind a swappable seam.** The Yoga
   absolute-measurement is isolated in **04b**; 04a (parse/registry/dispatch/
   wheel/drag) needs no measurement and lands first. (The measurement itself is
   already **spike-proven** — see Prerequisite.)
5. **Keep the walking skeleton launchable at every step.** The two big rewrites
   (geometry/render, mouse) are split so the app still starts mid-way: 02a keeps
   the current chrome while rewiring math; 02b swaps the renderer; 04a removes
   ink-mouse with a working replacement before 04b adds measured widgets.
6. **Boundaries before consumers.** 03's `scrollBy` seam, 04a's dispatch `Action`
   contract, and 04b's component contracts are defined before the chunks that
   consume them; 04←03 is only a soft `scrollBy`-seam dep, so 03 and 04a run in
   parallel.
7. **One invariant, adversarially tested:** mouse modes hard-disabled on **every**
   exit/suspend path (quit, crash, SIGINT/SIGTERM, exec handover, `$EDITOR`
   pop-out, idempotent double-teardown). Owned by 04a, re-asserted by 07.
8. **Gating tier is explicit** (see "Verification tiers"): pure logic is gating;
   real-terminal/real-cluster/`$EDITOR` paths are tmux/BDD and **non-gating**.

Chunks with the same prerequisites may be built in any order or in parallel.

---

## Prerequisite — verification spike (DONE)

**S0 — Yoga absolute measurement + SGR round-trip.** Proven in a throwaway
harness under Bun 1.3.11 + Ink 5.1 + React 18.3: a ref'd `<Box>` measured its
absolute rect exactly via the `yogaNode.getComputedLeft/Top` parent-chain walk,
and `src/input/mouse.ts`'s `parseSgrMouse` decoded down/up/scroll/drag/move.
Result recorded in spec chunk 04. **No go/no-go risk remains for 04b.**

---

## Phase 1 — Independent foundations (parallel)

### B01 — Focus & keyboard routing
**Specs:** chunk 01. **Deps:** — (amends `spec-02`, `spec-04 §4.1`)
- Pure `src/ui/detail-tabs.ts` (navigable tabs per kind, prev/next/jump) and
  region-cycle helper in `src/ui/navigation.ts`.
- Controller: Tab cycles regions incl. detail; remove the detail-tab `Tab`
  consumption; free list `←/→` and detail `←`; detail `←/→`=tabs, `1–6`=jump;
  open-detail focuses detail (fixes `/`-in-Logs); **root-cause `q` so it
  actually quits from every region**; `Esc` closes pane, never quits.
**Done when:** chunk 01's gherkin passes; pure helpers 100% covered; skeleton
launches; gate green.

### B02a — Geometry math (single source), current chrome retained
**Specs:** chunk 02 (geometry half). **Deps:** —
- Pure `src/ui/layout-geometry.ts`: `computeFrame(...)` → region `Rect`s +
  `handles.{sidebar,vertical}` `Segment`s; ratio clamps; minimums.
- Rewire all consumers: `tableWidth()`→`list.width`, `visibleHeight()`→
  `list.height`, `MetricsTab` width, single sidebar formula; **remove** the
  `max(60,…)` floor, `termCols−36` divider, `CHART_WIDTH=64`, duplicated sidebar
  math. List + charts never wrap at any size.
- **Keep the current Ink chrome** (borders unchanged) so the skeleton stays up.
**Done when:** chunk 02's geometry/“one geometry source”/“content never wraps”
gherkin passes; `layout-geometry.ts` 100% covered; gate green.

---

## Phase 2 — Frame renderer + scroll + mouse core

### B02b — Collapsed-grid frame renderer
**Specs:** chunk 02 (rendering half). **Deps:** B02a
- Pure frame model (in `layout-geometry.ts` or sibling `src/ui/frame.ts`):
  per-cell box-drawing glyphs, single/double weight, focus accent, mixed
  junctions. **Concrete render mechanism per the chunk** (string-buffer
  composition *or* flex-Boxes-sized-to-Rects — **not** absolute cell-plotting).
  Verify junction glyphs are width-1 (`string-width`).
- Thin Ink renderer; focus change alters weight/color/title only — **zero**
  layout movement.
**Done when:** chunk 02's “collapsed bordered grid”/“focus shown without moving
anything” gherkin passes; frame model 100% covered; skeleton launches with the
new chrome; gate green.

### B03 — Detail scroll viewport
**Specs:** chunk 03. **Deps:** B01, B02a
- Pure `src/ui/scroll-viewport.ts` (`scrollBy`/clamp/viewport projection); per-tab
  `ViewLine` projection; Logs scroll-up pauses live-tail and walks the ring,
  return-to-bottom resumes. Exposes the `scrollBy` seam 04a/07 consume.
**Done when:** chunk 03's gherkin passes; module 100% covered; gate green.

### B04a — Mouse core: integrate `src/input/*`, dispatch, remove ink-mouse
**Specs:** chunk 04 (parse/registry/dispatch/ratios/wheel/drag/clicks; the
“Reuse what already exists” + invariant sections). **Deps:** B01, B02a; **soft:**
B03 (`scrollBy` seam — stub if 03 lags)
- **Integrate** `src/input/{mouse,hit-testing,drag}.ts` into the live path; add a
  chunk-splitter for multi-report stdin; pick one coordinate base consistent with
  `computeFrame`. Add pure `dispatch.ts` (`Action` reducer, exhaustive `switch`),
  `ratios.ts`. **Remove `@zenobius/ink-mouse`** (package.json + lockfile) and the
  inline regex; one `process.stdin` listener.
- Fix the `src/input/mouse.ts` `MOUSE_ENABLE` 1003h bug; modes = 1000h+1002h+
  1006h on, 1003h off; **hard-disable on every exit/suspend** path.
- Frame-derived hit-testing only (regions + handles): wheel routes by cursor,
  drag-resize with latch (no slip), region/row click focus/select, second-click
  opens detail.
- **Adversarial invariant tests:** teardown on quit/crash/SIGINT/SIGTERM/double.
**Done when:** chunk 04's “one SGR stream”, wheel, drag-resize, region/row-click
gherkin passes; `parseSgrMouse`/registry/dispatch/ratios 100% covered; no
`ink-mouse` import remains; skeleton launches; gate green.

---

## Phase 3 — Measured widgets + wide fan-out

### B04b — Measured component layer
**Specs:** chunk 04 (components, `measure.ts`, accelerators, overlays).
**Deps:** B04a, B02a (+ B02b for visual integration). Spike S0 done.
- Pure `measure.ts` (`absoluteRect` over a **fake** node tree) and
  `accelerator.ts` (underline render + key match); nested-Button winner decision
  in pure `registry.ts`.
- React wrappers in **`src/adapters/live/`** (coverage-excluded): `Button`,
  `FocusableRegion`, `SelectableList`, `DropdownButton` — ref on a `<Box>`,
  measure in `useEffect`, register/unregister. Adopters: detail tabs, `✕`, header
  context/search chips; namespace = filterable `DropdownButton`. Overlays render
  inside the flex tree; `layer` = hit-test priority only.
**Done when:** chunk 04's Button/DropdownButton/accelerator/overlay gherkin
passes (pure parts unit-covered, wrappers BDD-exercised); gate green.

### B05 — List horizontal scroll
**Specs:** chunk 05. **Deps:** B01, B02a
- Pure `src/ui/list-horizontal.ts` (natural widths vs `LIST_BASELINE_WIDTH`,
  `pinnedCount`, `resolveRowWindow`, `clampHOffset`); `horizontalOffset` on
  `TableModel`, reset on kind change; `‹`/`›` markers; status+Name pinned.
**Done when:** chunk 05's gherkin passes; module 100% covered; gate green.

### B06 — Logs toolbar dropdowns & accelerators
**Specs:** chunk 06. **Deps:** B01, B02a, B04b
- Pure `src/ui/logs-toolbar.ts` (container/line-limit item builders, accelerator
  map) + `container-phase.ts`. Stream default container immediately (no
  full-screen modal); `[Co̲ntainer ▾]`(`o`) + `[100 l̲ines ▾]`(`l`) DropdownButtons;
  toolbar toggles as accelerator Buttons; remove the logs `openPicker` path.
**Done when:** chunk 06's gherkin passes; pure modules 100% covered; gate green.

### B07 — YAML editor
**Specs:** chunk 07. **Deps:** B01, B02a, B03, B04b
- Pure `src/ui/yaml-edit.ts` (cursor/edit ops) + `yaml-apply.ts` (the **entire**
  apply/conflict state machine). `YamlEditor` (local state, scoped `useInput`,
  **preserve the dirty-boot test seam**); `DiffView` prop-driven (kubeClient moves
  to controller); `$EDITOR` pop-out via `suspendRunner` (temp file, `vi`
  fallback, **re-assert the mouse-teardown invariant**). reveal=`v`. Buttons:
  Edit/Apply(Ctrl+S)/Cancel(Esc)/Open-in-$EDITOR(Ctrl+E).
**Done when:** chunk 07's gherkin passes; pure modules 100% covered; `$EDITOR`
round-trip smoke (non-gating) green; gate green.

### B08 — Context-switching polish
**Specs:** chunk 08. **Deps:** B01, B04b
- Pure `src/ui/context-memory.ts` (per-context `{namespace,activeKind}` +
  validated restore) and `context-switch.ts` (`switchStatus` machine; inject
  `Clock` only if a timeout is added). `c` + chip open the switcher (closes on
  pick → header connecting state); error banner with [Retry]/[Switch context];
  persist memory in `layout.json` (`contexts` map, tolerate old schema).
**Done when:** chunk 08's gherkin passes; pure modules 100% covered; gate green.

---

## Phase 4 — Documentation & release (serial)

### B09 — Help overlay & keymap registry
**Specs:** chunk 09. **Deps:** B01, B03, B04b, B05, B06, B07, B08
- Pure `src/ui/keymap.ts` (the single grouped registry — **include the inherited
  list action keys `e/y/d/l/x/p` and `v` reveal**) + grouping/ordering helpers.
  Rebuild `HelpOverlay` grouped, current-region-first, accelerators underlined,
  scrollable; delete the hardcoded `KEYBINDINGS`. Drift tests: registry
  internally consistent; every Button accelerator ∈ KEYMAP.
**Done when:** chunk 09's gherkin + drift tests pass; `keymap.ts` 100% covered;
gate green.

### B10 — Version bump, captures, demo, social card, release
**Specs:** chunk 10. **Deps:** B01–B09
- Bump 0.2.0→0.3.0 in all four locations; **README keymap generated from/checked
  against `keymap.ts`** (B09 drift test is the gating side). Re-capture
  `docs/frames/*.ansi` (showing the new UI + added frames) and regenerate
  `docs/demo.png` (APNG) + `docs/social-preview.png` via `docs/MEDIA.md`
  (`freeze`+ImageMagick; install them; Linux font fallback). Cut the release per
  the `CLAUDE.md` runbook (push `main`, tag `v0.3.0`, verify artifact). Social-
  card upload is the one manual step (no API).
**Done when:** `p9r version` = `0.3.0`; README keymap matches `keymap.ts`; demo +
social card regenerated and committed; gate green. (Media/cluster/release steps
are non-gating; the version assertions + gate are gating.)

---

## Verification tiers

- **Gating (pure unit, every chunk):** all geometry, scroll, SGR parse,
  registry, dispatch, ratios, list-window, keymap, yaml-edit/apply, context
  memory/switch logic — fed synthetic inputs, asserted deterministically.
- **Gating (BDD over the controller):** end-to-end key/click routing on fakes.
- **Non-gating (tmux / real / manual):** real-terminal mouse-mode teardown on the
  wire, `$EDITOR` round-trip, chunk-10 cluster captures + release. These inform,
  not block (matching the repo's existing envtest/tmux exclusion).

---

## Dependency graph (summary)

```
B01 ─┬─────────────► B04a ──► B04b ─┬─► B06
B02a ┼─► B02b        (soft ◄─ B03)  ├─► B07  (also B01,B02a,B03)
     ├─► B03 ────────────────────────┤
     └─► B05                          └─► B08 (also B01)
B01,B03,B04b,B05,B06,B07,B08 ─► B09 ─► B10 (needs B01..B09)
```

Critical path: **B01/B02a → B04a → B04b → B07 → B09 → B10.**
Widest parallelism: after B02a, {B02b, B03, B05} + B04a run independently; after
B04b, {B06, B07, B08} fan out (3-wide).

---

## Chunk completion contract (every chunk)

1. Feature/unit tests written first and initially failing.
2. TDD loop; full unit suite + lint after every green step.
3. Full `bun run gate` green; coverage 100/100/100/100 on `src/**`
   (`src/adapters/**` excluded).
4. No new `eslint-disable`, no coverage-ignore comments (grep gate); discriminated
   unions `switch`ed exhaustively; optional props `?:` and guarded.
5. New decision logic lives in pure `src/ui`/`src/input`; only ref/IO/stdin/
   spawn/timer glue in `src/adapters/live/`.
6. The walking skeleton still launches (`bun run start` against a cluster/fake).
7. The mouse-mode-teardown invariant still holds (re-checked by any chunk
   touching suspend/exit).
