---
spile: ticket
id: P9R-0011
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

# P9R-0011: Sidebar resource counts ignore the namespace filter inconsistently

## Summary

When a namespace is selected, every namespaced kind's sidebar count must be
scoped to that namespace. Today some counts scope (Deployments, Pods) while
others stay cluster-wide (ConfigMaps, Secrets, ReplicaSets), so the sidebar
mixes two scopes at once.

## User Stories

### As a user, I want counts that match the selected namespace

- Given ns `kafka` is selected (2 secrets in it, 33 cluster-wide), when I
  look at the sidebar, then `Secrets 2` — matching what the list shows when
  opened.
- Given `(all namespaces)`, then counts are cluster-wide for all kinds.
- Given I switch namespace, then all counts update together (no mixed
  scope, even transiently beyond a refresh tick).
- Cluster-scoped kinds (Nodes, Namespaces, CRDs, PVs) always show global
  counts.

## Functional Requirements

- One scoping rule applied uniformly to all namespaced kinds' badge counts.

## Assumptions

- Counts derive from the same store the lists render from.

## Risks

- None.

## Open Questions

- None.

## Notes

> [!NOTE]
> Observed (blackbox QA, 2026-07-20): with ns `kafka` selected the sidebar
> showed `Deployments 1`, `Pods 4` (scoped) but `ConfigMaps 16`,
> `Secrets 33`, `ReplicaSets 69` (cluster-wide); opening Secrets listed
> only the 2 kafka secrets, contradicting its own badge.
