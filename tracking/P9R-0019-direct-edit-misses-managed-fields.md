---
spile: ticket
id: P9R-0019
type: bug
status: refining
owner: stefan
resolution:
blocked_by: []
created: 2026-07-22
relations:
  depends_on: []
  relates_to: [P9R-0016]
  supersedes: []
implementation: []
---

# P9R-0019: Direct-to-edit (`e` on a list row) edits without managedFields

## Summary

P9R-0016 made the YAML tab fetch the full unstripped object so managedFields
survive viewing and edit round-trips. One path was left behind: pressing `e`
on a list row opens the detail directly into YAML edit mode, and the edit
buffer is seeded synchronously inside `openDetail` — before the async full
fetch can resolve — so that buffer is built from the store's stripped raw
and a save from it drops managedFields. Editing from within an already-open
YAML tab is unaffected.

## User Stories

### As an operator, I want direct-to-edit to round-trip the full object

- Given a resource with server-side managedFields, when I press `e` on its
  list row and save an edit, then managedFields are preserved on the saved
  object exactly as when editing from the open YAML tab.
- Given the full-object fetch has not yet resolved when the editor opens,
  then the editor either waits for it or reseeds the buffer from the fetched
  object before any user modification is applied.

## Functional Requirements

- The direct-to-edit path and the YAML-tab edit path must seed the edit
  buffer from the same (full, unstripped) source.

## Assumptions

## Risks

## Open Questions

## Notes

> [!NOTE]
> Found during P9R-0016 verification (2026-07-22): `openDetail` seeds the
> edit buffer in the same tick, ahead of the `client.get` full-object fetch
> added by commit 2bdf2f9.
