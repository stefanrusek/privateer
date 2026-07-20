---
spile: project
project: p9r
prefix: P9R
counter: 18
---

# p9r issue tracking

This directory is a [Spile](spile-spec.md) project — spec-driven issue
tracking in plain markdown, front matter, and git. Tickets for p9r live
here as `P9R-NNNN-slug.md` files; each ticket **is** the spec the SDD
pipeline consumes.

- The full conventions live in [spile-spec.md](spile-spec.md); when tooling
  and spec disagree, the spec wins.
- Use the `spile-ops` skill (`.claude/skills/spile-ops/`) to mint tickets,
  transition status, rename, and regenerate the view.
- The human-facing dashboard is the generated
  [views/p9r-view.md](views/p9r-view.md) — never hand-edit it.

The `counter` in this file's front matter is the ID allocator: it records
the last allocated ticket number and is bumped whenever a ticket is minted.
