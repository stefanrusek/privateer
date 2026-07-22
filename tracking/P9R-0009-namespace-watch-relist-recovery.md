---
spile: ticket
id: P9R-0009
type: bug
status: closed
owner: stefan
resolution: done
blocked_by: []
created: 2026-07-20
relations:
  depends_on: []
  relates_to: []
  supersedes: []
implementation: []
---

# P9R-0009: Watch stuck in a permanent "too old resource version" retry loop

## Summary

When a watch stream fails with HTTP 410 / "too old resource version", the
stream manager must recover by re-listing (fresh list → new resourceVersion
→ re-watch), not by retrying the same stale resourceVersion forever. Today
the Namespace watch retries every ~30s with the same stale version,
indefinitely, journaling an identical error each time.

## User Stories

### As a user, I want watches to self-heal

- Given a watch that receives `too old resource version`, when it
  reconnects, then it first re-lists the kind, reconciles the store
  (adds/removes/updates), and resumes watching from the fresh
  resourceVersion; the error does not recur.
- Given the re-list also fails, then retries back off exponentially (cap
  ~2 min) and the UI surfaces a degraded-stream indicator for that kind
  rather than staying silently stale.

## Functional Requirements

- 410/"too old" is a distinct error class triggering list-then-watch, for
  every watched kind (not just Namespace).
- debug.log records one recovery line, not an unbounded identical-error
  stream.

## Assumptions

- k3s compacts aggressively, making 410s routine on quiet kinds.

## Risks

- Re-list burst after long disconnects; bounded by per-kind backoff.

## Open Questions

- None.

## Notes

> [!NOTE]
> Observed (blackbox QA, 2026-07-20): debug.log tail was an endless
> repetition of `{"kind":"Namespace","errorKind":"unknown","message":"too
> old resource version: 6 (57736)","msg":"stream error"}` every ~30s for
> the entire session; `errorKind:"unknown"` shows the 410 isn't classified.
