---
spile: ticket
id: P9R-0008
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

# P9R-0008: Prometheus auto-discovery misses a service literally named `prometheus`

## Summary

In-cluster Prometheus auto-discovery must find a ClusterIP service named
`prometheus` exposing port 9090 in any namespace. Today a cluster with
exactly that (`default/prometheus`, port 9090, backed by a running
deployment) shows "No Prometheus found in cluster" / "Prometheus ○
disconnected", degrading all charts to sparklines.

## User Stories

### As an operator with a hand-rolled Prometheus, I want charts to work

- Given a Service named `prometheus` (any namespace) with a port numbered
  9090 or named `http`/`web`/`http-web`, when p9r starts, then discovery
  selects it, opens the managed port-forward tunnel, and the dashboard
  shows `Prometheus ● connected`.
- Given multiple candidates, then discovery prefers (1) the operator/helm
  labels it already knows, (2) a service named `prometheus`/
  `prometheus-server`/`prometheus-operated`, (3) any service with port
  9090; ties broken by namespace order (`monitoring`, `default`, rest).
- Given discovery fails, when I set `prometheus.url` in config.yaml, then
  that always wins (already works — keep it).

## Functional Requirements

- Name- and port-based fallback in addition to whatever label-based
  matching exists.
- The dashboard "No Prometheus found" warning must state what was searched
  for, so users can tell why theirs wasn't matched.

## Assumptions

- QA cluster's service: `default/prometheus` ClusterIP 9090, no
  app.kubernetes.io labels.

## Risks

- False positives on non-Prometheus services named `prometheus`; mitigated
  by probing `/-/ready` (or `/api/v1/status/buildinfo`) before declaring
  connected.

## Open Questions

- Should discovery re-run periodically or only at startup/context switch?

## Notes

> [!NOTE]
> Observed (blackbox QA, 2026-07-20, k3s-poc): `kubectl get svc` shows
> `default/prometheus ClusterIP 9090/TCP`; deployment 1/1 Running. p9r
> reported "No Prometheus found in cluster" and metrics stayed in
> sparkline-only mode.
