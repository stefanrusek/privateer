---
spile: ticket
id: P9R-0018
type: feature
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

# P9R-0018: Browse custom resource instances, not just CRDs

## Summary

The Custom Resources sidebar section lists only `CustomResourceDefinitions`;
opening a CRD shows its metadata and there the trail ends. Users of
operator-managed clusters (Doppler, Traefik, Strimzi, …) need to browse the
*instances* of each custom kind with the same table → detail → YAML/Events
experience as built-in kinds.

## User Stories

### As an operator, I want CR kinds in the sidebar

- Given a cluster with CRDs, when I expand Custom Resources, then beneath
  the `CustomResourceDefinitions` entry each API *group* renders as a
  collapsible subgroup (`hub.traefik.io`, `secrets.doppler.com`, …), each
  containing its kinds with instance counts (`DopplerSecrets 3`), sorted
  alphabetically; kinds with zero instances show `0` like built-in kinds
  do. Counts are fetched lazily per *group*: expanding a group subtree
  fetches counts for that group's kinds only (decided 2026-07-20); counts
  refresh on re-expand, and a kind goes live (watch) once opened.
- Given dozens of CRD groups (k3s ships many), then subgroups are collapsed
  by default and the existing sidebar search (`/`) matches CR kind names.

### As an operator, I want a CR instance list like any other list

- Given I select a CR kind, then the list shows Name, Namespace (when the
  kind is namespaced), the columns declared in the CRD's
  `additionalPrinterColumns` (rendered from each instance per its
  JSONPath, honoring `priority 0` first), and Age; without printer columns,
  Name/Namespace/Age.
- Given the list, then sorting, search, `y` copy, `d` delete-with-confirm,
  and the namespace filter behave exactly as on built-in kinds.
- Given instances change on the cluster, then the list updates live (watch
  on the CRD's served version).

### As an operator, I want CR detail

- Given I open an instance, then the detail pane offers Overview (metadata,
  printer-column values, conditions from `.status.conditions` when
  present), YAML (view/edit/diff-apply, same as built-ins), and Events
  (involvedObject-matched).

### As an operator, I want the CRD entry to lead somewhere

- Given a CRD's detail view, then its Overview lists the served versions,
  scope, and an instance count that links (Enter/click) to the instance
  list for that kind.

## Functional Requirements

- Discovery: derive kind list from established CRDs (`Established=True`
  condition), watching for CRD add/remove so the sidebar stays live.
- Instance access via the dynamic/raw REST path already used for cluster
  I/O (`buildKubeRequestOptions`), one watch per *opened* kind — never
  eagerly watch all CR kinds (a k3s cluster ships 34+ CRDs). Counts for
  unopened kinds come from the lazy per-group fetch above.
- RBAC failures (list forbidden) render an in-list message
  (`forbidden — check RBAC for <group>/<kind>`), not an empty table.
- Best-effort printer-column JSONPath evaluation; a failing path renders
  `—`, never crashes the row.

## Assumptions

- The existing table/detail/YAML machinery is kind-agnostic enough to host
  dynamic kinds.
- Strimzi-specific Kafka views remain separate; this is the generic path.

## Risks

- Watch fan-out if a user opens many CR kinds in one session — consider an
  LRU cap on live CR watches.
- Printer-column JSONPath dialect (Kubernetes JSONPath, not RFC 9535) —
  scope to the common subset.

## Open Questions

- Should cluster-scoped CR kinds appear when a namespace filter is active
  (suggest: yes, like Nodes)?
- Live-watch LRU cap value when many CR kinds are opened in one session
  (suggest: 8).

## Notes

> [!NOTE]
> Observed (blackbox QA, 2026-07-20, k3s-poc with 34 CRDs from k3s,
> Traefik hub, and the Doppler operator): Custom Resources expands to a
> single `CustomResourceDefinitions 34` entry; a CRD's detail shows only
> metadata/YAML/Events for the definition object. There is no way to see,
> for example, the DopplerSecret instances that drive this cluster's
> secrets — nor their conditions — without leaving p9r for kubectl.
