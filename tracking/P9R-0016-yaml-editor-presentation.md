---
spile: ticket
id: P9R-0016
type: bug
status: verifying
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

# P9R-0016: YAML presentation — key order varies by kind, managedFields noise, no-op save dialog, `e` doesn't edit

## Summary

Bundle of YAML viewer/editor polish defects: (1) key ordering is
inconsistent — Pods render `kind`/`apiVersion` first, ConfigMaps/Secrets
render them *last* (after `metadata`), which is disorienting and
non-conventional; (2) `metadata.managedFields` clutter dominates small
resources; (3) Ctrl+S with zero changes still opens the Review Changes
dialog with an `[Apply]` button; (4) the list-level `e` binding is
documented as "Open the YAML editor" but only opens the YAML *view*,
requiring a second `e`.

## User Stories

### As a user, I want conventional, consistent YAML

- Given any resource's YAML tab, then keys render `apiVersion`, `kind`,
  `metadata`, `spec`/`data`, `status` in that order for every kind.
- Given a resource with `managedFields`, then it is hidden by default,
  with a toolbar chip `[managed]` and keybinding `m` to toggle it visible
  (decided 2026-07-20 — same pattern as the Secrets `[reveal]` chip); it is
  preserved on edit round-trips regardless of display state.

### As a user, I want save to be a no-op when nothing changed

- Given edit mode with an unmodified buffer, when I press Ctrl+S, then a
  transient `No changes` notice shows and no dialog opens.

### As a user, I want `e` to mean edit

- Given a list row, when I press `e`, then the detail opens directly in
  YAML edit mode (matching the keymap text), not the read-only view.

## Functional Requirements

- One canonical serialization order applied before render and before diff.
- Diff computation treats reordering-only as "no changes".

## Assumptions

- Server-side apply preserves managedFields regardless of client display.

## Risks

- Diff noise if ordering changes between saved and live versions —
  normalize both sides.

## Open Questions

- None — decided 2026-07-20: toolbar chip + `m` keybinding, session-scoped.

## Notes

> [!NOTE]
> Observed (blackbox QA, 2026-07-20): ConfigMap YAML line 1 was
> `metadata:` with `kind: ConfigMap` on line 19; Pod YAML started
> `kind/apiVersion`. A fresh ConfigMap's 22-line YAML was ~70%
> managedFields. Ctrl+S with no edits offered `Review Changes — … 19
> unchanged lines … [Apply]`.
