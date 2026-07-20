---
spile: ticket
id: P9R-0013
type: bug
status: verifying
owner: stefan
resolution:
blocked_by: []
created: 2026-07-20
relations:
  depends_on: []
  relates_to: [P9R-0005]
  supersedes: []
implementation: []
---

# P9R-0013: Quit leaves the full TUI painted on screen; exec pane renders outside the app frame

## Summary

On quit, p9r must restore the terminal: leave the alternate screen (or
clear its frame), so the shell prompt returns on a clean screen. Today the
process exits but the entire last frame stays painted, which reads as a
hang — the QA driver pressed `q` twice believing the first was ignored.
Relatedly, the exec PTY renders *below* the app's bottom border (the frame
stays fully drawn above it, prefixed by a garbage line like ` (`), rather
than inside a dedicated region or a full-screen takeover.

## User Stories

### As a user, I want a clean exit

- Given the app is running, when I press `q` (or Ctrl+C), then the terminal
  returns to my shell with the TUI frame gone and the cursor restored; any
  stderr the app buffered prints *after* restore, visibly.

### As a user, I want exec to own the screen properly

- Given an exec session starts, then the TUI yields the **full screen** to
  the PTY (decided 2026-07-20: full takeover, k9s-style — suspend Ink,
  restore the TUI when the shell exits); the PTY gets the terminal's real
  width/height and TERM so curses apps (vim, htop) work inside the
  container; no stray partial lines, and the app frame is never visible
  while a shell is live.

## Functional Requirements

- Terminal teardown (screen restore + mouse-mode disable + cursor show) runs
  on every exit path: `q`, Ctrl+C, quit guard, crash.
- Exec entry/exit performs the same suspend/restore discipline.

## Assumptions

- Mouse modes are already disabled on quit (not re-verified in this pass).

## Risks

- Ink lifecycle quirks under Bun on exit paths.

## Open Questions

- None — decided 2026-07-20: full-screen takeover.

## Notes

> [!NOTE]
> Observed (blackbox QA, 2026-07-20, tmux): after `q` the process was gone
> (pane fell through to the trailing `sleep`) but the complete UI frame
> remained painted; a second `q` echoed as shell input below the frame.
> During exec, the shell prompt appeared below the app's bottom border with
> a stray ` (` line, while the full app UI stayed drawn above.
