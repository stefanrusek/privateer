---
spile: ticket
id: P9R-0003
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

# P9R-0003: Events tab — dead filter chips, missing Normal events, zero Count and blank Age

## Summary

The Events tab must show all events for the resource with a working
Warning/All filter, and must render Age and Count for modern
(`events.k8s.io`-style) events that carry `eventTime`/`series` instead of
`lastTimestamp`/`count`.

## User Stories

### As a user, I want to see every event for a resource

- Given a pod with 6 events (1 Warning, 5 Normal), when I open its Events
  tab with the `All` filter active, then all 6 events are listed.
- Given the `Warning` filter is active, when I view the list, then only the
  Warning event is listed and the count line reads `1 of 6 events`.

### As a user, I want the filter chips to work

- Given the Events tab, when I click `[All]` or press `f` (decided
  2026-07-20: `f` cycles Warning ↔ All while the Events tab is active),
  then the filter switches, the chip renders as active, and the list
  updates immediately. Clicking `[Warning]` switches back.

### As a user, I want correct Age and Count for every event

- Given an event with no `count` but a `series.count`, when it renders, then
  Count shows `series.count`; with neither, Count shows `1` (an event that
  exists happened at least once — never `0`).
- Given an event with no `lastTimestamp`, when it renders, then Age falls
  back to `series.lastObservedTime`, then `eventTime`, then
  `metadata.creationTimestamp`; Age is never blank.

## Functional Requirements

- Event fetch/watch must not pre-filter to warnings; filtering is a view
  concern.
- Filter chips are clickable measured buttons with active styling.
- Age/Count fallback chain as above.

## Assumptions

- Both `v1` core events and `events.k8s.io` shapes appear in real clusters.

## Risks

- None significant.

## Open Questions

- None — decided 2026-07-20: `f` toggles the filter; add it to the keymap
  registry (and thus `?` help and the README table).

## Notes

> [!NOTE]
> Observed (blackbox QA, 2026-07-20): pod `cloudflared-5c77f7bd75-22h8z` had
> 6 events per kubectl; the tab showed "1 events (1 warnings)" with
> `Count 0` and blank Age for a FailedScheduling event whose `count` and
> `lastTimestamp` were nil. Clicking `[All]` and `[Warning ✓]` did nothing.
