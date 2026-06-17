# Verification discipline

A manual pass is only as good as its skepticism. These four habits decide
whether you find real bugs and whether your "clean run" is actually clean.

## 1. The gate proves tests pass, not that the app works

Hold "`bun run gate` is green" and "the feature works" as **separate claims**.
The gate runs against fakes and a string-buffer renderer; it cannot observe the
process, the terminal, the cluster round-trip, or the composited frame. Every
class in `failure-classes.md` is something a 100%-coverage, all-BDD-green build
shipped anyway. So never let a green gate stand in for "done" — the live drive is
the second, independent claim, and it's the one users experience.

## 2. Verify the *specific* expected detail

"The screen looks right" is how off-by-ones survive. For each test, decide the
exact observable *before* you act, then check that exact thing:

- clicking list row Y selects the pod **named on row Y** — read the name back,
  don't just confirm "a row got selected."
- clicking the **Events** tab shows Events — not "a tab changed."
- after `G` in logs, the **newest** line sits on the bottom visible row.
- a focus change moves the accent border and **nothing else** — diff the capture
  before/after; zero cells should shift.

Vague confirmation is the difference between a rubber stamp and a test.

## 3. Distinguish a real bug from a test-harness artifact

The driver is fallible too. Before reporting a FAIL, reproduce it a second time
from a fresh launch and, where you can, root-cause it in the code — a bug you
can point at a line for is real; one you can't may be your harness. Two false
alarms from this codebase:

- A "discard-confirm clicks do nothing" failure was a **column miscalculation** —
  the verifier byte-counted multibyte box glyphs and clicked the wrong button.
  With correct Unicode-character columns the clicks worked. (See `driving.md`.)
- A "port-forward prompt ignores Backspace" report was a **fixture limit** — the
  demo pods only expose a privileged port that fails to bind locally; the
  backspace handler was fine.

Equally, don't explain away a *real* failure as "probably a capture glitch." The
test is: does it reproduce, and can you find it (or its absence) in the code?

## 4. Trust no self-report — re-verify independently

When work is delegated (a fix subagent, a parallel wave), its "verified, passes"
is **untrusted telemetry**, not a result. This session a fix agent reported two
click bugs fixed that were still broken on an independent re-drive; another
over-claimed a discard-confirm fix. Re-drive the relevant tests yourself from a
fresh launch after any fix. The running terminal is the arbiter — not a summary,
not the diff, not the gate.

## Putting it together

A pass is trustworthy when: each test checked a specific observable; every FAIL
was reproduced and (ideally) traced to code; every fix was re-driven independently
afterward; and the final sweep shows all previously-failed tests passing, no
regressions, and zero render-loop/error lines in stderr. Anything short of that is
a draft, not a clean run.
