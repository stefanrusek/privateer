# Navigation Overhaul

Status: **DRAFT** — spec in progress (Gate 1 not yet passed).

## Purpose

A cohesive overhaul of p9r's keyboard/mouse navigation and detail-pane UX. It
makes movement learnable (**Tab moves between regions, arrows move within a
region**), gives every region a visible focus indicator, fixes a family of
layout/wrapping bugs, makes the detail pane fully scrollable, makes the YAML
tab editable, and polishes single-context switching.

This spec set drives an unattended implementation pipeline. Each chunk file is
**self-contained**: an implementer reading only `specs/navigation-overhaul/`
(plus the codebase and the canonical `spec/`) must be able to build it without
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
  (ink-mouse removed). Three components register targets — `<Button>` (discrete
  non-nestable leaves), `<FocusableRegion>` (root-level focusable layouts), and
  `<SelectableList>` (row model for the list/sidebar). Wheel routes by cursor
  geometry; the two shared border lines are drag-resize handles; clicking the
  context/namespace/tabs/✕ are all Buttons.
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
- New logic belongs in pure, fully-covered modules (`src/ui`, `src/store`,
  `src/k8s`, `src/exec`, …); only thin glue goes in `src/adapters/`.
- When behavior conflicts, the canonical `spec/` wins; where this overhaul
  changes canonical behavior, the relevant `spec/spec-02-navigation-layout.md`
  (and siblings) must be updated in the same chunk.

## Chunks

| #  | File                                   | Title                          | Deps           | Status |
|----|----------------------------------------|--------------------------------|----------------|--------|
| 01 | `01-focus-keyboard-routing.md`         | Focus & keyboard routing model | —              | DRAFT  |
| 02 | `02-region-chrome-layout-math.md`      | Region chrome & layout math    | —              | DRAFT  |
| 03 | `03-detail-scroll-viewport.md`         | Detail scroll viewport         | 01, 02         | DRAFT  |
| 04 | `04-mouse-interaction.md`              | Mouse: registry, components, dispatch | 01, 02, 03 | DRAFT  |
| 05 | `05-list-horizontal-scroll.md`         | List horizontal scroll         | 01, 02         | DRAFT  |
| 06 | `06-inline-logs-container-picker.md`   | Inline Logs container picker   | 02, 04         | TODO   |
| 07 | `07-yaml-editor.md`                    | YAML editor                    | 01, 02, 03, 04 | TODO   |
| 08 | `08-context-switching-polish.md`       | Context-switching polish       | 01             | TODO   |
| 09 | `09-help-overlay-revamp.md`            | `?` help overlay revamp        | 01, 03, 05, 07 | TODO   |

## Ordering & dependencies

```
01 ─┬─> 03 ─> 04 ─┬─> 06
02 ─┘             └─> 07   (07 also needs 01, 02, 03)
01 ─> 05
01 ─> 08
01,03,05,07 ─> 09
```

Critical path: **01 → 02 → 03 → 04 → 07 → 09**. Chunk 04 (the mouse
infrastructure: registry + `<Button>`/`<FocusableRegion>`/`<SelectableList>`) is
now a hub — 06's inline picker items and 07's Save/Cancel adopt `<Button>` from
it. Widest parallelism is after 02: **05 and 08** can proceed independently of
the 03→04 spine; **09** is sequenced last so it documents the final keymap.
