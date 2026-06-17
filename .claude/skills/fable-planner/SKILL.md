---
name: fable-planner
description: A planning-and-implementation playbook for building software the way this repo was built — verification-driven, decomposition-first, paranoid about unverified assumptions. Reach for it WHEN decomposing a substantial feature into a build order or chunk plan; when implementing against a strict quality gate (high coverage, no escape-hatch comments); when a fix "should work" but doesn't and you need to debug rigorously; when integrating work from parallel agents; or when a build depends on an external assumption (a library behavior, a model, an SDK quirk) you haven't proven. Use it to plan and implement more like Fable — measure and reproduce instead of assuming, isolate risk early, and decompose so the work is parallelizable and self-verifying. Complements spec-driven-development (which governs the spec→plan→build gates); this governs the *quality of thinking* inside planning and build.
---

# Fable planner

A playbook distilled from how this repo was built (the worked examples live in
[docs/PROCESS-NOTES.md](../../../docs/PROCESS-NOTES.md) and
[specs/001-initial-features/build-order-01.md](../../../specs/001-initial-features/build-order-01.md)). It is not a workflow
with gates — for the spec→plan→build gates use `spec-driven-development`. This
is about *how to think* while planning a decomposition and while implementing.

## The one principle everything derives from

**Don't trust — reproduce, measure, and verify against ground truth.** Self
-reports, library event APIs, spec claims, "it compiled," "the tests pass," and
your own memory are all *claims*, not facts. The default move when something
matters is to independently check it: rebuild the artifact, read the bytes, run
the shipped binary on the target, probe the live behavior. Most agents accept
the claim and move on; that is the gap this skill closes.

A fast self-check before you act on any belief: *"Is this verified, or am I
assuming it?"* If assuming, and it's load-bearing, verify it cheaply first.

---

## Part A — Planning a decomposition / build order

When you carve work into chunks (a build order, a multi-step plan, a migration),
apply these heuristics. They are why the parallel build in this repo worked.

1. **Bootstrap the enforcer before anything it enforces.** The first chunk
   stands up the quality gate (CI, linters, coverage thresholds, the test
   runner) on a trivial hello-world — *before* any feature. If the gate doesn't
   exist from line one, nothing holds later chunks to it.

2. **Boundaries and fakes before consumers.** Define interfaces and scripted
   fakes early so the whole system can be built and fully tested against fakes
   before any real I/O (cluster, model, network, subprocess) exists. Real
   adapters land later and lag behind the fakes. The fakes are code too — test
   them.

3. **Isolate the uncertain, heavyweight dependency to a late, swappable chunk.**
   Anything you're not sure exists or works as described (a specific model, a
   third-party API, an unproven SDK capability) goes *behind an interface*, and
   the feature is built and tested against a fixture first. In this repo the
   agent's whole tool layer was built on a `FixtureEngine` before the real model
   adapter — so discovering mid-build that the spec's named model didn't exist
   changed *one* chunk, not the feature. **Ask: what's the riskiest external
   assumption, and is it quarantined behind a seam?**

4. **Pure cores early.** Parsers, resolvers, rule engines — pure and
   table-driven — are the cheapest 100%-coverage wins and they unblock
   everything layered above. Front-load them.

5. **A runnable artifact as early as possible, and keep it runnable.** Get a
   walking skeleton launching early; make "still launches" part of every
   chunk's definition of done. Integration is continuous, not a final phase.

6. **A uniform chunk contract is what makes fan-out possible.** Every chunk
   should be independently implementable, independently testable, with the
   *same* definition of done and explicit dependencies. Identical self-verifying
   units are what let work be handed to parallel agents safely.

7. **Compute the critical path and the parallelism frontier.** State them in the
   plan (an ASCII dep graph, the longest chain, the point where the most chunks
   are mutually independent). That's scheduler input, not decoration.

8. **Place expensive/flaky verification surgically.** Use fakes for all *logic*;
   reserve real-environment tests (live cluster, real network) for the handful
   of behaviors fakes genuinely can't reproduce. Mark irreducibly flaky paths
   **non-gating** so they inform without blocking.

9. **Name the one invariant that must never break** (a security/redaction
   property, a data-integrity rule) and demand *adversarial* tests for it,
   above ordinary coverage.

10. **Make time and randomness injectable** (a `Clock`, a seed). Time-dependent
    behavior — timeouts, retries, animations, idle-close — must be
    deterministically testable. Ban ambient `Date.now()`/`Math.random()`.

---

## Part B — Implementing and debugging

1. **Verify by reconstruction; read opaque things directly.** Don't trust a
   tool's summary of an artifact — rebuild it and compare, or parse its bytes.
   When asked "how was X done," mine the logs/transcript/history for the actual
   commands rather than reconstructing from memory.

2. **Test the actual shipped thing on the actual target.** "It compiled" ≠ "it
   works." Run the built binary (cross-arch? run it in a container for that
   arch); smoke-test the *published* release asset; assume downloaded
   executables may be quarantined. Treat version strings and other "obvious"
   outputs as things to confirm — they hide in more than one place.

3. **Isolate the risky unknown in a throwaway harness — first.** Before building
   the durable thing, prove the riskiest recipe in the smallest possible script
   for the fastest feedback (does this control-plane boot? does this model emit
   parseable tokens? which dtype/device is fast enough?). Decouple the unknown
   from the whole app so you're testing one thing.

4. **Root-cause to system signals; leave the repo when the evidence points
   out.** When code looks correct but behavior is wrong, suspect the
   environment: memory pressure, CPU starvation, VM limits, a control loop
   fighting you. Inspect load/free/ps, correlate the failure to resources, and
   fix where the cause actually is — even if that's a hypervisor setting, not a
   source file.

5. **When a library misbehaves, prove it's the broken layer, then go under it.**
   Don't assume your code is wrong because the API is "official." Instrument
   layer by layer (does the event fire? are the bytes arriving?) until you've
   localized the break, then drop to the level below it (raw stream, raw HTTP)
   using primitives you control. Silent failures (the call "succeeds" but does
   nothing) are the classic tell.

6. **Make edits fail loud.** A string-replace that doesn't match is a silent
   no-op that still typechecks green. Assert the anchor exists before replacing
   (`assert old in s`, or an index lookup that throws). Prefer the structured
   Edit tool, which errors on a missed/ambiguous match, over `sed -i`.

7. **Black-box drive interactive programs.** For a TUI/CLI, drive the real
   process (e.g. tmux `send-keys` + `capture-pane`), because real terminals
   batch input and emit escape sequences that unit tests feeding one clean char
   never exercise. Synthesize the wire-level events (mouse SGR, control bytes)
   when needed; poll-until-predicate beats fixed sleeps under load.

8. **Gate behavior on a runtime measurement, not a static flag.** When a
   capability depends on the host (is it fast enough? big enough?), measure at
   startup and decide, so one artifact adapts across environments.

9. **Validate external assumptions before building on them.** If the plan rests
   on a claim about the outside world (a model's capabilities, an SDK's
   guarantees, a tool's output format), confirm it with evidence (a probe, a
   doc, a search) *before* the chunk that depends on it — not after it fails.

---

## Part C — If you fan out to parallel agents

1. **The gate is the arbiter.** Treat every subagent's "done / all green" as
   untrusted telemetry. Re-verify by running the whole-repo gate on the
   integration branch yourself.

2. **Integrate by path-scoped pick, not blind merge.** Take only each agent's
   explicitly enumerated deliverable files onto a correctly-configured
   integration branch; check for collisions and unexpected modifications first.
   A blind `git merge` inherits any drift (deleted config, reformatting) an
   agent introduced.

3. **Deconflict shared surfaces before spawning.** Assign any shared component a
   single owner up front; tell other agents to build their own variant so
   parallel branches can't collide on it.

---

## Red flags that mean "stop and apply this skill"

- You're about to `git merge` a subagent's branch on the strength of its summary.
- You're about to write the production version of something whose riskiest part
  you haven't proven in isolation.
- A fix "should work" and doesn't, and you're about to try another guess instead
  of instrumenting to localize the break.
- You're treating a library's success return as proof it did the thing.
- Your plan has the uncertain external dependency wired through the core instead
  of behind a seam.
- You're documenting/reporting how something was done from memory instead of
  from the record.
- You changed a file with `sed`/`replace` and didn't confirm the match landed.
