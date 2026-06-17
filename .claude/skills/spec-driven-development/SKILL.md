---
name: spec-driven-development
description: Specification-Driven Development (SDD) workflow that MUST be followed for every software building task — new features, apps, scripts, refactors, bug fixes, tooling, or any request to build, create, implement, add, or change code. Use this skill BEFORE writing any code or creating any implementation files, even when the user's request sounds ready to implement. The user works spec-first - specs are drafted, reviewed chunk by chunk, and explicitly approved before an implementation plan is written, and the plan is approved before any code is written. Stand down only if the user explicitly opts out (e.g. "skip the spec", "no SDD", "just do it directly") or explicitly invokes a different SDD framework (e.g. Spec Kit / speckit), in which case follow that framework instead.
---

# Spec-Driven Development

The user practices Specification-Driven Development. The spec — not the conversation — is the driving artifact. Specs and plans are consumed by an automated implementation pipeline that may run unattended, possibly by a fresh agent with zero conversation history (the user may `/clear` or hand off to a team/workflow). Spec quality is the critical investment; implementation is cheap once the spec is right.

The single most important rule: **do not write code, scaffold projects, or create implementation files until the user explicitly says it's time to build.** The natural instinct to "barrel ahead and start building" is exactly the failure mode this workflow exists to prevent. Time spent in discussion and spec refinement is the work, not a delay before the work.

## Workflow overview

```
Intake → Clarify (Q&A) → Draft spec (chunk by chunk; clarify-Q&A recurs per chunk)
      → Harden (review + spike) → ⛔ GATE 1: spec approval
      → Implementation plan → ⛔ GATE 2: plan approval → Build
```

Both gates are hard stops. Never cross a gate on inference, enthusiasm, or "this seems ready" — only on an explicit user go-ahead.

## Phase 1 — Intake

The user opens by saying what they want to do. Respond by briefly restating your understanding of the goal and move to clarification. Do not create files. Do not write code. Do not draft the spec yet — premature drafts anchor the discussion on guesses.

Read the existing codebase during this phase — not just to ground your questions, but because every claim the spec makes about the code is a claim that must be **true against what's actually there.** Before speccing a module as new, check it doesn't already exist; before citing a file, section, or symbol, confirm it resolves. See the grounding requirement under Phase 3.

## Phase 2 — Clarify

Ask the **single highest-leverage question at a time** — resolve the largest ambiguity, or the decision with the biggest ripple effect, first. Don't batch a list of questions: each answer reshapes what the next question should be, so a batched list is built on assumptions the first answer may invalidate.

The deeper rule behind "one at a time": **never ask a question built on an unvalidated assumption, and lead with a recommendation.** When you can see the likely options, don't ask an open-ended "what do you want?" — present the options and your recommended choice with reasoning ("Here's A vs. B; I recommend A because…"). This is faster for the user (a yes/veto, not an essay) and surfaces your assumptions so they can be corrected. A single well-framed recommendation-question is the goal, not a bare interrogative.

- Check the project's conventions (e.g. CLAUDE.md) for *how* to ask — some projects mandate or forbid specific question formats (inline Markdown prose vs. a multiple-choice tool). Project conventions override this skill's mechanics.
- The user may answer the question, or may info-dump a pile of context instead. Absorb whatever is given, update your model, and continue with the next single most important question.
- Continue until you could write the spec without guessing on anything material. Then say so and propose moving to drafting.

### Confirm ambiguous or terse replies before acting

A short reply is not a blank check. When a reply is terse or its referent is unclear, restate your interpretation and get confirmation before you act on it — especially before any consequential or outward-facing edit (a published file, a README, anything a user other than this one will see).

- A nudge is not approval. "and?", "go on", "ok?" mean *keep going* or *I'm waiting* — never treat them as sign-off on an answer or option the user has not actually seen.
- When the user names a scope loosely ("both need fixing"), confirm *which* targets and how broad before editing — narrow scope is the safe default, and over-reaching forces a revert.

## Phase 3 — Draft the spec, chunk by chunk

### File layout

```
specs/
└── NNN-<feature-name>/      # one numbered subdirectory per spec (001, 002, …)
    ├── README.md            # index: purpose, chunk list with ordering, dependencies, status
    ├── 01-<chunk-name>.md   # one file per chunk
    ├── 02-<chunk-name>.md
    └── ...
```

Spec directories are **numbered** with a zero-padded ordinal prefix
(`001-initial-features`, `002-navigation-overhaul`, …). Pick the next unused
number by listing `specs/`. The number orders specs chronologically and, once
chosen, is stable — it's part of the path that chunk files, source comments, and
build-order docs reference, so don't renumber a spec after others point at it.
(The per-chunk file prefixes `01-`, `02-` are a separate, spec-local sequence.)

Break the work into discrete, independently testable chunks. Start by proposing the chunk breakdown (this becomes the README skeleton) and get the user's reaction before writing any chunk.

### One chunk at a time, and ripple edits are normal

Draft **one chunk, then review it with the user before drafting the next.** Discussion of chunk N frequently exposes problems in chunks already written — when that happens, go back and revise the earlier chunk files and the README. The entire spec set stays open for revision until Gate 1; nothing is frozen chunk-by-chunk. Treat "we changed our minds about chunk 2 while discussing chunk 5" as the process working, not as churn. Clarification is not finished at Phase 2: drafting each chunk routinely surfaces new design forks (dispatch strategy, component design, key choices) that need their own Q&A — re-enter the Phase 2 question discipline whenever a fork appears mid-draft instead of resolving it by guessing. And the README is a **derived** artifact — its chunk list, dependency graph, critical path, status, and scope bullets are computed from the chunk files, so re-verify them after every ripple, not just at the end; the dependency graph and critical path drift the most quietly.

### Spec content

No fixed template — judge what each chunk needs. That said, these communicate intent especially well and should be reached for by default:

- **User stories** for the why and who
- **Acceptance criteria in given-when-then format** — these become the testable contract
- **Diagrams** (Mermaid) for flows, state machines, and architecture where prose is ambiguous

Every spec file must be **fully self-contained**: a fresh agent reading only the files in `specs/<feature-name>/` — with no access to this conversation — must be able to implement correctly. If a decision was made in chat, write it into the spec immediately; conversation context does not survive handoff.

When the user picks an option, capture both the decision **and its rationale** (why this over the alternative) so the choice isn't silently reversed later. And when a decision implies secondary choices, default them, write them in, and proactively flag the defaults so the user can veto — this keeps momentum instead of stalling on every downstream fork.

### Ground every claim in the real codebase

A spec that misdescribes the code it builds on sends the implementer down a wrong path the gate can't catch. Specs are claims about reality, and unverified claims are the failure mode here (see `fable-planner`'s "verify, don't assume").

- **Check whether it already exists before speccing it greenfield.** Search for the module/component first; if it's there (especially if it's already tested), the chunk *extends* it — say so, with the real path.
- **Cite real `file:line` and real names.** Every referenced file, spec section, symbol, or key must resolve. Verify filenames against the actual tree (e.g. don't cite `spec-04-detail.md` when the file is `spec-04-core-views.md`).
- **Respect the project's structural constraints.** Where the spec places code (coverage-excluded adapter dir vs. covered module dir, boundary rules, lint gates), state it correctly — a misplaced "put it here" can make the chunk un-gateable before a line is written.

### Keep the chunks consistent *with each other*

"Self-contained" is per-file; correctness is also a property of the *set*. A spec set can have every file read cleanly yet be unbuildable because the chunks disagree. Sweep the whole set:

- **Dependencies are accurate and sufficient.** If chunk N consumes a module, contract, or seam that chunk M produces, N's "Depends on" lists M — and M actually produces it.
- **References resolve across chunks.** A name one chunk introduces and another uses (a function, an `Action`, a seam, a file) exists on the producing side.
- **Shared contracts and keys don't collide.** No key is bound to two actions in the same scope; producer/consumer signatures match.
- **Nothing pre-existing is silently dropped.** If a chunk replaces a subsystem, it explicitly preserves (or consciously removes) the behavior that subsystem had.
- **The README index agrees with the chunks** — its dependency graph and critical path must match the per-chunk "Depends on" exactly.

## Phase 4 — Harden the spec (recommended, before Gate 1)

Before asking for spec approval, it pays to prove the spec is actually *buildable* — a spec that reads well but rests on a false assumption costs far more to discover mid-build. This step is optional but strongly recommended for any non-trivial spec. The *how* belongs to `fable-planner` (which owns verification, decomposition review, and spikes); this is when to reach for it:

- **A grounded consistency/feasibility review.** Re-read the whole set against the codebase for the grounding and cross-chunk issues above. For a large spec, fanning this out to parallel reviewers (per fable's parallel-agent discipline) surfaces defects a single read misses.
- **A throwaway spike for the riskiest unproven assumption.** If a chunk rests on a claim about the runtime, a library, an SDK, or a model that you have *not* proven, prove it in the smallest possible throwaway harness now and record the result in the spec — so the spec locks on a fact, not a hope (fable: "isolate the risky unknown in a throwaway harness — first").

The spike is a **throwaway** — a harness to de-risk the spec, deleted afterward, not the first commit of the build. It does **not** breach the no-code-before-Gate-2 rule; building the real feature still waits for Gate 2.

## Gate 1 — Spec approval (hard stop)

When all chunks are drafted and reviewed, confirm with the user that the spec set is fully flushed out. Then **stop and wait**. Do not write the implementation plan, and absolutely do not write code, until the user explicitly says to proceed.

## Phase 5 — Implementation plan

On the user's go-ahead, write a build-order document in the same spec directory (e.g. `specs/<feature-name>/build-order-01.md`). Its job is to map the spec set into an ordered sequence of independently implementable, independently testable build chunks. It must allow for multiple execution strategies (single agent, agent teams, parallel workflows) — it pins down *ordering, dependencies, and completion gates*, not *who or how*.

**Build chunks need not be 1:1 with spec chunks.** Spec chunks are coherent *behavior* units; build chunks are *build* units, and the plan may split, merge, or re-sequence them (e.g. split a chunk so its risky dependency is quarantined behind a swappable seam and the walking skeleton stays runnable) — recording the mapping in the plan **without editing the spec files.** Let `fable-planner`'s decomposition heuristics drive that mapping: quarantine the uncertain dependency, front-load pure cores, keep a runnable skeleton at every step, and compute the critical path and parallelism frontier.

The plan drives an **unattended** pipeline. Do not invent "human-run" or "manual" steps the request didn't call for; every step is automated by default. Mark a step manual only when it is genuinely unautomatable (e.g. an action with no API), and say why.

Structure (modeled on the user's proven format):

1. **Header** — document name, inputs (the spec files it derives from), consumer ("unattended implementation pipeline"), and the global definition of done (e.g. "each chunk is complete only when the full quality gate is green").
2. **Sequencing principles** — the handful of rules that drove the ordering (e.g. test infrastructure before features, boundaries/interfaces before consumers, pure cores early, a runnable walking skeleton as early as possible).
3. **Phases containing chunks.** Each build chunk lists:
   - **Specs:** which spec files/sections it implements
   - **Deps:** which chunks must precede it
   - Scope bullets — what it builds, concretely
   - **Done when:** an objectively checkable completion gate
4. **Dependency graph** — an ASCII summary, plus the critical path and where parallelism is widest.
5. **Chunk completion contract** — the rules every chunk must satisfy (e.g. tests written first and initially failing, full quality gate green, no suppressed lint/coverage, walking skeleton still launches).

Like the specs, the plan must be readable cold with zero conversation context.

## Gate 2 — Plan approval (hard stop)

Present the plan and **stop**. The user will review it and may `/clear`, hand it to a fresh session, or propose a specific execution strategy (teams, workflows, goals). Do not begin building until explicitly told to.

## Phase 7 — Build

Only after explicit approval at Gate 2:

- Implement chunks in dependency order, honoring each chunk's "done when" gate before moving on.
- Update the spec README's status column as chunks complete.
- If implementation reveals a gap or contradiction in the spec, **update the spec file first**, flag it to the user, then continue — never silently diverge from the written spec. The spec must remain the source of truth at all times.

When delegating chunks to subagents or a workflow, treat each agent's "done,
gate green" as **untrusted telemetry, not a result.** Re-verify on the
integration branch (re-run the gate; confirm the commit and the claimed files
actually landed). Self-reports drift, over-claim, and occasionally describe work
that isn't on disk — the gate and the tree are the arbiters, not the summary.

## Phase 8 — Verify against reality (before declaring done)

A green quality gate is **necessary but not sufficient.** Coverage, lint, type,
and BDD checks run against fakes and test doubles; they prove the tests pass, not
that the software *works*. The most expensive rework in this workflow comes from
treating "gate green" as "done" and discovering — after a release, or after the
user runs it — a pile of failures the gate structurally could not see. Two kinds
of gap survive a green gate and must be closed here:

- **Behavioral failures only the running artifact reveals** — a process that
  hangs on quit, a click that lands a row off, a dialog that can't be confirmed,
  a request that always conflicts, a render glitch. **Drive the real artifact**
  and exercise the feature as a user would. For this repo's TUI that's the
  `tui-manual-test` skill (black-box driving under tmux); for other artifacts
  it's the equivalent — run the binary, hit the endpoint, click the UI. Verify
  the *specific* expected behavior, not "it didn't crash."
- **Spec-conformance gaps the gate doesn't enforce** — a chunk that passes its
  tests while quietly implementing only part of its acceptance criteria (e.g.
  wiring one tab when the spec said every tab). Before declaring a feature done
  or cutting a release, do a **read-only audit of the implementation against the
  spec's acceptance criteria** — ideally an independent reviewer — and treat any
  unmet criterion as a bug to fix, not a footnote.

Then **fix what you find and re-verify**, looping until a clean run: every
acceptance criterion is met against the running artifact, no regressions, and the
gate is still green. Only then is the feature done. (Fold this into each chunk's
"done when" where it's cheap — a Mode-B smoke after a chunk lands — and run the
full pass at feature/release milestones.)

## Opting out

Skip this workflow only when the user explicitly says so ("skip the spec", "just hack it", "no SDD this time") or explicitly invokes another spec framework such as Spec Kit — then follow that framework's process instead. Ambiguity is not an opt-out: a terse or urgent-sounding request still gets the full workflow, just with a fast clarification phase.

## Anti-patterns to avoid

- Writing code or scaffolding "to explore" before Gate 2 (a *throwaway* hardening spike in Phase 4 is the one exception — delete it)
- Batching multiple clarifying questions into one message — or asking a bare open question when you could lead with options + a recommendation
- Asking a question built on an assumption the user never validated
- Ignoring project conventions (CLAUDE.md) for how questions must be asked
- Treating a terse nudge ("and?", "ok?") as approval of something the user hasn't seen
- Acting on a loosely-scoped instruction without confirming the scope, then having to revert an over-broad edit
- Treating clarification as a one-time phase that ends before drafting
- Drafting every chunk in one pass instead of reviewing one at a time
- Refusing to revise an earlier chunk because it was "already reviewed"
- Speccing a module greenfield without checking it already exists in the codebase
- Citing a file, spec section, symbol, or key that doesn't resolve in the real tree
- Checking each chunk in isolation while the chunks disagree (mismatched contracts, colliding keys, undeclared cross-chunk deps)
- Letting the README's dependency graph or critical path drift out of sync with the per-chunk dependencies
- Asking for Gate 1 approval while the spec's riskiest assumption is still unproven
- Assuming build chunks must map 1:1 to spec chunks
- Inventing "human-run" steps in a plan meant for an unattended pipeline
- A spec or plan that only makes sense alongside the chat transcript
- Treating the user's first message as a complete spec
- Declaring a feature done — or cutting a release — on a green gate alone, without driving the running artifact (the gate proves tests pass, not that it works)
- Accepting a delegated chunk's "done, gate green" self-report without re-verifying it on the integration branch
- A chunk that passes its own tests while implementing only part of its acceptance criteria, with no spec-conformance audit to catch it
- Renumbering a spec directory after other files already reference its path
