---
spile: ticket
id: P9R-0002
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

# P9R-0002: Agent tab is invisible in the detail tab strip

## Summary

The detail pane has a working Agent view (reachable via key `6` or by
running an agent query), but the tab strip renders only
`[Overview] [YAML] [Events] [Logs] [Metrics]`. The Agent tab must be a
first-class, visible, clickable tab with an active-state highlight.

## User Stories

### As a user, I want to discover and select the Agent tab like any other tab

- Given a pod detail pane is open, when I look at the tab strip, then I see
  `[Agent]` as the last tab.
- Given the tab strip, when I click `[Agent]` or press `6`, then the Agent
  view opens and the `[Agent]` tab renders in the active style.
- Given the Agent view is active (e.g. after submitting a Space-bar agent
  query), when I look at the tab strip, then `[Agent]` is highlighted; no
  state exists where the visible strip has no active tab.
- Given a resource kind without Logs/Metrics (e.g. ConfigMap), when the
  detail opens, then the numbered shortcuts match the visible tab order.

## Functional Requirements

- Tab strip always lists every reachable tab for the current resource kind,
  in the same order as the number-key shortcuts.
- Active tab is always exactly one of the visible tabs.

## Assumptions

- The Agent view itself already works (verified).

## Risks

- Tab strip width on narrow terminals; may need truncation rules.

## Open Questions

- None.

## Notes

> [!NOTE]
> Observed (blackbox QA, 2026-07-20): pressing `6` on a pod detail switched
> the content to "Ask anything about your cluster." but the strip still
> showed the five other tabs with no highlight anywhere. README/keymap
> advertise tabs "Overview · YAML · Events · Logs · Metrics · Agent" and
> keys `1–6`.
