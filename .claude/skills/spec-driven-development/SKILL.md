---
name: spec-driven-development
description: Specification-Driven Development (SDD) workflow that MUST be followed for every software building task — new features, apps, scripts, refactors, bug fixes, tooling, or any request to build, create, implement, add, or change code. Use this skill BEFORE writing any code or creating any implementation files, even when the user's request sounds ready to implement. The user works spec-first - specs are drafted, reviewed chunk by chunk, and explicitly approved before an implementation plan is written, and the plan is approved before any code is written. Stand down only if the user explicitly opts out (e.g. "skip the spec", "no SDD", "just do it directly") or explicitly invokes a different SDD framework (e.g. Spec Kit / speckit), in which case follow that framework instead.
---

# Spec-Driven Development

The user practices Specification-Driven Development. The spec — not the conversation — is the driving artifact. Specs and plans are consumed by an automated implementation pipeline that may run unattended, possibly by a fresh agent with zero conversation history (the user may `/clear` or hand off to a team/workflow). Spec quality is the critical investment; implementation is cheap once the spec is right.

The single most important rule: **do not write code, scaffold projects, or create implementation files until the user explicitly says it's time to build.** The natural instinct to "barrel ahead and start building" is exactly the failure mode this workflow exists to prevent. Time spent in discussion and spec refinement is the work, not a delay before the work.

## Workflow overview

```
Intake → Clarify (Q&A) → Draft spec (chunk by chunk) → ⛔ GATE 1: spec approval
      → Implementation plan → ⛔ GATE 2: plan approval → Build
```

Both gates are hard stops. Never cross a gate on inference, enthusiasm, or "this seems ready" — only on an explicit user go-ahead.

## Phase 1 — Intake

The user opens by saying what they want to do. Respond by briefly restating your understanding of the goal and move to clarification. Do not create files. Do not write code. Do not draft the spec yet — premature drafts anchor the discussion on guesses.

It is fine (and often useful) to read the existing codebase during this phase to ground your questions in reality.

## Phase 2 — Clarify

Ask clarifying questions **one at a time, always**. Never batch questions into a list. One question at a time matters because each answer reshapes what the next question should be — a batched list is built on assumptions the first answer may invalidate.

- The user may answer the question, or may info-dump a pile of context instead. Absorb whatever is given, update your model, and continue with the next single most important question.
- Prefer questions that resolve the largest ambiguity or the decision with the biggest ripple effect.
- Continue until you could write the spec without guessing on anything material. Then say so and propose moving to drafting.

## Phase 3 — Draft the spec, chunk by chunk

### File layout

```
specs/
└── <feature-name>/          # one subdirectory per spec
    ├── README.md            # index: purpose, chunk list with ordering, dependencies, status
    ├── 01-<chunk-name>.md   # one file per chunk
    ├── 02-<chunk-name>.md
    └── ...
```

Break the work into discrete, independently testable chunks. Start by proposing the chunk breakdown (this becomes the README skeleton) and get the user's reaction before writing any chunk.

### One chunk at a time, and ripple edits are normal

Draft **one chunk, then review it with the user before drafting the next.** Discussion of chunk N frequently exposes problems in chunks already written — when that happens, go back and revise the earlier chunk files and the README. The entire spec set stays open for revision until Gate 1; nothing is frozen chunk-by-chunk. Treat "we changed our minds about chunk 2 while discussing chunk 5" as the process working, not as churn.

### Spec content

No fixed template — judge what each chunk needs. That said, these communicate intent especially well and should be reached for by default:

- **User stories** for the why and who
- **Acceptance criteria in given-when-then format** — these become the testable contract
- **Diagrams** (Mermaid) for flows, state machines, and architecture where prose is ambiguous

Every spec file must be **fully self-contained**: a fresh agent reading only the files in `specs/<feature-name>/` — with no access to this conversation — must be able to implement correctly. If a decision was made in chat, it must be written into the spec; conversation context does not survive handoff.

## Gate 1 — Spec approval (hard stop)

When all chunks are drafted and reviewed, confirm with the user that the spec set is fully flushed out. Then **stop and wait**. Do not write the implementation plan, and absolutely do not write code, until the user explicitly says to proceed.

## Phase 5 — Implementation plan

On the user's go-ahead, write a build-order document in the same spec directory (e.g. `specs/<feature-name>/build-order-01.md`). Its job is to map the spec set into an ordered sequence of independently implementable, independently testable build chunks. It must allow for multiple execution strategies (single agent, agent teams, parallel workflows) — it pins down *ordering, dependencies, and completion gates*, not *who or how*.

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

## Opting out

Skip this workflow only when the user explicitly says so ("skip the spec", "just hack it", "no SDD this time") or explicitly invokes another spec framework such as Spec Kit — then follow that framework's process instead. Ambiguity is not an opt-out: a terse or urgent-sounding request still gets the full workflow, just with a fast clarification phase.

## Anti-patterns to avoid

- Writing code or scaffolding "to explore" before Gate 2
- Batching multiple clarifying questions into one message
- Drafting every chunk in one pass instead of reviewing one at a time
- Refusing to revise an earlier chunk because it was "already reviewed"
- A spec or plan that only makes sense alongside the chat transcript
- Treating the user's first message as a complete spec
