# Privateer — Quality & Testing Spec
**Spec:** 08-quality-testing
**Status:** Draft
**Applies to:** All specs (01–07) and all implementation chunks
**Toolchain:** Vitest · Cucumber.js · envtest · ESLint (strict) · Bun

---

## 1. Goals

- Define the test pyramid: Gherkin behavior specs, unit tests, envtest integration tests
- Enforce **100% code coverage** (lines, branches, functions, statements) with **no exemptions**
- Establish TDD/BDD as the implementation methodology the pipeline must follow
- Define the design-for-testability requirements that 100% coverage imposes on all code
- Define the mock/fake inventory and envtest harness
- Define strict linting configuration
- Define the implementation-loop cadence: tests run at regular intervals, failures fixed immediately

These requirements are **inputs to design**, not afterthoughts. Every spec's implementation must be architected so that 100% coverage is achievable without contortion — if a line can't be tested, the design is wrong, not the requirement.

---

## 2. Test Pyramid

```
            ┌──────────────────────────┐
            │  Cucumber.js features    │  Behavior: user-visible flows
            │  (Gherkin, BDD)          │  Run against the real app with
            │                          │  faked process boundaries
            ├──────────────────────────┤
            │  envtest integration     │  Real kube-apiserver: watches,
            │                          │  conflicts, RBAC, CRDs
            ├──────────────────────────┤
            │  Vitest unit tests       │  Everything. 100% coverage
            │  (TDD)                   │  enforced here.
            └──────────────────────────┘
```

| Layer | Tool | Scope | Speed target |
|---|---|---|---|
| Unit | Vitest | Every module in isolation; all branches | Full suite < 30s |
| Integration | Vitest + envtest | K8s client layer, watch aggregator, status resolvers against a real API server | Suite < 3 min |
| Behavior | Cucumber.js | End-to-end user flows through the real composed app with fakes at process boundaries | Suite < 5 min |

---

## 3. BDD — Cucumber.js Feature Files

### 3.1 Organization

Feature files are first-class spec artifacts. They live alongside the specs and are the executable form of each spec's acceptance criteria:

```
features/
  01-architecture/
    config-loading.feature
    context-switching.feature
    stream-lifecycle.feature
  02-navigation/
    sidebar.feature
    keyboard-navigation.feature
    mouse-interaction.feature
    command-bar.feature
  03-resources/
    status-resolution.feature
    crd-discovery.feature
  04-views/
    resource-table.feature
    yaml-edit-diff-save.feature
    events-filtering.feature
    secret-redaction.feature
  05-actions/
    logs.feature
    exec-handover.feature
    port-forward-manager.feature
    delete-confirmation.feature
    quit-guard.feature
  06-metrics/
    source-discovery.feature
    exporter-degradation.feature
    health-rules.feature
    kafka-lag.feature
  07-agent/
    fast-path.feature
    tool-dispatch.feature
    agent-actions.feature
    secret-redaction-agent.feature
    no-agent-mode.feature
```

**Rule:** every numbered requirement in Specs 01–07 maps to at least one scenario. The implementation pipeline must write (or receive) the feature file for a chunk **before** implementing it — features are the BDD contract, unit tests are the TDD loop inside it.

### 3.2 Style

```gherkin
Feature: YAML edit, diff, and save
  As an operator
  I want to review a diff before my edit is applied
  So that I never push an unintended change to the cluster

  Background:
    Given a cluster with a Deployment "order-api" in namespace "default" with 2 replicas

  Scenario: Saving a valid edit shows a diff and applies on confirm
    Given I am editing the YAML of Deployment "order-api"
    When I change "spec.replicas" to 3
    And I press "Ctrl+S"
    Then I see a diff containing "replicas: 2  →  3"
    When I confirm the diff
    Then the Deployment "order-api" has 3 replicas on the server
    And the command bar shows "✓ Applied"

  Scenario: A stale resourceVersion produces a conflict recovery prompt
    Given I am editing the YAML of Deployment "order-api"
    And the Deployment "order-api" is modified on the server by another client
    When I change "spec.replicas" to 3
    And I press "Ctrl+S"
    And I confirm the diff
    Then I see the conflict prompt "[Reload & re-edit] [Discard]"
```

Conventions:
- Scenarios are written in domain language (resources, panes, keys), never implementation language (functions, classes)
- One behavior per scenario; `Scenario Outline` for input matrices (e.g. status resolver tables)
- Step definitions are thin — they drive the composed app and assert; logic lives in the app
- Tags: `@envtest` (requires real API server), `@tui` (drives the Ink renderer), `@slow`

### 3.3 World / harness

Cucumber's World composes the real application with fakes only at process boundaries (see §5): in-memory kubeconfig, fake TTY (via `ink-testing-library`-style stdin/stdout capture), fake clock, fake Prometheus HTTP server, recorded model fixtures. `@envtest`-tagged features swap the fake k8s client for a real envtest API server.

---

## 4. TDD — Vitest Unit Tests

### 4.1 The loop the pipeline must follow

For every implementation chunk:

1. Feature file exists (BDD contract) — failing
2. Write a failing unit test for the smallest next behavior (red)
3. Write the minimum code to pass (green)
4. Refactor with tests green
5. Repeat until the chunk's scenarios pass
6. **Run the full unit suite + lint + coverage after every green step** — never proceed on a red suite or a coverage drop. Failures are fixed immediately; compounding failures are the primary failure mode of unattended pipelines.

### 4.2 Vitest configuration (mandatory)

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      enabled: true,                    // coverage on by default, every run
      reporter: ['text', 'lcov', 'html'],
      thresholds: {
        lines: 100,
        branches: 100,
        functions: 100,
        statements: 100,
      },
      all: true,                        // untested files count against coverage
      include: ['src/**/*.ts', 'src/**/*.tsx'],
    },
    setupFiles: ['./test/setup.ts'],
  },
});
```

### 4.3 Coverage policy — 100%, no exemptions

- `/* v8 ignore */`, `/* istanbul ignore */`, `c8 ignore` and equivalents are **forbidden**. CI greps for them and fails the build if any appear.
- `thresholds` are enforced in CI and in the local loop — a coverage drop is a failing build identical to a failing test.
- There is no "legacy code" carve-out; the repo starts at 100% and stays there.
- Generated files are not in `src/` and are excluded structurally, not by ignore comment.

**Consequences for design (binding on all specs):** see §6.

### 4.4 Unit test conventions

- File layout: `src/foo/bar.ts` → `src/foo/bar.test.ts` (co-located)
- `describe` blocks are behavior sentences; `it` reads as `it('closes idle streams after the configured timeout')`
- No snapshot tests for logic (snapshots allowed only for rendered TUI frames, reviewed deliberately)
- Table-driven tests for status resolvers, rule engine, age formatting, intent parser — every row in a Spec 03/06 table is a test case
- Property-based tests (fast-check) encouraged for parsers (SGR mouse sequences, YAML round-trips, intent parser)

---

## 5. Fakes, Mocks, and envtest

### 5.1 Boundary inventory

All external boundaries have an injected interface with a production adapter and a test fake. **Only boundaries are faked** — internal modules are tested through their real implementations.

| Boundary | Interface | Production | Test double |
|---|---|---|---|
| K8s API | `KubeClient` | `@kubernetes/client-node` adapter | `FakeKubeClient` (in-memory resources, scripted watch events) / envtest |
| Prometheus | `MetricsSource` | HTTP adapter | `FakePrometheus` (in-process HTTP server with canned series) |
| Model inference | `InferenceEngine` | `@huggingface/transformers` adapter | `FixtureEngine` (recorded request→response fixtures) |
| Subprocesses (kubectl) | `ProcessRunner` | Bun.spawn adapter | `FakeProcessRunner` (scripted lifecycle, exit codes, output) |
| Clock | `Clock` | `Date.now` / timers | Vitest fake timers via injected clock |
| Filesystem (config, model dir, downloads) | `ConfigStore` / `FileSink` | fs adapter | In-memory implementations |
| TTY | Ink render target + Input Layer source | real stdin/stdout | Captured stream pair; scripted key/mouse byte sequences |
| Process exit / signals | `Lifecycle` | `process.exit`, signal handlers | `FakeLifecycle` (records exit requests) |

The `Lifecycle` boundary exists specifically because 100% coverage forbids untestable `process.exit()` calls — exit is a request to an injected object, asserted in tests, executed for real only in `main.ts`.

### 5.2 `main.ts` composition root

The only file allowed to touch real boundaries directly is the composition root, which contains **zero logic**: it constructs production adapters, wires them, and calls `app.run()`. It is covered by a single smoke test that asserts construction succeeds with all production adapters in a stub environment.

### 5.3 envtest harness

envtest runs a real `kube-apiserver` + `etcd` (no kubelet, no controllers) — the honest way to test watches, resourceVersion semantics, 409 conflicts, RBAC denials, and CRD registration.

- Binaries fetched via `setup-envtest` (kubebuilder-tools) into a cached toolchain dir; version pinned in repo
- A Vitest `globalSetup` boots one API server per worker; each test file gets a fresh namespace for isolation
- Strimzi, Doppler, and Prometheus Operator **CRD manifests are vendored** into `test/crds/` and applied in setup, so CRD discovery, Kafka status resolvers, and sidebar grouping are tested against real schemas
- What envtest covers (and fakes must not be trusted for): watch resumption after disconnect, `resourceVersion` conflict on PUT, field selectors, RBAC 403s (via impersonation), CRD apiextensions discovery
- What envtest cannot cover: exec/attach and port-forward (no kubelet) — these are covered by `FakeProcessRunner`/fake WebSocket unit tests plus a thin optional `@cluster` smoke suite against kind (manual/nightly, **not** part of the enforced gate)

### 5.4 Agent testing strategy

The model is non-deterministic; it is therefore **outside the 100%-coverage code boundary** and tested in two ways:

1. **All Privateer code around the model is deterministic and fully covered:** prompt builder (golden-file tests), tool dispatcher (including the Secret-redaction invariant — adversarial fixtures asserting `[redacted]`), action parser/validator (malformed JSON, unknown actions, oversized answers), round/timeout guards (fake clock), fast-path parser (table-driven over the full alias dictionary).
2. **Model behavior evals** live in `evals/` as a separate non-gating suite: a fixture set of (query, cluster summary) → expected action, run against the real E2B model on demand and in nightly CI, reported as a pass-rate metric. Evals inform prompt iteration; they never block the build (non-determinism must not poison a strictly-gated pipeline).

`FixtureEngine` replays recorded model outputs in unit/behavior tests so agent UX flows (spinner states, AgentTab rendering, auto-open) are fully covered deterministically.

---

## 6. Design-for-Testability Requirements (binding)

These are architectural requirements imposed by the 100% rule. The implementation pipeline must treat violations as defects.

1. **Dependency injection everywhere** — no module imports a boundary adapter directly; everything receives interfaces via constructor/props. No module-level singletons; no module-level side effects.
2. **No unreachable code** — no `default: throw new Error('unreachable')` on exhaustive unions. Use exhaustiveness checking (`satisfies never`) so the compiler proves it and no runtime branch exists to cover.
3. **Injected clock and randomness** — no direct `Date.now()`, `setTimeout`, or `Math.random()` outside adapters.
4. **Errors as values where practical** — expected failures (403, 409, stream drop, port in use) are typed results, not thrown exceptions, so every error path is a constructible test input.
5. **Pure cores, thin shells** — status resolvers, rule engine, diff engine, intent parser, age formatter, sparkline scaler are pure functions over plain data.
6. **TUI components take state via props** and emit intents via callbacks; they never reach into the store directly except through one tested hook layer. Rendering is covered via frame-capture tests on the fake TTY.
7. **Every branch in a spec table is a named test case** — if Spec 03 says "yellow when readyReplicas < replicas && > 0", a test asserts exactly that boundary, including the off-by-one edges.

---

## 7. Strict Linting

### 7.1 Toolchain

- **ESLint** (flat config) with `typescript-eslint` `strictTypeChecked` + `stylisticTypeChecked`
- **Prettier** for formatting (no style rules in ESLint); checked in CI
- **tsc --noEmit** as a separate CI step — type errors are build failures
- Lint runs with `--max-warnings 0`: **warnings are errors**

### 7.2 Key rule decisions (beyond the presets)

| Rule | Setting | Rationale |
|---|---|---|
| `@typescript-eslint/no-explicit-any` | error | `any` defeats the type-driven test design |
| `@typescript-eslint/no-non-null-assertion` | error | forces handled branches (which must then be covered) |
| `@typescript-eslint/switch-exhaustiveness-check` | error | pairs with §6.2 |
| `@typescript-eslint/no-floating-promises` | error | unawaited promises are the top source of flaky TUI tests |
| `no-restricted-imports` | error | bans importing boundary adapters outside `main.ts` and `adapters/` (enforces §6.1 mechanically) |
| `no-restricted-syntax` | error | bans `process.exit`, bare `Date.now()`, `Math.random()`, and coverage-ignore comments outside adapters |
| `eqeqeq`, `no-fallthrough`, `curly` | error | baseline strictness |

`tsconfig`: `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`.

### 7.3 Suppression policy

`eslint-disable` comments follow the same philosophy as coverage: forbidden in `src/` except inside `adapters/` with a justification comment on the same line; CI counts them and fails if any appear outside that directory.

---

## 8. CI Pipeline & Gates

Every commit (and every pipeline chunk completion) runs, in order, all blocking:

```
1. prettier --check
2. eslint --max-warnings 0  (+ grep gate: no coverage-ignore / disable comments)
3. tsc --noEmit
4. vitest run            (unit, coverage thresholds 100/100/100/100)
5. vitest run @envtest   (integration, real API server)
6. cucumber-js           (behavior suite on fakes; @envtest-tagged features on real API server)
```

Nightly / on-demand (non-blocking, reported):
```
7. evals/ model eval pass-rate (real Gemma 4 E2B)
8. @cluster smoke suite against kind (exec handover, port-forward, Strimzi end-to-end)
```

**Flaky test policy:** a test that fails intermittently is treated as a real defect in either the test or the design (usually an uninjected clock or unawaited promise). It is fixed immediately — never retried-until-green, never skipped. `.skip`/`.only` in committed code fail CI via lint.

---

## 9. Implementation Cadence Requirements (for the pipeline)

1. **Per chunk:** feature file first → red/green/refactor unit loop → full gate (§8 steps 1–6) → chunk complete. A chunk is not complete with any red gate.
2. **Run interval:** the full unit suite + lint runs after **every** green step, not just at chunk end. The 30s unit-suite speed target exists to make this cadence viable.
3. **Failure handling:** any failure stops forward progress until fixed. The pipeline must never stack new work on a red baseline — compounding failures in unattended runs are unrecoverable.
4. **Coverage is monotonic:** the gate makes it binary (100% or fail), so "monotonic" is automatic — but the pipeline should surface *which lines* a failing run left uncovered as its primary diagnostic.

---

## 10. Per-Spec Acceptance Mapping

Each spec's testable surface, at a glance (the feature files in §3.1 are the executable form):

| Spec | Primary test focus | Critical scenarios |
|---|---|---|
| 01 | Stream lifecycle (envtest), config hot-reload, context teardown, agent layer wiring | Core-set streams open at startup; idle close at timeout (fake clock); resumption after drop (envtest); managedFields stripped |
| 02 | Input layer, focus model, resize persistence | SGR sequence parsing (property-based); hit-testing routing; `Space`→agent vs pane focus; badge tiers |
| 03 | Status resolvers, CRD discovery | Every resolver table row + boundary edges; Strimzi conditions parsing against vendored CRDs (envtest); generic fallback |
| 04 | Edit→diff→save, redaction, events filter | 409 recovery; secret `[redacted]` + reveal confirm; warning-only default; empty states |
| 05 | Action flows, subprocess lifecycle | Container picker logic matrix; handover suspend/restore (fake TTY); forward failure→retry; quit guard; SIGTERM on exit |
| 06 | Discovery cascade, rule engine, degradation | Source priority fallthrough; per-exporter probe→chart gating; every health rule (incl. suppression annotation, SEC-005 exclusions, KFK applicability matrix); session-buffer sparklines |
| 07 | Fast path, dispatcher, action execution | Full alias table; redaction invariant (adversarial); round cap & timeout; auto-open on answer; `--no-agent` Space behavior; FixtureEngine flows |

---

## 11. Resolved Decisions

| # | Question | Decision |
|---|---|---|
| OQ-1 | Test infrastructure | Mocks/fakes at boundaries + envtest for k8s truth; kind only as non-gating smoke |
| OQ-2 | Unit framework | Vitest, coverage on by default (v8 provider) |
| OQ-3 | Coverage target | 100% lines/branches/functions/statements, strictly enforced, monotonic |
| OQ-4 | Coverage exemptions | Truly forbidden; CI greps for ignore comments |
| OQ-5 | Methodology | TDD (red/green/refactor) inside BDD (Cucumber.js Gherkin contracts written first) |
| OQ-6 | BDD tooling | Cucumber.js with feature files as first-class spec artifacts |
| OQ-7 | Linting | ESLint strictTypeChecked, warnings-as-errors, mechanical enforcement of DI boundaries; Prettier; strict tsc |
| OQ-8 | Model testing | Deterministic shell at 100% coverage; model behavior in non-gating eval suite |
| OQ-9 | Test cadence | Full unit suite + lint after every green step; failures block immediately |
