# Navigation Overhaul

Status: **Gate 1 passed** — spec hardened by a multi-agent audit + a verified
spike. Build-order plan drafted in [`build-order-01.md`](build-order-01.md);
**awaiting Gate 2 approval** before any implementation.

## Purpose

A cohesive overhaul of p9r's keyboard/mouse navigation and detail-pane UX. It
makes movement learnable (**Tab moves between regions, arrows move within a
region**), gives every region a visible focus indicator, fixes a family of
layout/wrapping bugs, makes the detail pane fully scrollable, makes the YAML
tab editable, and polishes single-context switching.

This spec set drives an unattended implementation pipeline. Each chunk file is
**self-contained**: an implementer reading only `specs/002-navigation-overhaul/`
(plus the codebase and the canonical `specs/001-initial-features/`) must be able to build it without
this conversation.

## Scope at a glance

- **Keyboard model:** `Tab`/`Shift+Tab` cycle regions; arrows act within the
  focused region. List `←/→` = horizontal scroll (natural-width viewport; the
  status dot + `Name` columns stay pinned, the rest pan together).
  Detail `←/→` = switch tabs, `↑/↓` = scroll content.
- **Focus indicator & frame:** all regions (header, sidebar, list, detail,
  command bar) are bordered, with borders **collapsed** into one connected grid
  (Option A: full-width header/command bar, full-height sidebar). The focused
  region is highlighted, others dim. The header shows the current context left
  of the namespace. Width/height math accounts for borders.
- **Mouse:** a single SGR stdin stream feeds a **hit-region registry**
  (ink-mouse removed). Four components register targets — `<Button>` (discrete
  non-nestable leaves), `<FocusableRegion>` (root-level focusable layouts),
  `<SelectableList>` (row model for the list/sidebar), and `<DropdownButton>`
  (trigger + anchored, optionally filterable overlay list). Wheel routes by
  cursor geometry; the two shared border lines are drag-resize handles. Discrete
  widgets carry **accelerator keys** (the trigger letter is underlined in the
  label). The header **namespace** filter and the Logs container/line-limit are
  `DropdownButton`s; the header **context** chip is a plain `<Button>` opening the
  dedicated context switcher (chunk 08).
- **Detail scrolling:** a real scroll viewport on every detail tab. Logs:
  scrolling up pauses live-tail and walks the ring buffer; returning to the
  bottom resumes tail.
- **YAML editing:** in-pane multi-line editor **and** pop-out to `$EDITOR`;
  Save applies to the cluster (with confirm); Cancel/Revert discards pending
  edits.
- **Context switching:** wire the `c` key; show the active context clearly;
  reconnect/error feedback during a switch; remember namespace + selected kind
  per context (persisted).
- **Help:** rebuild the `?` overlay to be accurate and grouped by region/tab.
- **Release & media:** bump the version (0.2.0 → 0.3.0) and cut the release;
  re-capture the `docs/frames/*.ansi` screens against the new UI and regenerate
  the README demo APNG + GitHub social card via the existing `docs/MEDIA.md`
  pipeline (`freeze` + ImageMagick); update the README keymap from chunk 09's
  registry.
- **Bugs fixed:** list wrap-by-one; metrics-tab wrapping; Logs container picker
  rendered as a full-screen modal instead of inside the detail area; `/` in the
  Logs tab leaking to the global pod filter; wheel/arrows scrolling the list
  while the detail pane is focused.

## Project conventions (apply to every chunk)

- `bun run gate` must be green before a chunk is done (format, lint,
  lint:grep, typecheck, test, bdd). Coverage is 100/100/100/100 on `src/**`
  (`src/adapters/**` excluded — thin wiring only; logic goes in pure modules).
- Coverage-ignore comments and the escape hatches banned by
  `scripts/grep-gate.sh` are forbidden.
- New logic belongs in pure, fully-covered modules (`src/ui`, `src/input`,
  `src/store`, `src/k8s`, `src/exec`, …); only thin glue goes in `src/adapters/`.
  (Chunk 04's mouse parser/registry/drag-latch already exist as tested modules
  under `src/input/` — extend them, don't reinvent.)
- When behavior conflicts, the canonical `specs/001-initial-features/` wins; where this overhaul
  changes canonical behavior, the relevant `specs/001-initial-features/spec-02-navigation-layout.md`
  (and siblings) must be updated in the same chunk.

## Chunks

| #  | File                                   | Title                          | Deps           | Status |
|----|----------------------------------------|--------------------------------|----------------|--------|
| 01 | `01-focus-keyboard-routing.md`         | Focus & keyboard routing model | —              | DRAFT  |
| 02 | `02-region-chrome-layout-math.md`      | Region chrome & layout math    | —              | DRAFT  |
| 03 | `03-detail-scroll-viewport.md`         | Detail scroll viewport         | 01, 02         | DRAFT  |
| 04 | `04-mouse-interaction.md`              | Mouse: registry, components, dispatch | 01, 02, 03 | DRAFT  |
| 05 | `05-list-horizontal-scroll.md`         | List horizontal scroll         | 01, 02         | DRAFT  |
| 06 | `06-inline-logs-container-picker.md`   | Logs toolbar dropdowns & accelerators | 01, 02, 04 | DRAFT |
| 07 | `07-yaml-editor.md`                    | YAML editor                    | 01, 02, 03, 04 | DRAFT  |
| 08 | `08-context-switching-polish.md`       | Context-switching polish       | 01, 04         | DRAFT  |
| 09 | `09-help-overlay-revamp.md`            | `?` help overlay & keymap registry | 01,03,04,05,06,07,08 | DRAFT |
| 10 | `10-release-and-media.md`              | Version bump, screenshots, demo & social preview | 01–09 | DRAFT |

## Ordering & dependencies

```
01 ─┬─> 03 ─> 04 ─┬─> 06   (06 also needs 01, 02)
02 ─┘             └─> 07   (07 also needs 01, 02, 03)
01,02 ─> 05
01,04 ─> 08
01,03,04,05,06,07,08 ─> 09
01..09 ─> 10
```

Critical path: **01 → 02 → 03 → 04 → 07 → 09 → 10**. Chunk 04 (the mouse
infrastructure: registry + `<Button>`/`<FocusableRegion>`/`<SelectableList>`/
`<DropdownButton>`) is a hub — 06's dropdowns and 07's action buttons adopt it.
Widest parallelism is after 02: **05** is independent of the 03→04 spine, and
**06/07/08** fan out from 04; **09** documents the final keymap; **10** is the
release/media wrap-up and depends on everything before it (it captures the
finished UI).

## Build-order notes (recorded for the Gate-2 plan)

These chunk files stay as **coherent behavior units**; the **build-order plan**
(written at Gate 2) will turn them into the recommendations below — captured here
so they survive a hand-off. They come out of a four-agent audit of this spec set.

- **Split chunk 02** into **02a** (geometry math — `computeFrame`/Rects/handles,
  rewire `tableWidth`/`visibleHeight`/chart width, **keep the current Ink
  chrome**) and **02b** (the collapsed-grid glyph renderer). Keeps the walking
  skeleton launchable through the render rewrite.
- **Split chunk 04** into **04a** (SGR parse + registry + dispatch + ratios;
  **wire the existing `src/input/{mouse,hit-testing,drag}.ts`**, remove
  ink-mouse; frame-derived hit-testing only) and **04b** (the measured
  `<Button>`/`<FocusableRegion>`/`<SelectableList>`/`<DropdownButton>` wrappers +
  `measure.ts` + accelerators). This quarantines the Yoga-measurement risk in a
  swappable sub-chunk and lets wheel/drag/region-click land before any
  measurement.
- **Relax 04 ← 03 to a soft dep:** 04 only needs 03's `scrollBy` seam (for the
  wheel handler), so give it a stub and let 03 and 04a run in parallel.
- **Spike: DONE.** The riskiest assumption — Yoga absolute-rect measurement under
  Bun + Ink 5 — was proven in a throwaway harness (result recorded in chunk 04);
  no go/no-go risk remains for 04b.
- **Reuse, don't reinvent:** chunk 04's parser/registry/drag-latch already exist
  and are tested under `src/input/` — the chunk integrates them.
- **One invariant (adversarial):** mouse modes hard-disabled on every exit/
  suspend path (owned by 04, re-asserted by 07).
