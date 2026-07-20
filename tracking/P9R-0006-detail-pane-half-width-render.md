---
spile: ticket
id: P9R-0006
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

# P9R-0006: YAML and Metrics tabs render at ~half the detail-pane width

## Summary

Detail-tab content (YAML viewer, Metrics charts, and their scrollbars) must
fill the full inner width of the detail pane. Today on a wide terminal the
content column stops at roughly 55–65 characters with the scrollbar drawn
mid-pane and the right half blank; metrics x-axis labels are clipped at the
false edge.

## User Stories

### As a user, I want full-width YAML and charts

- Given a 170-column terminal with the default split, when I open a pod's
  YAML tab, then lines render up to the pane's inner width and the
  scrollbar hugs the pane's right border.
- Given the Metrics tab, then charts span the pane width and the time-axis
  labels render completely.
- Given I resize the split (`+`/`-` or border drag), then tab content
  re-measures to the new width.

## Functional Requirements

- One width source of truth: the measured detail-pane inner width.

## Assumptions

- Overview/Events/Logs already use the full width (they did in QA), so this
  is specific to the YAML/Metrics renderers.

## Risks

- Chart re-render cost on resize (negligible).

## Open Questions

- None.

## Notes

> [!NOTE]
> Observed (blackbox QA, 2026-07-20, 170×50 tmux): pod YAML wrapped at
> ~55 cols with the `█` scrollbar at mid-pane; Metrics charts capped at
> ~62 cols with the last x-axis label cut to `1`.
