---
spile: ticket
id: P9R-0015
type: bug
status: verifying
owner: stefan
resolution:
blocked_by: []
created: 2026-07-20
relations:
  depends_on: []
  relates_to: [P9R-0007]
  supersedes: []
implementation: []
---

# P9R-0015: Nodes view — empty capacity columns, duplicate Ready row, raw Ki memory

## Summary

Three defects in the Nodes surfaces: (1) the Nodes *list* has CPU and
Memory capacity columns that render empty even though the detail view knows
the values; (2) node detail STATUS lists `Ready  True` twice; (3) memory
quantities render as raw kibibytes (`264006104Ki`) instead of humanized
(`251.8Gi`).

## User Stories

### As an operator, I want a useful Nodes list

- Given the Nodes list, then the CPU column shows capacity (e.g. `72`) and
  Memory shows humanized capacity (e.g. `252Gi`) — or usage/capacity when
  metrics are available.

### As an operator, I want a clean node detail

- Given node detail STATUS, then each condition appears once, in a stable
  order (Ready first, then pressures).
- Given any memory quantity anywhere in the app, then it renders humanized
  with a binary-unit suffix, one decimal max.

## Functional Requirements

- Shared quantity-humanizing formatter for memory/CPU resource quantities.

## Assumptions

- None.

## Risks

- None.

## Open Questions

- Show allocatable or capacity in the list? (Detail shows both.)

## Notes

> [!NOTE]
> Observed (blackbox QA, 2026-07-20): Nodes list row `● server …
> CPU(blank) Memory(blank) 1mo~▆▇…`; detail STATUS ordered Ready, Memory-,
> Disk-, PIDPressure, Ready (duplicate); CAPACITY `264006104Ki allocatable
> / 264006104Ki capacity`.
