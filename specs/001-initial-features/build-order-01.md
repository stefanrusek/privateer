# Privateer — Build Order
**Document:** build-order-01
**Inputs:** Specs 01–08
**Consumer:** unattended implementation pipeline — each chunk is independently implementable and testable, completed only when the full Spec 08 gate is green

---

## Sequencing principles

1. **Test infrastructure before features** — the Spec 08 gate must exist before the first feature chunk, or nothing enforces it.
2. **Boundaries before consumers** — interfaces + fakes land before the code that injects them; production adapters can lag behind fakes.
3. **Pure cores early** — status resolvers, rule engine, parsers are pure, table-driven, and unblock everything above them while being the cheapest 100%-coverage wins.
4. **The app is runnable as early as possible** — a walking skeleton exists by Chunk 6 so every later chunk is verifiable in a real terminal, not just in tests.
5. **Agent last among features** — it consumes the State Store, navigation dispatch, and detail pane, so all must exist first. Model download UX is decoupled from inference (fixture-driven) so it isn't blocked on model availability.

Dependencies are listed per chunk; chunks with the same prerequisites may be built in any order (or in parallel if the pipeline supports it).

---

## Phase 0 — Foundation

### Chunk 0.1 — Repo scaffold & quality gate
**Specs:** 08 (§4.2, §7, §8)
- Bun + TypeScript project, strict tsconfig, ESLint flat config per Spec 08 §7, Prettier
- Vitest configured with 100% thresholds, coverage on by default
- Cucumber.js wired with an empty World; one trivial feature passing end-to-end
- CI gate (steps 1–6) running and **required**; grep gates for ignore/disable comments live
- `main.ts` composition-root skeleton + smoke test
**Done when:** the full gate runs green on a hello-world app at 100% coverage.

### Chunk 0.2 — Boundary interfaces & fakes
**Specs:** 08 (§5.1), 01 (§3)
- All eight boundary interfaces (`KubeClient`, `MetricsSource`, `InferenceEngine`, `ProcessRunner`, `Clock`, `ConfigStore`/`FileSink`, TTY pair, `Lifecycle`)
- Test fakes for each (`FakeKubeClient` with scripted watch events, `FakePrometheus`, `FixtureEngine`, `FakeProcessRunner`, fake clock, in-memory config, captured TTY, `FakeLifecycle`)
- `no-restricted-imports` boundary enforcement active
**Done when:** every fake has its own unit tests (fakes are code; they're covered too).

### Chunk 0.3 — envtest harness
**Specs:** 08 (§5.3)
- setup-envtest toolchain pinning, Vitest globalSetup booting per-worker API servers, namespace-per-file isolation
- Vendored CRD manifests (Strimzi, Doppler, Prometheus Operator) applied in setup
- One `@envtest` proof test: create/watch/delete a ConfigMap
**Done when:** `vitest run @envtest` is green in CI.

---

## Phase 1 — Data layer

### Chunk 1.1 — State Store & Watch Aggregator
**Specs:** 01 (§3.2, §3.3)
**Deps:** 0.2
- `ResourceEvent` normalization, Map-based store, upsert/delete semantics, subscription/notification (microtask), derived rollups
- managedFields/last-applied stripping
- Driven entirely by `FakeKubeClient` scripted events
**Features:** `01-architecture/stream-lifecycle.feature` (fake-backed scenarios)

### Chunk 1.2 — K8s client adapter & stream policy
**Specs:** 01 (§3.1), 03 (§7 discovery)
**Deps:** 1.1, 0.3
- kubeconfig loading, context model, typed clients
- Two-tier stream policy: core set at startup, lazy on-demand set, idle close (fake clock), backoff reconnect, Warning-events-only watch, periodic metadata LIST for badge counts
- CRD discovery (apiextensions) incl. group extraction
- `@envtest`: watch resumption via resourceVersion, 403 surfacing via impersonation, CRD discovery against vendored schemas
**Features:** `context-switching.feature`, `crd-discovery.feature`

### Chunk 1.3 — Resource model & status resolvers
**Specs:** 03 (§2–§5)
**Deps:** none (pure) — may run parallel to 1.1/1.2
- `ResourceObject` normalization, resolver registry, generic fallback
- Every resolver from Spec 03 incl. Strimzi conditions and DopplerSecret; age formatter
- Table-driven tests: one case per spec-table row plus boundary edges (Spec 08 §6.7)
**Features:** `status-resolution.feature` (Scenario Outlines mirroring spec tables)

---

## Phase 2 — Shell

### Chunk 2.1 — Input Layer
**Specs:** 01 (§3.5 Input Layer), 02 (§8, §9)
**Deps:** 0.2 (TTY boundary)
- SGR mouse enable/disable (incl. suspend hooks for later exec handover), sequence parser (property-based tests), hit-testing registry, drag tracking
- Keyboard dispatch with 500ms sequence buffer (`gg`), modal input model (Normal/Search/Command/Edit)
**Features:** `mouse-interaction.feature`, `keyboard-navigation.feature` (parser-level scenarios)

### Chunk 2.2 — Layout shell & navigation
**Specs:** 02 (§2–§6, §10, §11)
**Deps:** 2.1, 1.1, 1.3
- Three-region Ink layout, resizable panes with persisted ratios, focus cycling, sidebar tree with tiered count badges, header (namespace filter, search), empty command bar shell, context switcher overlay, help overlay
- Walking skeleton milestone: `p9r` launches against envtest/fake and navigates resource types
**Features:** `sidebar.feature`, full `keyboard-navigation.feature`

### Chunk 2.3 — ResourceTable
**Specs:** 04 (§3), 02 (§5)
**Deps:** 2.2
- Virtual scrolling, column schemas from 1.3, sort, row states/animations (fake clock), status indicators, empty/error/loading states, search filtering
**Features:** `resource-table.feature`

---

## Phase 3 — Detail pane & mutations

### Chunk 3.1 — DetailPane, Overview, Events
**Specs:** 04 (§4, §5, §8)
**Deps:** 2.3
- Tab container with availability matrix, Overview sections per resource type, annotations collapse, EventsTab (on-demand LIST, warning-default toggle), DopplerSecret managed-secret link
**Features:** `events-filtering.feature`

### Chunk 3.2 — YAML view, edit, diff, save
**Specs:** 04 (§6, §7), Spec 02 (§6.3)
**Deps:** 3.1
- Syntax-highlighted read view, Secret redaction + confirm-to-reveal, edit mode with gutter markers and inline YAML errors, DiffView, replace (PUT) save, 409 reload-and-re-edit recovery (`@envtest` for the real conflict)
**Features:** `yaml-edit-diff-save.feature`, `secret-redaction.feature`

### Chunk 3.3 — Delete & confirm dialogs
**Specs:** 04 (§12), 05 (§6)
**Deps:** 3.1
- Inline ConfirmDialog component, delete flow with cascade wording, watch-driven row removal
**Features:** `delete-confirmation.feature`

---

## Phase 4 — Actions

### Chunk 4.1 — Logs
**Specs:** 05 (§3)
**Deps:** 3.1
- Container picker logic (full state matrix), LogsTab with all controls (live/pause, timestamps, wrap, limits, previous, search, download via `FileSink`), heuristic colorization, 10k buffer
**Features:** `logs.feature`

### Chunk 4.2 — Exec (suspend-and-handover)
**Specs:** 05 (§4)
**Deps:** 2.1 (suspend hooks), 3.1
- Command input with history, Ink suspend/restore around raw-TTY exec WebSocket, SIGWINCH forwarding, drop handling
- Fake TTY + fake WebSocket coverage; kind smoke (non-gating) for the real path
**Features:** `exec-handover.feature`

### Chunk 4.3 — Port-Forward Manager & quit guard
**Specs:** 05 (§5, §5.8)
**Deps:** 3.1, 0.2 (`ProcessRunner`)
- Forward picker, kubectl subprocess lifecycle via `ProcessRunner` (ready detection, failure → retry), manager overlay with recents, `⇄ n` indicator, SIGTERM cleanup via `Lifecycle`, quit guard
**Features:** `port-forward-manager.feature`, `quit-guard.feature`

---

## Phase 5 — Metrics & health

### Chunk 5.1 — Metrics discovery & sources
**Specs:** 06 (§2)
**Deps:** 1.2, 4.3 (system tunnel reuses forward machinery)
- Discovery cascade (config → env → ServiceMonitor → probes → annotations → metrics-server → none), per-exporter metric-family probing, system port-forward with degrade/retry, polling scheduler with per-context intervals, metrics-server session buffer
**Features:** `source-discovery.feature`, `exporter-degradation.feature`

### Chunk 5.2 — Sparklines & charts
**Specs:** 06 (§3, §4)
**Deps:** 5.1, 2.3
- Sparkline scaler (pure) + list columns with threshold colors, ASCII chart renderer, range selector (20m/1h/4h/1d/2d), per-chart exporter gating, MetricsTab per resource type, lag chart with trend indicators and threshold bands
**Features:** chart scenarios in `06-metrics` features

### Chunk 5.3 — Health rule engine & dashboard
**Specs:** 06 (§5, §6, §7)
**Deps:** 1.1, 1.3, 5.1 (metrics-dependent rules degrade without it)
- Rule registry, every rule as a pure function with table-driven tests (incl. SEC-005 exclusions, KFK applicability matrix, suppression annotation), Kafka detection (Strimzi/bare/KRaft), dashboard view as default landing, click-through navigation, Kafka Exporter empty state + KFK-013
**Features:** `health-rules.feature`, `kafka-lag.feature`

---

## Phase 6 — Agent

### Chunk 6.1 — Fast path & command bar
**Specs:** 07 (§8), 02 (§7)
**Deps:** 2.2 (navigation dispatch)
- Agent-first command bar with mode indicators and `!` commands, alias dictionary shared with `!<resource>`, deterministic intent parser (full table-driven + property tests), action executor (navigate/filter/multi)
- Ships standalone value: the command bar is fully useful before any model exists
**Features:** `fast-path.feature`, `command-bar.feature`

### Chunk 6.2 — Tool dispatcher & AgentTab
**Specs:** 07 (§4–§7)
**Deps:** 6.1, 5.3 (Kafka lag tool), 1.1
- All nine tools against the State Store, **redaction invariant with adversarial fixtures**, prompt builder (golden files), action parser/validator, round cap + timeout (fake clock), AgentTab rendering/history/auto-open, humanized progress states — all on `FixtureEngine`
**Features:** `tool-dispatch.feature`, `agent-actions.feature`, `secret-redaction-agent.feature`

### Chunk 6.3 — Model adapter, first-run, evals
**Specs:** 07 (§11), 04 (§13)
**Deps:** 6.2
- `@huggingface/transformers` adapter (Gemma 4 E2B, thinking-mode policy), download manager with FirstRunScreen (progress via fake clock/streams), checksum, `--no-agent` mode incl. Space-as-command behavior
- Non-gating `evals/` suite with initial fixture set and nightly CI job
**Features:** `no-agent-mode.feature`, first-run scenarios

---

## Phase 7 — Release

### Chunk 7.1 — Polish & packaging
**Specs:** 01 (§4, §7), cross-cutting
**Deps:** all
- Config hot-reload, CLI flags (`--context`, `--namespace`, `--kubeconfig`, `version`, completions), kubectl-presence startup check with graceful error, theme tokens (dark/light)
- `bun build --compile` single-binary packaging per platform; binary smoke test in CI
- Kind smoke suite (`@cluster`) wired as the nightly job

---

## Dependency graph (summary)

```
0.1 → 0.2 → 0.3
       ├→ 1.1 → 1.2 ─────────────┐
       │   1.3 (parallel, pure)  │
       ├→ 2.1 → 2.2 → 2.3 → 3.1 ─┼→ 3.2, 3.3, 4.1, 4.2
       │                  4.3 ───┤
       │                         └→ 5.1 → 5.2
       │                              └──→ 5.3 → 6.2 → 6.3 → 7.1
       └────────────── 2.2 → 6.1 ────────────────┘
```

Critical path: 0.1 → 0.2 → 1.1 → 2.1/2.2 → 2.3 → 3.1 → 5.1 → 5.3 → 6.2 → 6.3 → 7.1.
Widest parallelism: after 3.1 (chunks 3.2, 3.3, 4.1, 4.2, 4.3 are mutually independent).

---

## Chunk completion contract (every chunk)

1. Feature file(s) written/updated first and initially failing
2. TDD loop with full unit suite + lint after every green step
3. Full Spec 08 gate (steps 1–6) green, coverage at 100/100/100/100
4. No new `eslint-disable`, no coverage-ignore comments (grep gate)
5. Walking skeleton still launches (`p9r` smoke against fake/envtest) from Chunk 2.2 onward
