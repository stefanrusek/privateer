---
name: spile-ops
description: >-
  Operate the Spile issue tracker in tracking/ — the process mechanic for
  spec-driven tickets kept as markdown + front matter in git. Use whenever the
  task touches a ticket or the tracker: creating/minting a new ticket ("file a
  ticket/bug/feature", "track this"), changing a ticket's status or resolution,
  renaming a ticket, adding relations or blockers, listing/querying tickets
  ("what's in flight", "what's blocked"), or regenerating the project view.
  Trigger on any mention of "spile", a P9R-NNNN id, or tracking/ tickets.
---

# spile-ops — operating the tracker

The tracker lives in `tracking/`. The authoritative conventions are
`tracking/spile-spec.md` — **when this skill and the spec disagree, the spec
wins**; read the spec section for anything non-routine. This skill compresses
the routine operations.

Core facts:

- Root doc: `tracking/README.md` — front matter holds `prefix: P9R` and
  `counter` (last allocated ID number).
- Tickets: `tracking/P9R-NNNN-slug.md`, flat, never moved between
  directories as they progress. The `P9R-NNNN` ID is immutable; the slug may
  change on rename. Cross-references always use the bare ID, never filenames.
- View: `tracking/views/p9r-view.md` (generated — never hand-edit).
- Everything is advisory: warn on odd states/transitions, never error.

## Mint a ticket

1. Read the root doc; new number = `counter + 1`, zero-padded to 4 digits.
2. Bump `counter` in the root doc front matter.
3. Create `tracking/P9R-NNNN-kebab-slug.md` from the skeleton below.
4. Regenerate the view (always, same change).

Front matter template (full field semantics: spec §"Ticket front matter"):

```yaml
---
spile: ticket
id: P9R-NNNN
type: feature        # feature | bug
status: draft        # draft → refining → ready → implementing → verifying → closed
owner: stefan
resolution:          # only when closed: done | wontfix | duplicate | superseded
blocked_by: []
created: YYYY-MM-DD  # today, written once; no updated field — git knows
relations:
  depends_on: []
  relates_to: []
  supersedes: []
implementation: []   # e.g. [{branch: P9R-NNNN-slug, pr: 42}]
---
```

Body skeleton (spec §"Ticket body" for the rules):

```markdown
# P9R-NNNN: Title

## Summary

## User Stories

### As an actor, I want to do thing

- Given …, when …, then …

## Functional Requirements

## Assumptions

## Risks

## Open Questions

## Notes
```

Bugs are written as specs of the **corrected** state — intended behavior in
stories/criteria; the current broken behavior goes in a non-normative
`> [!NOTE]` under Notes.

## Transition status

Edit `status` in the ticket's front matter. Happy path:
`draft → refining → ready → implementing → verifying → closed`. On close, set
`resolution`. `refining → ready` is the human sign-off gate — don't take it
unilaterally; ask the owner. Failed verification drops back to
`implementing` (or `refining` if the spec was wrong). Regressions get a
**new** bug ticket referencing the old ID, never a reopen. Non-standard
transitions are allowed — do them with a note in your reply, not a refusal.

Blockage is orthogonal to status: record it in `blocked_by` (IDs or freeform
reasons) without changing `status`.

## Rename

Keep the ID, change the slug: `git mv` the ticket file **and** its sidecar
directory (same basename, if present) together. Nothing else needs updating —
references use bare IDs.

## Query

Answer "what's open / blocked / mine" by reading ticket front matter directly
(e.g. grep `^status:` / `^blocked_by:` across `tracking/P9R-*.md`); don't
parse the view for this.

## Regenerate the view

**Every mutation** (mint, edit, transition, rename, close) regenerates
`tracking/views/p9r-view.md` in the same change. Rebuild it from all ticket
front matter, keeping its existing header marker, with exactly three
sections:

1. **Needs Attention** — all `refining`, all `verifying`, and anything with
   non-empty `blocked_by` (say what blocks it).
2. **Board** — open tickets grouped by status, as tables: linked ID (relative
   link to the file), title, type, owner, blocked badge, PR link.
3. **Recently Closed** — last 10–15 closed tickets with resolutions.

Use the placeholder lines already in the file ("_No open tickets._" etc.)
for empty sections.
