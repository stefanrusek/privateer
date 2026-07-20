---
spile: ticket
id: P9R-0017
type: feature
status: verifying
owner: stefan
resolution:
blocked_by: []
created: 2026-07-20
relations:
  depends_on: []
  relates_to: [P9R-0001]
  supersedes: []
implementation: []
---

# P9R-0017: Cluster Health rule drill-down — [show], [show passing], and offender navigation

## Summary

Every best-practices rule on the Overview dashboard renders a `[show]`
affordance, and the footer renders `[show passing]` — today both are dead
controls. Specify and implement the drill-down: expanding a rule inline to
list the offending resources, navigating from an offender to its detail,
and expanding the passing-rules list. This is the dashboard's core promise
("lands you on what's wrong first"); without it every finding is a dead
end the user must re-derive by hand.

## User Stories

### As an operator, I want to see which resources violate a rule

- Given the dashboard shows `✕ ERROR 47 pods have no CPU limit set [show]`,
  when I click `[show]` (or select the rule with ↑/↓ and press Enter/→
  while the dashboard region is focused), then the rule expands inline to
  an indented list of offenders — `kind/namespace/name` per line (kind
  always prefixed), sorted by namespace then name — and the affordance
  becomes `[hide]`.
- Given an expanded list longer than 10 entries, then the first 10 show
  with `… and 37 more [all]`; `[all]` expands the remainder (scrolling the
  dashboard region as needed).
- Given an expanded rule, when I click `[hide]` (or press Enter/← on it),
  then it collapses. Multiple rules may be expanded at once; expansion
  state persists for the session across Overview visits, and resets on
  context or namespace switch.

### As an operator, I want to jump from an offender to the resource

- Given an expanded offender list, when I click an entry (or move the
  dashboard cursor onto it and press Enter), then p9r navigates to that
  resource kind's list, selects that resource, and opens its detail pane —
  same behavior as finding it manually.
- Given the offender no longer exists (fixed/deleted since evaluation),
  then a transient notice `no longer present` shows and the dashboard
  stays put.

### As an operator, I want to see what's passing

- Given the footer `11 passing rules [show passing]`, when I activate it,
  then the passing rules render as a dimmed list (`✓ rule text`) below the
  issues, and the affordance becomes `[hide passing]`.

### As a keyboard user, I want the dashboard to be navigable

- Given the dashboard region is focused (Tab / click), then ↑/↓ move a
  visible cursor across rules, offender entries, and the passing-rules
  footer; Enter activates the element under the cursor; the region scrolls
  to keep the cursor visible.

## Functional Requirements

- Offender identity: kind + namespace + name, taken from the rule engine's
  existing evaluation (rules must expose their matched resources, not just
  counts).
- Counts in the rule headline and the expanded list length always agree
  (same evaluation snapshot); live watch updates may refresh both together.
- `[show]`/`[hide]`/`[all]`/`[show passing]` are measured click targets
  like the Logs-tab buttons.
- Rule suppression annotations (existing feature) exclude resources from
  both count and list.

## Assumptions

- The rule engine already knows per-resource matches (counts imply it).
- Existing region-focus and measured-button infrastructure is reusable.

## Risks

- Dashboard region becomes scrollable/stateful; interaction with wheel
  scrolling and region focus needs care.
- Very large offender lists (hundreds) — capped rendering with `[all]`
  mitigates.

## Open Questions

- None — decided 2026-07-20: expansion persists within the session (resets
  on context/namespace switch); offender entries always carry a kind
  prefix.

## Notes

> [!NOTE]
> Observed (blackbox QA, 2026-07-20): clicking `[show]` on several rules
> and `[show passing]` produced no change whatsoever; there is also no
> keyboard path to activate them. The affordances are rendered but wired to
> nothing — stubbed UI.
