---
name: tui-manual-test
description: >-
  Manually QA the p9r TUI by driving the REAL app under tmux against a live
  cluster — generate a test plan from the keymap + specs, exercise every
  feature/keyboard/mouse interaction, find bugs the automated gate can't see,
  and loop until a clean run. Use this whenever asked to manually test,
  smoke-test, QA, "drive the app", verify the TUI actually works, or confirm a
  fix in the running app — and ALSO use it proactively as a quality gate during
  implementation: after building a chunk, before declaring a feature done, and
  before any release. A green `bun run gate` (coverage/lint/tests/BDD) proves
  the tests pass, NOT that the app works — in this codebase 14 real bugs once
  shipped through a 100%-coverage, 560-scenario-green gate and only surfaced by
  driving the live terminal. Reach for this skill even when the user only says
  "test it" or "make sure it works," not just when they say "manual test."
---

# Manual TUI testing — drive the real thing

## Why this exists

`bun run gate` runs against fakes and `ink-testing-library`. It cannot see a
process that never exits, a render loop that floods stderr, a click that lands
one row off, a dialog whose Enter key is swallowed, or a PUT that always 409s.
Those are **terminal-and-integration** failures, and the only way to catch them
is to launch the binary, drive it like a user, and look at what actually renders.

The governing principle: **a green gate is necessary but not sufficient.** Treat
"tests pass" and "it works" as two different claims, and verify the second one
here. The corollary discipline — *verify the specific expected detail, trust no
self-report, and distinguish a real bug from a test-harness artifact* — is what
separates a useful pass from a rubber stamp. See `references/discipline.md`.

## Two modes

**Mode A — full manual pass** (on demand, or before a release). Exercise the
whole surface: every keyboard binding, every feature, every mouse interaction.
Find bugs, fix them, re-run, loop until a clean pass. This is what you run when
the user says "manually test the app" or "QA this before release."

**Mode B — periodic quality gate** (during implementation). A fast, focused
drive run after a build chunk lands or before declaring a feature done:
1. Launch the app; confirm it starts and the walking skeleton renders.
2. Drive the **specific area the chunk touched** and verify its acceptance
   criteria against what renders (not just that it didn't crash).
3. Run the **core-flow sanity sweep** (sidebar nav → list select → open detail →
   switch tabs → scroll → open help → quit) so a chunk didn't break a neighbor.
4. Grep stderr for `Maximum update depth`, `Error`, `TypeError`, stack traces —
   a flood or trace is a FAIL even if the screen looks fine.
5. Confirm `q` actually exits and leaves no orphaned child processes.

Mode B is cheap and should run often. Mode A is thorough and runs at milestones.

## The test plan

The plan lives at `docs/manual-test-plan.md` and is **derived, not invented**:

- **Keyboard:** `src/ui/keymap.ts` is the authoritative registry. Every binding
  in it must have a test. (`renderKeymapMarkdown()` gives the grouped list.)
- **Features & acceptance criteria:** the `specs/NNN-*/` chunk files and the
  canonical `specs/001-initial-features/spec-0*.md`. Each acceptance criterion and each "Bugs fixed"
  item becomes a checkable test — bug-fixes especially need regression tests.
- **Mouse:** the mouse spec (`specs/*/04-mouse-interaction.md`) — region-focus
  click, row select, second-click-opens, wheel-by-cursor, drag-resize handles,
  measured-button/dropdown/accelerator clicks, ✕ close, mode teardown on exit.
- **BDD:** mine `features/**/*.feature` for concrete given-when-then expectations.

Each test is a row: **ID · area · preconditions · exact steps (keys/SGR mouse) ·
expected (specific & checkable) · result**. Refresh the plan when the keymap or
specs change — a drifted plan tests the old app. When you finish a wave, record
PASS/`FAIL — what happened` per test back into the plan so the record persists.

## Running a pass

Read `references/driving.md` for the tmux / capture / key-send / SGR-mouse
mechanics **before driving** — the click-coordinate math in particular has a
multibyte-glyph trap that produces false failures if you get it wrong.

For a full pass, split the plan into waves by area (≈one tmux session per wave,
**one app session at a time** — parallel TUIs and concurrent `bun run gate` runs
thrash an 8-core host). For each test: perform the steps → capture → compare to
the *specific* expected detail → record the result. For every FAIL capture the
smallest repro from a fresh launch plus evidence (SGR-stripped pane lines, or a
byte dump for a rendering glitch) and a severity (CRASH / FUNCTIONAL / VISUAL /
MINOR).

Then **fix the bugs and loop**: fix → `bun run gate` green → re-drive the failing
tests (and a sanity sweep) → repeat until a wave is clean. Fixing blockers early
(a hung quit, a dead confirm dialog) unblocks the tests they were gating, so do
those first. The pass is done when every test passes, no regressions appear, and
stderr is free of render-loop/error lines.

## What to probe for

Bugs cluster into a handful of classes that the automated gate structurally
misses. `references/failure-classes.md` lists them with the concrete failures
from this codebase — read it to know *what to look for*, not just *how to look*.
The short list: process **lifecycle/teardown** (quit hangs, leaked children,
mouse modes left on), **state staleness** (deleted rows linger, stale
resourceVersion → spurious 409, stale measured rects), **input routing** (dialogs
that can't be confirmed, keys eaten by an over-broad filter, `/` leaking across
regions), **measured-widget hit-testing** (off-by-one rows, wrong layer, a button
wired to the wrong handler), **rendering** (a bordered box clipping its first
cell, toolbars overlapping, content clipped past the viewport), and
**persistence** (state never flushed on quit).

## Reporting

End with a tight, structured report — the FAIL list (each with smallest repro +
evidence + severity), per-section PASS/FAIL counts, anything un-executable and
why, and a one-line **BOTTOM LINE: CLEAN** or the exact remaining failures. A
clean run means every previously-failed test now passes, no regressions, and zero
render-loop/error lines across the session.
