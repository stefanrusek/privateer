---
spile: ticket
id: P9R-0007
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

# P9R-0007: List columns run into each other (truncated headers, Age glued to sparklines)

## Summary

Resource-table columns must keep at least one column of separation between
cells and between headers. Today adjacent columns collide: headers render as
`Up-to-dat…Available` and `Restart…Node`, and the pods list renders Age
flush against the CPU sparkline (`5d~▂▂▂▂`), reading as one value.

## User Stories

### As a user, I want columns I can visually parse

- Given any resource list, when two columns are adjacent, then at least one
  space separates the widest cell of one from the next, headers included.
- Given a header that must truncate, then the ellipsis still leaves a gap
  before the next header (`Up-to-d… Available`).
- Given the pods list with metrics columns, then Age and the CPU sparkline
  are visibly separate cells.

## Functional Requirements

- Column layout allocates a mandatory gutter (≥1 char) between columns.
- Right-aligned numeric columns (Age) may not extend into the following
  column's gutter.

## Assumptions

- Deployments, Pods, and Nodes lists all exhibit this; fix is in the shared
  table layout, not per-view.

## Risks

- Slightly fewer visible columns on narrow terminals (acceptable; the `›`
  horizontal-scroll affordance exists).

## Open Questions

- None.

## Notes

> [!NOTE]
> Observed (blackbox QA, 2026-07-20): Deployments header
> `Up-to-dat…Available`; Pods header `Restart…Node`; Pods rows `5d~▂▂▂▂▂` /
> `1mo~▇▂▅▃`; Nodes row `1mo~▆▇▆▇`.
