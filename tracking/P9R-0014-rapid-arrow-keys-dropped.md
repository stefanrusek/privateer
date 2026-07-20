---
spile: ticket
id: P9R-0014
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

# P9R-0014: Rapid arrow-key bursts are partially dropped

## Summary

When multiple arrow-key escape sequences arrive in quick succession (held
key auto-repeat, or a terminal delivering queued input in one chunk), every
keypress must be applied. Today a burst of N Downs moves the cursor fewer
than N rows.

## User Stories

### As a keyboard user, I want held-key navigation to be exact

- Given a list or editor, when N Down-arrow sequences arrive (even within
  one stdin chunk), then the cursor moves exactly N rows (clamped at the
  end).
- Given mixed chunked input (e.g. `↓↓j↓`), then all four motions apply in
  order.

## Functional Requirements

- The stdin splitter must handle a chunk containing multiple complete
  escape sequences (and sequences split across chunk boundaries) without
  discarding any.

## Assumptions

- Plain-character chunks ("jj") already split correctly per the existing
  behavior; the gap is specific to escape sequences.

## Risks

- Interaction with SGR mouse parsing on the same stdin path.

## Open Questions

- None.

## Notes

> [!NOTE]
> Observed (blackbox QA, 2026-07-20, tmux send-keys bursts): 7 rapid Downs
> in the sidebar moved 5 rows; separately, 17 rapid Downs in the YAML
> editor moved 13 rows (text typed afterwards landed on line 14, not 18).
> Reproducible; magnitude varies with timing, consistent with whole
> sequences being lost when several share a chunk.
