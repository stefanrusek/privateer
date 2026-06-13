# Chunk 09 — `?` help overlay revamp & keymap registry

**Status:** DRAFT
**Depends on:** 01, 03, 05, 06, 07, 08 (every chunk that defines or moves a key;
this chunk documents the **final** keymap), 04 (accelerator registry it shares)
**Implements / amends:** `spec/spec-02-navigation-layout.md` §4 (help). Update
where this changes behavior.

## User story

> As a user, I want `?` to show me an **accurate** key reference **grouped by
> where I am** (global vs sidebar/list/detail-tab/command bar), so I can actually
> learn the keys instead of reading a stale flat list.

## What exists today

`HelpOverlay.tsx` renders a **hardcoded flat `KEYBINDINGS` array** that is
already wrong: it lists `c` (context switcher — not wired until chunk 08), `:`
for command mode (it's `Space`/`!`), and omits most real keys. There is **no
single source** tying the help text to the actual bindings, so it drifts every
time a key changes.

## The keymap registry (single source of truth)

Introduce `src/ui/keymap.ts` (pure, **100% covered**) as the **one declaration**
of every binding, grouped by scope:

```
KeyBinding  = { keys: string; description: string; accelerator?: string }
KeyGroup    = { scope: Scope; title: string; bindings: KeyBinding[] }
Scope = 'global' | 'sidebar' | 'list'
      | 'detail' | 'detail.logs' | 'detail.yaml' | 'detail.metrics'
      | 'commandBar' | 'overlay'
KEYMAP: KeyGroup[]
```

Everything that documents keys reads from `KEYMAP`:
- the **help overlay** (this chunk) renders it grouped;
- the **README** keymap (chunk 10) is generated from / checked against it;
- chunk 04's **accelerators** are the `accelerator` entries here, so the
  underlined-letter buttons and the help text cannot disagree.

### Final keymap (the content `KEYMAP` must encode)

- **Global:** `Tab`/`Shift+Tab` cycle regions · `q` quit · `?` help · `/` search
  · `n` namespace picker · `Space` agent/command · `!` command · `c` context
  (chunk 08) · `r` refresh · `F` port-forwards · `+`/`-` (or `Alt+↑/↓`) resize
  the split · **mouse:** wheel scrolls under the cursor, drag the border lines to
  resize, click to focus/select.
- **Sidebar:** `↑/↓` (`j/k`) move · `←` collapse/parent · `→`/`Enter`
  expand/select · `h`/`l` collapse-all / expand-all.
- **List:** `↑/↓` (`j/k`) select · `←/→` horizontal scroll (chunk 05) · `g g`
  top · `G` bottom · `Enter` open detail.
- **Detail (all tabs):** `←/→` previous/next tab · `↑/↓` scroll (chunk 03) ·
  `1–6` jump to tab · `Esc` close pane.
- **Detail · Logs:** `/` search · `n`/`N` next/prev match · `o` container
  dropdown · `l` line-limit dropdown · `p` pause · `t` timestamps · `w` wrap ·
  `P` previous instance · `d` download (chunk 06).
- **Detail · YAML:** `e` edit · *(editing)* `Ctrl+S` save (review diff) ·
  `Ctrl+E` open `$EDITOR` · `Esc` cancel · `r` reveal (Secrets) (chunk 07).
- **Detail · Metrics:** `[` / `]` change range.
- **Command bar:** type · `Enter` run · `Esc` cancel.
- **Overlays (switcher / pickers / dropdowns):** `↑/↓` (`j/k`) move · `Enter`
  select · `Esc` close · type to filter (where filterable).

## The overlay

- `HelpOverlay.tsx` renders `KEYMAP` **grouped with headings**, keys styled (and
  accelerator letters underlined to match the buttons).
- **Context-aware ordering:** the group for the **current region/tab** is shown
  **first / emphasized**, with Global next, then the rest — so help is relevant
  to where the user is. (The overlay receives the current `focus` + detail
  `tab`.)
- It is **scrollable** (`↑/↓`) when it exceeds the screen; `?` or `Esc` closes.
- Rendered on chunk 04's overlay layer; closing returns focus where it was.

## Drift guard (accuracy is the point)

- A test asserts the registry is **internally consistent**: every `accelerator`
  is a letter present in its binding's `keys`/label, and no accelerator collides
  within a scope.
- A test asserts **no stale/missing keys**: every accelerator declared by a
  chunk-04 `<Button>`/`<DropdownButton>` appears in `KEYMAP`, and the chunk-10
  README keymap matches `KEYMAP` (chunk 10's README check consumes this).
- The old hardcoded `KEYBINDINGS` array is **deleted**.

## Where the logic lives (coverage)

- `src/ui/keymap.ts` — the registry + grouping/lookup helpers
  (`groupsFor(scope)`, ordering for the current region). Pure, **100% covered**.
- `HelpOverlay.tsx` — prop-driven (`focus`, `tab`, scroll offset), renders from
  `KEYMAP`. Covered as today.
- `controller.ts` (excluded) — only passes the current `focus`/`tab` and the
  overlay scroll offset; no key data of its own.

## Acceptance criteria (given-when-then)

```gherkin
Feature: Accurate, grouped help

  Scenario: Help is grouped by scope
    When I press "?"
    Then the overlay shows keys under headings (Global, Sidebar, List, Detail…)
    And every key shown is a real binding from chunks 01–08

  Scenario: Help leads with my current context
    Given the detail pane is focused on the Logs tab
    When I open help
    Then the Logs key group is shown first or emphasized
    And the Global group is also shown

  Scenario: Accelerator letters are underlined to match the buttons
    Given the Logs key group is shown
    Then the "o" in the container binding is underlined like the [Co̲ntainer ▾] button

  Scenario: Help scrolls and closes
    Given the help overlay is open and taller than the screen
    When I scroll down
    Then more bindings are revealed
    When I press "?" or Escape
    Then the overlay closes and focus returns where it was
```

```gherkin
Feature: No drift

  Scenario: Every button accelerator is documented
    Then every <Button>/<DropdownButton> accelerator appears in KEYMAP

  Scenario: The README keymap matches the registry
    Then the README keymap (chunk 10) equals what KEYMAP declares
```

## Out of scope
- Changing any binding — this chunk **documents** the keymap chunks 01–08
  define; if a key is wrong, fix it in the owning chunk, not here.
- User-rebindable keys — the keymap is fixed.

## Done when
- `src/ui/keymap.ts` is the single source for all key documentation; the old
  hardcoded list is gone.
- `?` shows an accurate, scope-grouped overlay that leads with the current
  region/tab, with accelerators underlined; it scrolls and closes on `?`/`Esc`.
- Drift tests pass: registry is internally consistent, every button accelerator
  is in `KEYMAP`, and the chunk-10 README keymap matches it.
- Registry + grouping logic live in pure, 100%-covered modules.
- `bun run gate` is green.
