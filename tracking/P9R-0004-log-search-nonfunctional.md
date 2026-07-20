---
spile: ticket
id: P9R-0004
type: bug
status: ready
owner: stefan
resolution:
blocked_by: []
created: 2026-07-20
relations:
  depends_on: []
  relates_to: []
  supersedes: []
implementation: []
---

# P9R-0004: Log search (`/`, `n`, `N`) is non-functional — keystrokes fall through to hotkeys

## Summary

Pressing `/` in the Logs tab must open a visible inline search input that
captures all typed characters until Enter/Esc. Today no input appears and
typed characters are interpreted as log-tab hotkeys (typing a term
containing `P` toggles previous-instance logs).

## User Stories

### As a user, I want to search the visible logs

- Given the Logs tab, when I press `/`, then an inline search bar appears
  (e.g. above the log body or in the toolbar row) with a visible cursor,
  and every subsequent printable keystroke goes into the search bar only —
  no log hotkey (`p`, `t`, `w`, `P`, `d`, `o`, `l`) may fire.
- Given I typed a term and pressed Enter, then all matches in the loaded
  log buffer are highlighted, the view jumps to the nearest match, and a
  match counter (`3/17`) is shown; live tail pauses while a search is
  active.
- Given an active search, when I press `n`/`N`, then the view moves to the
  next/previous match, wrapping with an indicator.
- Given an active search, when I press Esc, then the search UI closes,
  highlights clear, and hotkeys resume.
- Given a term with no matches, then the bar shows `0/0 — no matches` and
  the view does not move.

## Functional Requirements

- Search is a modal input scoped to the Logs tab; input capture must be
  exclusive while open.
- Case-insensitive substring match by default.
- Search state (term, position) survives toggling wrap/timestamps but resets
  on container switch.

## Assumptions

- Search operates on the currently loaded lines (per the line-limit
  dropdown), not the full remote stream.

## Risks

- Input-routing regression risk for other overlays; needs coverage of key
  fall-through.

## Open Questions

- Regex support? (Suggest: not in v1.)

## Notes

> [!NOTE]
> Observed (blackbox QA, 2026-07-20): `/` produced no visible UI; typing
> `PASS` then Enter triggered the `P` (previous instance) hotkey and the
> other characters were swallowed. `n`/`N` untestable. The README and `?`
> help both advertise log search.
