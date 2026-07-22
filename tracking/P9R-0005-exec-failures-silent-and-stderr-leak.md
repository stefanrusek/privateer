---
spile: ticket
id: P9R-0005
type: bug
status: implementing
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

# P9R-0005: Exec failures are silent; the error leaks to stderr instead of the UI

## Summary

When `x` (exec) fails to start — most commonly because the container image
has no shell — the user must see an explanatory message in the UI. Today the
app silently returns to the list and the raw error is written to stderr
(which belongs to Ink and later corrupts the terminal on exit).

## User Stories

### As a user, I want to know why my exec didn't open

- Given a container whose image has no `/bin/bash` or `/bin/sh`, when I
  accept the exec prompt, then the status bar (or a dismissible banner)
  shows e.g. `exec failed: "sh" not found in container — try a different
  command`, and the exec prompt reopens pre-filled so I can edit the
  command.
- Given any exec start failure (RBAC denied, pod gone, container not
  running), then the API error message is surfaced in the UI and journaled
  to debug.log; nothing is written to stdout/stderr.

### As a user, I want a sensible shell fallback

- Given I accept the default command, when `/bin/bash` does not exist, then
  p9r automatically retries with `/bin/sh` before reporting failure.

## Functional Requirements

- No code path may write exec errors to process stderr while the TUI owns
  the terminal.
- Failures must be logged to `~/.config/p9r/debug.log` (none are today).

## Assumptions

- Exit-code-127 / "executable file not found" is distinguishable from other
  failures in the exec stream.

## Risks

- Fallback retry adds latency on genuinely shell-less containers (bounded,
  acceptable).

## Open Questions

- Should the container's advertised command list inform the default?

## Notes

> [!NOTE]
> Observed (blackbox QA, 2026-07-20): exec `/bin/sh` into a `cloudflared`
> pod returned to the list with zero feedback; stderr later showed
> `OCI runtime exec failed: … exec: "sh": executable file not found in
> $PATH; command terminated with exit code 127`. debug.log contained no
> exec entry.
