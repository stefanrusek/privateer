# Privateer — Spec Review & Issue Analysis
**Document:** spec-review-01
**Scope:** Specs 01–07 + design discussion
**Severity levels:** 🔴 Critical (threatens architecture/feasibility) · 🟡 Major (cross-spec contradiction or significant gap) · 🟢 Minor (polish/clarity)

---

## 🔴 Critical Issues

### C1 — Agent model: RESOLVED via Gemma 4 (was: 1B tool-calling risk)

**Original issue:** The spec pinned "Gemma 3 1B" (a training-data artifact — the reviewer's knowledge predated Gemma 4's April 2026 release) and built a 5-round tool-calling loop on it, which a 1B-class model could not reliably execute.

**Resolution (verified against current release info):** Pin **Gemma 4 E2B** — released April 2026, Apache 2.0, with *native function calling, structured JSON output, and a configurable reasoning mode*, explicitly designed for agentic workflows at the edge. ~1.3GB quantized. **E4B** offered as a config-file alternative for machines with more RAM. The 5-round tool loop stands as specced.

**Retained guardrails (now latency-motivated, not reliability-motivated):**
1. **Tier-1 deterministic intent parser** stays — instant handling of high-frequency patterns ("show me pods", "errors in <ns>") beats any inference latency. Model is the fallback, not the front door.
2. 15s timeout and 5-round cap stay — E2B on CPU via ONNX is still a 2B-class model; thinking mode should be **disabled** for navigation intents and enabled only for diagnostic "what's wrong with X" queries.
3. Model id is config-overridable (`agent.model` in config.yaml); pinned default verified at build time against HF Hub ONNX availability.

**Spec updates required:** Spec 01 §3.6 and Spec 07 §10 (model identity, ~1.3GB size), Spec 04 §13 (FirstRunScreen copy: "~1.3GB" and model name), Spec 07 §3.1 (add thinking-mode policy).

---

### C2 — Context window math: RESOLVED via Gemma 4

**Original issue:** The budget (2k system prompt + tool schemas + history + tool results) didn't fit the assumed ~8k window of a Gemma 3 1B-class model.

**Resolution:** Gemma 4 E2B/E4B have **128K context windows** — the budget closes with two orders of magnitude of headroom. The 2k system-prompt discipline and per-tool-result caps are still *good practice* (smaller prompts = faster CPU inference) but no longer correctness requirements. Keep the tool-result truncation (600 tokens) as a latency measure; drop the history reduction (3 turns to the model is fine).

---

### C3 — Lazy watch streams contradict three other features

**Issue:** Spec 01 §3.1 opens watch streams "only when a resource type is first viewed" and closes them after 5 idle minutes. But:
- Spec 02 §3.2: every sidebar leaf shows a **live count badge** for every resource type.
- Spec 06: the Health Dashboard (the **default launch view**) evaluates rules across pods, deployments, secrets, network policies, PVCs, Kafka resources — cluster-wide, immediately.
- Spec 07: the agent's cluster summary and `find_erroring_pods` need cluster-wide pod state regardless of what the user has viewed.

As written, launching p9r to the Health Dashboard with lazy streams means the dashboard has no data.

**Proposed resolution — two-tier stream policy:**
- **Core set (always watched):** Pods, Deployments, StatefulSets, DaemonSets, Nodes, Namespaces, Events(Warning only, see M6), plus detected Kafka CRDs. These power the dashboard, sidebar counts, and agent summary. This is roughly what k9s effectively holds anyway.
- **On-demand set (lazy, idle-closed):** everything else (ConfigMaps, RBAC, storage, generic CRDs…). Their sidebar badges show a count fetched via a cheap periodic LIST (every 60s, metadata-only `limit=1` + `remainingItemCount` trick or full metadata LIST) rather than a watch.
- Strip `managedFields` and last-applied annotations from stored objects to keep the always-watched set memory-light on large clusters.

Update Spec 01 §3.1 and Spec 02 §3.2 accordingly.

---

### C4 — Embedded PTY terminal inside Ink is unproven

**Issue:** Spec 05 §4.3 embeds a full PTY terminal in the detail pane. Ink owns the entire screen and renders via React reconciliation; a remote shell emits raw escape sequences (cursor moves, colors, alternate screens from `vim`/`top`) that must be interpreted by a terminal emulator and re-rendered as Ink output. There is no off-the-shelf Ink terminal-emulator component — this means integrating a headless emulator (e.g. an xterm.js headless core) and writing a renderer, which is a project-sized chunk on its own. Similar concern, smaller scale: Spec 01/02 assume "Ink v5+ mouse support" — Ink has no built-in mouse support; Claude Code implements its own SGR mouse-protocol handling.

**Proposed resolution:**
- **Mouse:** add an explicit Input Layer section to Spec 01: enable SGR mouse mode (`\x1b[?1003h\x1b[?1006h`), parse events from stdin, route through a focus/hit-testing layer. Budget it as real work, not a library flag.
- **Terminal, v1:** implement exec as **suspend-and-handover** — p9r suspends the Ink renderer, hands the raw TTY to the exec WebSocket stream (exactly how k9s does it), and restores the TUI when the shell exits. This is well-trodden and reliable. The "Terminal tab with persistent background sessions" (Spec 05 §4.4) moves to v2, contingent on an embedded emulator.
- This also removes the awkward "Keep running" session-management flow for v1.

---

### C5 — `kafka_consumergroup_lag` does not exist by default

**Issue:** Specs 03/06/07 source consumer lag from the `kafka_consumergroup_lag` Prometheus metric. That metric comes from **Kafka Exporter**, which is: (a) an optional opt-in component in Strimzi (`spec.kafkaExporter` must be set on the Kafka CR), and (b) a separately-deployed exporter for bare Kafka. Prometheus being present does not imply lag metrics exist. The headline Kafka feature would silently show nothing on most clusters.

**Proposed resolution:**
- Add **lag-source detection** to the metrics discovery flow: probe Prometheus for the metric's existence (`/api/v1/series?match[]=kafka_consumergroup_lag`).
- When absent, the Consumer Groups tab shows an actionable empty state: for Strimzi, "Enable Kafka Exporter by adding `spec.kafkaExporter: {}` to your Kafka resource"; for bare Kafka, link to deploying kafka-exporter.
- Add health rule `KFK-013 (info): Kafka detected but no lag metrics exported — consumer lag monitoring unavailable`.
- Similarly, several pod-level chart metrics (restart counts, replica counts) come from **kube-state-metrics**, and CPU/memory come from **cAdvisor** — Spec 06 §4.3 should annotate each chart with its required metric source and degrade per-chart, not all-or-nothing.

---

## 🟡 Major Issues

### M1 — Agent tools leak Secret values

**Issue:** Specs 03/04 carefully redact Secret values in YAML view with a confirm-to-reveal flow. Spec 07's `get_resource` returns `spec` two levels deep with no redaction — asking the agent about a Secret (or a DopplerSecret's managed Secret) would print decoded/encoded secret data into the AgentTab.

**Resolution:** The `AgentToolDispatcher` redacts at the dispatcher boundary: any `Secret` kind has `data`/`stringData` values replaced with `[redacted]` unconditionally — no reveal path through the agent, ever. Add this as a stated invariant in Spec 07 §5.

### M2 — `Space` keybinding conflict

**Issue:** Spec 02 §5 assigns `Space` to multi-select row toggle in the list; §8.2 assigns `Space` globally to focus the agent command bar. Both fire when the list is focused.

**Resolution:** Multi-select is explicitly a v2 feature — remove it from §5 entirely and reserve `v` (visual-select, vim-adjacent) for v2 multi-select. `Space` stays agent-focus, which is the marquee interaction and deserves the best key.

### M3 — Agent answers when the detail pane is hidden

**Issue:** Spec 04: detail pane is hidden until a resource is selected. Spec 07: agent answers render in the AgentTab. On first launch (Health Dashboard, nothing selected), an `answer` action has nowhere visible to go.

**Resolution:** An `answer` (or `unknown`) action auto-opens the detail pane with the Agent tab active, regardless of selection state. Closing it returns to hidden. Add to Spec 07 §6 and Spec 04 §4.

### M4 — `SEC-005` will false-positive on virtually every cluster

**Issue:** "Plain k8s Secret with data" flags ServiceAccount tokens, `helm.sh/release.v1` storage secrets, cert-manager TLS secrets, image pull secrets — none of which Doppler should manage.

**Resolution:** Scope the rule to `type: Opaque` secrets only, exclude secrets with `ownerReferences` (operator-managed), exclude well-known types (`kubernetes.io/*`, `helm.sh/*`), and exclude secrets that *are* the DopplerSecret-managed output. Re-state the rule as: "Opaque Secret with no managing operator detected."

### M5 — Quit with active sessions has no guard

**Issue:** `q` / `!q` / `Ctrl+C` quit immediately. Spec 05 establishes long-lived state: active port-forwards and (in v2) exec sessions. Accidental `q` kills your database tunnel mid-debug.

**Resolution:** If any forwards/sessions are active, `q` and `!q` show the inline confirm: `2 port-forwards active. Quit anyway? [Quit] [Cancel]`. `Ctrl+C` remains immediate (escape hatch, per Spec 02 "always, any mode"). Add to Spec 05 §5.7.

### M6 — Events sourcing is unspecified and expensive if watched

**Issue:** EventsTab (Spec 04), Health Dashboard, and `get_events` (Spec 07) all consume Events, but no spec says how Events are obtained. Watching all Events cluster-wide is the noisiest stream in k8s.

**Resolution:** Two paths: (a) EventsTab and `get_events` do **on-demand LIST** with a field selector (`involvedObject.name=…`) — fresh, cheap, no stream; (b) the always-watched core set (C3) includes a single cluster-wide watch on **Warning events only** (`fieldSelector=type=Warning`) to power dashboard counts and pod triage. Document in Spec 01 §3.1.

### M7 — Bare-Kafka health rules overstate what's checkable

**Issue:** Spec 06 §7.2 says rules KFK-001…010 "still apply" to bare Kafka. Without Strimzi, topics aren't k8s resources — `KFK-001/002/003/005/008/009` need either the Kafka Admin API (deferred to v2 with message viewing) or kafka-exporter metrics (which only cover replication counts and lag, not `min.insync.replicas`, retention, or ACLs).

**Resolution:** Add a per-rule applicability column to §6.5: Strimzi-only (`003, 005, 008, 012`), metrics-dependent (`001, 002, 004, 006, 009` via kafka-exporter series like `kafka_topic_partition_replicas`), pod-inspection (`007, 010, 011`). Bare clusters without kafka-exporter get only the pod-inspection rules plus the new KFK-013 prompt from C5.

### M8 — metrics-server fallback is needlessly chartless

**Issue:** Spec 06 §2.3 disables sparklines under metrics-server because there's "no history" — but p9r is already polling every 30s. It can accumulate its own rolling window.

**Resolution:** Under metrics-server, p9r buffers the last 10–40 samples per visible pod/node in memory and renders sparklines (and a session-bounded 20m chart) from its own buffer, clearly labeled "session data". Full historical ranges (1h+) remain Prometheus-only. This makes the zero-config experience dramatically better.

---

## 🟢 Minor Issues

| # | Issue | Resolution |
|---|---|---|
| N1 | Spec 02 §6.3 says Ctrl+S "calls `kubectl apply` equivalent"; Spec 04 decided `replace` (PUT). | Fix Spec 02 wording to "replace (PUT) via k8s API". |
| N2 | Spec 04 §7: replace-on-stale-`resourceVersion` returns 409 Conflict; the error string is specced but not the recovery flow. | Add: on 409, offer `[Reload & re-edit]` which re-fetches, re-opens editor with user's changes preserved in a diff-merge view (v1: re-fetch + show user's text alongside; full 3-way merge v2). |
| N3 | "3/4h" in discussion was specced as `4h`. | Confirm 4h is right (vs 3h). One-line change either way. |
| N4 | Agent system prompt caps answers at "max 3 sentences" but the AgentTab example shows multi-bullet answers. | Relax to "max ~80 words, bullets allowed" and update the prompt. |
| N5 | Spec 03 KafkaTopic says "lag per partition" in the table; the mock shows totals only. | Per-group totals in the table; per-partition is an expandable row (click/Enter on a group). |
| N6 | `gg` (Spec 02) requires multi-key sequence handling — the only chord in the bindings. | Keep, but note in Spec 02 that the input layer needs a 500ms key-sequence buffer; or simplify to `Home`/`End` + `g`. |
| N7 | Pod "Restart count over time" chart (Spec 06 §4.3) requires kube-state-metrics. | Covered by C5's per-chart source annotations. |
| N8 | Health Dashboard mock shows `✓ OK  All secrets managed by Doppler` — implies SEC-005 runs even when fine; after M4 rescoping, label becomes "All Opaque secrets operator-managed". | Cosmetic; update mock when amending Spec 06. |
| N9 | `--no-agent` leaves `Space` dead (Spec 07 §10.4). | Make `Space` open command-only input (`!`-implied) in no-agent mode — one less dead key. |
| N10 | Sidebar count badges "reflect current namespace filter" (Spec 02) but on-demand kinds now use periodic LISTs (C3) — namespace-filtered counts for unwatched kinds would need per-namespace LISTs. | Badge shows cluster-wide count for on-demand kinds (dimmed), exact filtered count for core watched kinds. Note in Spec 02. |
| N11 | Prometheus port-forward tunnel (Spec 06 §2.2) is a "system forward" — its failure mode isn't specced. | If the tunnel dies, metrics degrade to metrics-server/none with the standard degraded indicator; auto-retry with backoff alongside watch-stream policy. |
| N12 | Spec 01 still lists `ansi-escapes` as sufficient for "terminal control (cursor, mouse)" — understates C4's input layer. | Update dependency note when amending Spec 01. |

---

## Process observations from the discussion

1. **One ambiguous answer got locked in silently:** when I asked about Events filtering ("Warnings by default with a toggle?") you answered "Yes" — that was a compound question and the spec recorded both halves. Same pattern with "Yes, and it should have a best practices to-do list" (the "Yes" bound to metrics-server fallback). Both readings look correct in context, but flagging since single-word answers to compound questions are where spec drift starts.
2. **The Gemma version discrepancy (Gemma 4 in discussion → Gemma 3 1B in spec)** went unflagged at the time — captured above in C1.
3. **Spec 02's multi-select line** was written before the agent pivot made `Space` the agent key — the conflict (M2) is a artifact of the command bar redesign mid-stream. Worth a final consistency pass over Spec 02 after amendments since it changed twice.

---

## Recommended amendment order

1. **C1/C2 (model swap to Gemma 4 E2B)** — now a light edit: Spec 01 §3.6, Spec 04 §13, Spec 07 §3.1/§10. Add Tier-1 intent parser section to Spec 07.
2. **C3 (stream policy) + M6 (events)** — Spec 01 §3.1 rewrite, Spec 02 badge note.
3. **C4 (input layer + exec handover)** — Spec 01 new section, Spec 05 §4 rewrite.
4. **C5 + M7 + M8 (metrics sourcing)** — Spec 06 amendments.
5. **M1–M5, minors** — small targeted edits across specs.

After amendments, the spec set is genuinely implementation-ready. The core architecture (single process, State Store, status resolvers, rule engine, agent tool loop) survives review intact — with Gemma 4 verified, the remaining issues are concentrated in k8s-side feasibility assumptions (stream policy, Ink mouse/PTY, default Kafka metrics) rather than the agent design.
