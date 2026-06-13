# Chunk 08 — Context-switching polish

**Status:** DRAFT
**Depends on:** 01 (global-key routing + focus model), 04 (the header **context**
chip is a `<Button>` that opens the switcher; switcher items are clickable
`<Button>`s on the overlay layer)
**Implements / amends:** `spec/spec-01-*` §6 (context switching) and
`spec/spec-02-navigation-layout.md` §4 (the switcher). Update where this changes
behavior.

## User stories

> As a user with several clusters, I want to **press `c` to switch context** and
> see **which one I'm on**, instead of remembering the `!ctx` command.

> As a user, when I switch context I want **feedback while it connects** and a
> **clear error with a way out** if it can't, so I'm never staring at a frozen or
> silently-broken screen.

> As a user, when I come back to a context I want it to **remember the namespace
> and the kind I was looking at**, so switching back and forth doesn't reset me to
> Overview / all-namespaces every time.

## How it works today

- The switcher opens **only** via the `!ctx` bang command
  (`runBangCommand`, controller.ts:1919) → `contextSwitcherOpen = true`. There is
  **no `c` key**.
- `switchContext` (controller.ts:1755) stops streams, swaps the kube client +
  store, and **hard-resets**: `namespace: ''`, `activeKind: 'Overview'`,
  `showDetail: false`, clears the table/health. Then `startStreams()` runs. It is
  a synchronous swap with **no connecting/error state** — if the new context is
  unreachable you only find out via the table's `connection-error` loadState
  later.
- `layout.json` persists `sidebarRatio` / `verticalRatio` / `tabByKind`
  **globally** (loadLayout/saveLayout, controller.ts:417/448). Nothing is stored
  **per context**.
- `ContextSwitcher.tsx` is a dedicated modal with type-to-filter (kept — it is
  **not** the `DropdownButton`; contexts get their own switcher per the chunk-04
  decision).

## Behavior

### 1. Wire `c` (and the chip)
- **`c`** opens the context switcher in normal mode (alongside the existing
  `!ctx`, which stays). `c` is free now (chunk 06 removed the Logs `c`-cycle).
  It's a global normal-mode key (not while a text input/command/search/edit mode
  is active, where `c` is a literal character — handled earlier in dispatch, as
  with `q`).
- The header **context chip** (`<Button>`, chunk 04) opens the same switcher on
  click. Discoverability: the chip shows the key via chunk 04's accelerator
  prefix-badge (`c̲:<context>`) since the key isn't reliably a letter of the
  context name.

### 2. Show the active context
- The switcher **marks the current context** (accent + a marker) and, during a
  switch, shows the **pending target**.
- Switcher entries are `<Button>`s (click to pick); the filter and `↑/↓`/Enter/
  Esc keep working.

### 3. Connecting / error feedback
A switch is no longer assumed instant. Model a transient **switch status**:

```
switchStatus: { ctx: string; phase: 'connecting' } 
             | { ctx: string; phase: 'error'; reason: string }
             | null
```

- On selecting a context, the switcher **closes immediately** and the header
  shows `… connecting to <ctx>` — the switcher's job is done once a choice is
  made; the connecting state lives in the header, not a lingering modal spinner.
- **Connected:** the first successful stream sync (the existing stream/connection
  signal that drives `TableModel.loadState`) clears `switchStatus` to `null`.
- **Error** (auth/network/unreachable): set `phase:'error'` with the reason and
  show a persistent banner: `✗ Could not connect to <ctx>: <reason>` with two
  actions (`<Button>`s + keys): **[Retry]** (re-run `startStreams`) and
  **[Switch context]** (reopen the switcher). The user is never stranded.
- Switching **to the context you're already on** is a no-op (as today).

### 4. Per-context memory (persisted)
- Remember **`{ namespace, activeKind }` per context**, persisted in
  `layout.json` under a new `contexts: Record<string, {...}>` map (extend
  load/save; tolerate the old schema with no `contexts` key).
- On `switchContext`: **save** the *outgoing* context's current
  `{ namespace, activeKind }` first, then **restore** the *incoming* context's
  remembered values (default `namespace: ''`, `activeKind: 'Overview'` when none
  saved).
- **Validate on restore** (the new cluster may differ): a remembered
  `activeKind` is restored only if it exists for the new context, else fall back
  to `Overview`; a remembered `namespace` is applied only once namespaces load
  and it still exists, else fall back to all-namespaces. The hard-reset of
  table/health/detail/streams otherwise stays.

## Where the logic lives (coverage)

- `src/ui/context-memory.ts` (new) — pure, **100% covered**: the per-context map
  type, `remember(map, ctx, {namespace, activeKind})`, and
  `restore(map, ctx, { availableKinds, availableNamespaces })` returning the
  validated `{namespace, activeKind}` (with the Overview / all-namespaces
  fallbacks). Plus the `layout.json` `contexts` (de)serialization shape.
- `src/ui/context-switch.ts` (new) — pure, **100% covered**: the `switchStatus`
  state machine (`connecting → connected | error`) and its transitions from the
  stream/connection signals.
- `controller.ts` (excluded adapter) — wires `c` + the chip to open the switcher,
  drives the switch status from the stream signals, and persists/restores via the
  pure module. No state-machine or validation logic of its own.
- `ContextSwitcher.tsx` — gains the current marker + connecting/error affordance,
  rendered prop-driven; entries become `<Button>`s. Covered as today.

## Acceptance criteria (given-when-then)

```gherkin
Feature: Open the switcher

  Scenario: c opens the context switcher
    Given normal mode
    When I press "c"
    Then the context switcher opens with the current context marked

  Scenario: c is literal while typing
    Given the resource-list search is active
    When I press "c"
    Then "c" is appended to the search and the switcher does NOT open

  Scenario: Clicking the context chip opens the switcher
    When I click the context chip in the header
    Then the context switcher opens
```

```gherkin
Feature: Connecting and error feedback

  Scenario: Switching shows a connecting state then settles
    Given I pick a different, reachable context
    Then the switcher closes immediately
    And the header shows it connecting
    And when the first sync arrives the connecting state clears

  Scenario: A failed switch surfaces an error with a way out
    Given I pick a context that cannot be reached
    Then a "Could not connect" banner is shown with [Retry] and [Switch context]
    When I choose [Switch context]
    Then the switcher reopens so I can pick another
```

```gherkin
Feature: Per-context memory

  Scenario: Namespace and kind are restored on return
    Given in context A I am viewing Deployments in namespace "web"
    When I switch to context B and then back to context A
    Then context A reopens on Deployments in namespace "web"

  Scenario: Remembered kind that is absent falls back to Overview
    Given context A remembered a kind that context B does not have
    When I switch to context B
    Then context B opens on Overview

  Scenario: Memory persists across restarts
    Given I set a namespace and kind in a context and quit
    When I relaunch and switch to that context
    Then the remembered namespace and kind are restored
```

## Out of scope
- The header chip itself (chunk 04 builds the `<Button>`; this chunk gives it the
  open-switcher behavior + the connecting/error affordance).
- Multi-cluster simultaneous views — one active context at a time, as today.
- The namespace **picker** (chunk 04 `DropdownButton`); this chunk only
  *remembers/restores* the namespace value per context.

## Done when
- `c` and the context chip both open the switcher; the switcher marks the current
  context and its entries are clickable; `!ctx` still works.
- A switch shows a connecting state, clears on first sync, and on failure shows a
  banner with [Retry] and [Switch context] — never a frozen/silent screen.
- Namespace + active kind are remembered per context and restored (with
  Overview / all-namespaces fallbacks when absent), persisted in `layout.json`
  across restarts.
- The memory, restore-validation, and switch-status logic live in pure,
  100%-covered modules; the controller only wires and persists.
- `bun run gate` is green.
