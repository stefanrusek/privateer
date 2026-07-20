---
spile: ticket
id: P9R-0010
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

# P9R-0010: Status bar shows stale state (dead port-forward text, immortal toasts)

## Summary

Status-bar segments must reflect current state: the forwarding segment
disappears when the last forward stops, and transient toasts (✓ Copied…)
expire after a few seconds. Today both persist indefinitely.

## User Stories

### As a user, I want the status bar to tell the truth

- Given I stop the only active port-forward in the `F` manager, when I
  return to the app, then the `⇄ Forwarding localhost:… → pod:…` segment is
  gone (and the `⇄ N` counter with it).
- Given multiple forwards, then the segment reflects the surviving ones.
- Given a transient confirmation (e.g. `✓ Copied server`, `✓ Saved to
  ~/Downloads/…`), when ~5 seconds pass or any state-changing interaction
  occurs, then the toast clears back to the default hint line.

## Functional Requirements

- Forwarding segment derives from the live forward registry, not from a
  set-once message.
- Toasts carry a TTL.

## Assumptions

- The forward itself does stop correctly (verified — port closes).

## Risks

- None.

## Open Questions

- Toast TTL value (suggest 5s).

## Notes

> [!NOTE]
> Observed (blackbox QA, 2026-07-20): after stopping the pgweb forward via
> `[✕]` (curl then refused connections), the bar kept showing
> `⇄ Forwarding localhost:8081 → pgweb-…:8081` for the rest of the session;
> `✓ Copied server` likewise persisted for many minutes across screens.
