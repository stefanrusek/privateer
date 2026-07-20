---
spile: ticket
id: P9R-0001
type: bug
status: verifying
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

# P9R-0001: Dashboard node summary reports a Ready node as not ready

## Summary

The Cluster Health dashboard's `Nodes: N/M ready` summary must count a node
as ready exactly when its `Ready` condition is `True`. Pressure conditions
(DiskPressure, MemoryPressure, PIDPressure) must not silently flip the count;
if they are surfaced at all, they get their own wording.

## User Stories

### As an operator, I want the node summary to match `kubectl get nodes`

- Given a node whose `Ready` condition is `True` and `DiskPressure` is
  `True`, when I open the Overview dashboard, then the summary reads
  `Nodes: 1/1 ready` (optionally with a distinct pressure warning such as
  `1 node under disk pressure`), never `Nodes: 0/1 ready`.
- Given a node whose `Ready` condition is `False` or `Unknown`, when I open
  the dashboard, then that node is excluded from the ready count.

## Functional Requirements

- Ready count derives solely from the `Ready` condition status.
- Node pressure conditions may be shown as a separate labeled warning, not
  folded into the ready count.

## Assumptions

- Single source: node `.status.conditions` from the live watch.

## Risks

- None significant; display-only change.

## Open Questions

- Should pressure conditions get a dedicated summary line or a best-practices
  rule instead?

## Notes

> [!NOTE]
> Observed (blackbox QA, 2026-07-20, k3s-poc): node `server` had
> `Ready=True, DiskPressure=True`; dashboard showed `Nodes: 0/1 ready` while
> `kubectl get nodes` showed Ready. After disk pressure cleared it showed
> `1/1`. The count appears to require all conditions healthy, which misreads
> "ready" and contradicts kubectl.
