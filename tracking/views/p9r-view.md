---
spile: view
project: p9r
---

# p9r — project view

> [!IMPORTANT]
> **Generated — do not hand-edit.** Built from the ticket front matter in
> `tracking/`. Regenerate with the `spile-ops` skill after any ticket change.

## Needs Attention

| ID | Title | Status | Note |
| --- | --- | --- | --- |
| [P9R-0001](../P9R-0001-dashboard-node-ready-count-wrong.md) | Dashboard node summary reports a Ready node as not ready | verifying | |
| [P9R-0002](../P9R-0002-agent-tab-missing-from-tab-strip.md) | Agent tab is invisible in the detail tab strip | verifying | |
| [P9R-0003](../P9R-0003-events-tab-filter-and-fallbacks.md) | Events tab — dead filter chips, missing Normal events, zero Count and blank Age | verifying | |
| [P9R-0004](../P9R-0004-log-search-nonfunctional.md) | Log search (`/`, `n`, `N`) is non-functional — keystrokes fall through to hotkeys | verifying | |
| [P9R-0005](../P9R-0005-exec-failures-silent-and-stderr-leak.md) | Exec failures are silent; the error leaks to stderr instead of the UI | verifying | |
| [P9R-0006](../P9R-0006-detail-pane-half-width-render.md) | YAML and Metrics tabs render at ~half the detail-pane width | verifying | |
| [P9R-0007](../P9R-0007-list-column-spacing-squish.md) | List columns run into each other (truncated headers, Age glued to sparklines) | verifying | |
| [P9R-0008](../P9R-0008-prometheus-autodiscovery-misses-plain-service.md) | Prometheus auto-discovery misses a service literally named `prometheus` | verifying | |
| [P9R-0009](../P9R-0009-namespace-watch-relist-recovery.md) | Watch stuck in a permanent "too old resource version" retry loop | verifying | |
| [P9R-0010](../P9R-0010-stale-status-bar-segments.md) | Status bar shows stale state (dead port-forward text, immortal toasts) | verifying | |
| [P9R-0011](../P9R-0011-sidebar-counts-namespace-scope.md) | Sidebar resource counts ignore the namespace filter inconsistently | verifying | |
| [P9R-0012](../P9R-0012-secret-masking-and-reveal.md) | Secret values are never masked and `v` (reveal) does nothing | verifying | |
| [P9R-0013](../P9R-0013-quit-leaves-screen-painted.md) | Quit leaves the full TUI painted on screen; exec pane renders outside the app frame | verifying | |
| [P9R-0014](../P9R-0014-rapid-arrow-keys-dropped.md) | Rapid arrow-key bursts are partially dropped | verifying | |
| [P9R-0015](../P9R-0015-nodes-view-polish.md) | Nodes view — empty capacity columns, duplicate Ready row, raw Ki memory | verifying | |
| [P9R-0016](../P9R-0016-yaml-editor-presentation.md) | YAML presentation — key order varies by kind, managedFields noise, no-op save dialog, `e` doesn't edit | verifying | |
| [P9R-0017](../P9R-0017-dashboard-rule-drilldown.md) | Cluster Health rule drill-down — [show], [show passing], and offender navigation | verifying | |
| [P9R-0018](../P9R-0018-custom-resource-instance-browsing.md) | Browse custom resource instances, not just CRDs | verifying | |

## Board

### verifying

| ID | Title | Type | Owner | Blocked | PR |
| --- | --- | --- | --- | --- | --- |
| [P9R-0001](../P9R-0001-dashboard-node-ready-count-wrong.md) | Dashboard node summary reports a Ready node as not ready | bug | stefan | | |
| [P9R-0002](../P9R-0002-agent-tab-missing-from-tab-strip.md) | Agent tab is invisible in the detail tab strip | bug | stefan | | |
| [P9R-0003](../P9R-0003-events-tab-filter-and-fallbacks.md) | Events tab — dead filter chips, missing Normal events, zero Count and blank Age | bug | stefan | | |
| [P9R-0004](../P9R-0004-log-search-nonfunctional.md) | Log search (`/`, `n`, `N`) is non-functional — keystrokes fall through to hotkeys | bug | stefan | | |
| [P9R-0005](../P9R-0005-exec-failures-silent-and-stderr-leak.md) | Exec failures are silent; the error leaks to stderr instead of the UI | bug | stefan | | |
| [P9R-0006](../P9R-0006-detail-pane-half-width-render.md) | YAML and Metrics tabs render at ~half the detail-pane width | bug | stefan | | |
| [P9R-0007](../P9R-0007-list-column-spacing-squish.md) | List columns run into each other (truncated headers, Age glued to sparklines) | bug | stefan | | |
| [P9R-0008](../P9R-0008-prometheus-autodiscovery-misses-plain-service.md) | Prometheus auto-discovery misses a service literally named `prometheus` | bug | stefan | | |
| [P9R-0009](../P9R-0009-namespace-watch-relist-recovery.md) | Watch stuck in a permanent "too old resource version" retry loop | bug | stefan | | |
| [P9R-0010](../P9R-0010-stale-status-bar-segments.md) | Status bar shows stale state (dead port-forward text, immortal toasts) | bug | stefan | | |
| [P9R-0011](../P9R-0011-sidebar-counts-namespace-scope.md) | Sidebar resource counts ignore the namespace filter inconsistently | bug | stefan | | |
| [P9R-0012](../P9R-0012-secret-masking-and-reveal.md) | Secret values are never masked and `v` (reveal) does nothing | bug | stefan | | |
| [P9R-0013](../P9R-0013-quit-leaves-screen-painted.md) | Quit leaves the full TUI painted on screen; exec pane renders outside the app frame | bug | stefan | | |
| [P9R-0014](../P9R-0014-rapid-arrow-keys-dropped.md) | Rapid arrow-key bursts are partially dropped | bug | stefan | | |
| [P9R-0015](../P9R-0015-nodes-view-polish.md) | Nodes view — empty capacity columns, duplicate Ready row, raw Ki memory | bug | stefan | | |
| [P9R-0016](../P9R-0016-yaml-editor-presentation.md) | YAML presentation — key order varies by kind, managedFields noise, no-op save dialog, `e` doesn't edit | bug | stefan | | |
| [P9R-0017](../P9R-0017-dashboard-rule-drilldown.md) | Cluster Health rule drill-down — [show], [show passing], and offender navigation | feature | stefan | | |
| [P9R-0018](../P9R-0018-custom-resource-instance-browsing.md) | Browse custom resource instances, not just CRDs | feature | stefan | | |

## Recently Closed

_No closed tickets yet._
