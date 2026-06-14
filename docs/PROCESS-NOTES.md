# Process notes — non-obvious techniques from the build

A catalog of *working techniques* used to build p9r that are worth keeping —
the kind of move that isn't the default for a coding agent. This is about
**how** the work was done, not what was built. Mined from the session
transcripts. Use it as a playbook when the obvious approach stalls.

The throughline: **don't trust — reproduce, measure, and verify against
ground truth.** Self-reports, library event APIs, spec claims, "it compiled,"
and even your own memory all get independently checked.

---

## 1. Verify by reconstruction; inspect opaque things directly

Don't trust a tool's summary of an artifact — rebuild it, or read its bytes.

- **Reproduce the artifact to validate the pipeline.** Before documenting the
  demo-media pipeline, the exact commands were re-extracted from the session
  JSONL and re-run into `/tmp`, confirming they regenerate a matching
  1500×1000 / ~3.3 MB / 651-subframe APNG — rather than reconstructing the
  recipe from memory.
- **Parse the binary format by hand when the tool's view is ambiguous.** The
  APNG's real structure was recovered by walking PNG chunks in Python
  (`struct.unpack('>IIIIIHHBB', fcTL_body)`, reading `acTL` num_frames) to
  learn it's 7 key-frames padded into 651 sub-frames — not guessing from file
  size.
- **Find dead code from the machine-readable report, not the human one.** To
  locate functions blocking 100% coverage, parse `coverage-final.json`'s
  `fnMap`/`f` hit maps directly (`for k,fn in fnMap: if f[k]==0: ...`) instead
  of grep/awk-fighting the printed coverage table.
- **The transcript/log is a source of truth.** When asked "how did you do X,"
  the answer was mined from the JSONL of the session that did it, not
  recalled. Logs and caches outrank memory.

## 2. Test the *actual shipped thing* on the *actual target*

"It compiled" and "the tests pass" are not "it works."

- **Run the foreign-arch binary in a container.** A linux-arm64 cross-build was
  run inside `ubuntu:24.04` via Docker to confirm the embedded onnxruntime
  `.so` actually `dlopen`s on Linux before trusting the release.
- **Smoke-test the *published* release asset, end-to-end.** After a release,
  download the GitHub artifact, untar, and run `./p9r-... version`. This is how
  the version-mislabel was caught: the binary still reported the old version
  because the version string lived in a *second* hardcoded spot
  (`src/version.ts`), not just `package.json`.
- **Assume downloaded executables may be quarantined.** Freshly-fetched
  etcd/kube-apiserver binaries were run with `--version` specifically to
  confirm macOS Gatekeeper hadn't quarantined them, before building anything
  that assumed they ran.

## 3. Root-cause to system signals — and go outside the repo to fix it

When code looks correct but behavior is wrong, suspect the environment.

- **A "connection bug" was memory starvation.** Watch streams in the compiled
  binary silently never connected. The cause: loading the ~2 GB ONNX model
  concurrently with the initial watches permanently starved them. Diagnosis
  went *into the Docker VM* (`docker exec ... uptime; free -m; ps --sort=-%cpu`)
  and the fix was outside the repo entirely — bump the Docker Desktop VM from
  1 GB (patch the host settings file, bounce the app) **and** delay the model
  preload until streams are established.
- **Discriminate hypotheses with a sequenced experiment, not a log line.** To
  prove it was contention (not auth/TLS), a probe fired a k8s LIST *before*
  loading the model, loaded the model, then issued a request *after*, each
  wrapped in `Promise.race([req, timeout(5s,'TIMEOUT')])` to see exactly which
  one hangs.
- **Race a control loop you can't pause.** Three Kafka JVMs thrashed a 2.5 GB
  VM into apiserver meltdown; the kubelet kept *resurrecting* them faster than
  they could be deleted. Fix: `kill -9` the JVM PIDs and fire `kubectl delete`
  in the brief boot window, in a retry loop — then strip Strimzi finalizers so
  the namespace could terminate once its operator was gone. The lesson was then
  encoded as a pre-flight VM-memory warning in the fixture script.

## 4. When a library misbehaves, prove it's the broken layer, then go under it

Don't assume your code is wrong because the library's API is "official."

- **Peel the onion, then bypass.** Drag-to-resize failed. The layers were
  ruled out one at a time: splitter not rendering (a silent edit miss) →
  renders but no movement (instrument `[drag]`, see zero events) → own listener
  is registered but ink-mouse's `drag` event never fires → instrument *raw
  stdin* and confirm the SGR bytes *are* arriving. Conclusion: ink-mouse's drag
  path is broken, so drags are parsed straight off `process.stdin`
  (`\[<32;(\d+);(\d+)M`) using geometry we already own.
- **The k8s SDK silently drops TLS under Bun.** `@kubernetes/client-node`'s
  Watch/Log APIs discard the kubeconfig TLS/auth under Bun — LIST works, watch
  just yields nothing. Verified empirically with a watch probe, then rewritten
  to stream over raw `node:https` reusing the working auth path.
- **Lie to the runtime to flip a detection branch.** `@huggingface/transformers`
  picks its ONNX backend by runtime detection and chose a broken path under
  Bun. After reading the library's `env.js` to find the discriminator,
  `process.release` was redefined to claim `name: 'node'` so it loaded the
  native onnxruntime-node backend.

## 5. Isolate the risky unknown in a throwaway harness

Get the fastest possible feedback on the one thing you're unsure of,
decoupled from the rest of the app.

- **Prove the recipe before building the durable thing.** Before writing the
  envtest TypeScript harness, a disposable `/tmp/envtest-smoke.sh` booted
  etcd + kube-apiserver with the full flag/cert recipe (~3 s feedback). Only
  after it printed `SMOKE_OK` was the real harness written — and openssl was
  swapped for `node:crypto` so the production harness had no openssl dep. (A
  Go-flag gotcha surfaced here too: `--anonymous-auth` needs `=true`; the
  space-separated form makes `true` a positional arg.)
- **Probe the model's raw token stream offline.** When tool-calling broke,
  instead of re-running the slow TUI (~30–120 s/round) and guessing, a
  standalone `probe-toolcall.ts` loaded the same tokenizer/model/template and
  dumped output decoded **both** ways — `skip_special_tokens: false` and
  `true` — revealing the truncation was at the tag, not the token budget.
- **Treat a spec's model choice as an empirical search.** The spec's
  "Gemma 4 E2B" doesn't exist publicly. A parameterized bench
  (`PROBE_MODEL/PROBE_DEVICE/PROBE_DTYPE`) swept real models across
  cpu/webgpu/coreml × q4/q4f16, measuring load time, tok/s, and RSS —
  concluding WebGPU q4f16 ≈ 6 tok/s, others 10–100× slower.

## 6. Black-box drive an interactive TUI

Unit tests feed one clean char at a time; real terminals don't. Drive the
actual TTY.

- **tmux as a robot.** Spawn detached at a fixed size
  (`tmux new-session -d -s p9r -x 170 -y 50 '...'`), `send-keys` to navigate
  (including `Left`/`Enter` to pick a dialog button), `capture-pane -e -p` to
  scrape, and `sed 's/\x1b\[[0-9;]*m//g'` / `tr -d '\000-\010...'` to read it
  clean. Keep the pane alive past app-exit with a trailing
  `; echo APP-EXITED; sleep 600` so it stays inspectable, and verify side
  effects against the cluster (`kubectl get pod ...` before/after a delete).
- **Synthesize mouse events by hand.** Mouse behaviors were tested by injecting
  raw SGR reports: press `\e[<0;5;10M` + release `\e[<0;5;10m`, wheel
  `\e[<65;60;5M`, drag `\e[<32;x;yM` — even pixel-hunting an off-by-one in
  tab-bar hit-testing by clicking x=67 then x=69.
- **Real terminals batch input.** Typing "pods" did nothing because tmux/Ink
  deliver multi-char input as one chunk while text handlers only accepted
  `length === 1`. The fix re-dispatches each char, guarded so it doesn't break
  paste/control keys (`if (input.length > 1 && !key.ctrl && !key.meta && !key.return)`).
  Also: `send-keys Space`, never `' '` (the space arg gets swallowed).
- **Poll-until-predicate beats fixed sleeps.** Flaky `tick()` races under load
  were replaced with `pressUntil`/`waitForModes` helpers — and the flake was
  first *reproduced* by running a single test twice before fixing it.

## 7. Make edits and decisions fail loudly, and adapt to measurement

- **Assert before you string-replace.** Edits applied via
  `python3 ... s.replace(old,new)` silently no-op when the anchor drifts (and
  still typecheck green). After that bit once, replaces were prefixed with
  `assert old in s` (or `s.index(...)`, which throws) so a missed match fails
  immediately instead of much later.
- **Gate features on a runtime measurement, not a static flag.** Local-LLM
  tool-calling enables itself only if a two-round exchange plausibly fits the
  timeout: `toolsEnabled = modelSupportsTools(id) && warmupMs * 20 < timeoutMs`.
  The same binary turns tools on for capable hardware and off for an 8 GB
  laptop automatically.
- **Calibrate to a flaky component by observation.** Small models wrap their
  JSON action in markdown fences and drift on tool-call syntax; a
  `stripCodeFence` pre-pass and deliberately tolerant extraction were added
  *after watching the live output*, not assumed in advance.
- **Encode a diagnosis as a pinned fixture.** metrics-server can't scrape on
  kind/docker-desktop because the kubelet serving certs have no IP SANs
  (confirmed with an in-cluster `curl -sk https://NODE:10250/healthz` probe).
  Rather than patch live, `--kubelet-insecure-tls` was baked into a pinned,
  header-commented fixture so the fix is reproducible.

## 8. Multi-agent orchestration: trust nothing, contain everything

From the overnight fan-out build (worktree-isolated subagents under a strict
gate). The discipline is integration *safety*, not just parallelism.

- **The gate is the arbiter.** Subagent self-reports were treated as untrusted
  telemetry (suspicious `tool_uses: 1`, a missing branch) and re-verified by
  re-running the whole-repo gate on the integration branch. This caught a
  drifted worktree, an agent that under-listed its catalog, and a flaky
  cross-chunk test before any reached the tree.
- **Integrate by path-scoped cherry-pick, not `git merge`.** Only the
  explicitly enumerated deliverable paths were checked out from each branch
  onto a correctly-configured integration branch. This structurally prevented
  inheriting one agent's config drift (it had *deleted* `.prettierrc.json`,
  `ci.yml`, and the specs). Layered with collision detection
  (`git diff --name-only ... | sort | uniq -d`) and an additions-only audit
  before picking.
- **Recover lost work via arithmetic.** When a chunk's branch came up empty,
  the union *test count* (`2340 = base + chunk-5.3 only`) revealed which
  chunk's files were missing before even looking at disk — the real work was
  stranded on an unrenamed `worktree-agent-...` branch and extracted by name.
- **Deconflict shared components before spawning.** The one shared component
  was assigned a single owner up front and other agents told to build their own
  variant, so parallel branches couldn't collide on it.
- **Shell-correctness matters in glue.** A path-list cherry-pick silently
  collapsed to one pathspec because zsh doesn't word-split unquoted variables;
  fixed by piping through `xargs`. A wrong shell assumption silently no-ops.

## 9. Build-order design — decomposition that made the build possible

The build was driven by [`spec/build-order-01.md`](../spec/build-order-01.md),
which sequences Specs 01–08 into 22 independently-buildable chunks. The plan
itself contains the smartest moves of the whole project — the execution
techniques above only worked because the work was carved up this way.

- **Bootstrap the enforcer before anything it enforces.** Chunk 0.1 stands up
  the *entire* Spec 08 gate (strict tsc, ESLint flat config, grep gates for
  ignore/disable comments, Vitest at 100% thresholds, Cucumber) on a
  hello-world app — *before* the first feature. The stated reason: "the gate
  must exist before the first feature chunk, or nothing enforces it." Quality
  is guaranteed from line one instead of retrofitted.
- **Boundaries + fakes before consumers; real adapters lag.** Chunk 0.2 lands
  all eight boundary interfaces and a scripted fake for each, so the whole app
  can be built and 100%-tested against fakes long before any real cluster,
  model, or subprocess exists. Production adapters (the coverage-excluded glue)
  come later. And the fakes are themselves unit-tested — "fakes are code;
  they're covered too."
- **Decouple the uncertain, heavyweight dependency from the feature.** The
  agent was planned so that download UX, the tool dispatcher, the prompt
  builder, and the AgentTab are all built and tested on a `FixtureEngine`
  (Chunk 6.2) *before* the real `@huggingface/transformers` adapter (6.3) — and
  the fast-path command bar (6.1) "is fully useful before any model exists."
  This is precisely why discovering mid-build that the spec's "Gemma 4 E2B"
  model doesn't exist did **not** block the agent feature: the model was
  isolated to the last, swappable chunk.
- **Pure cores early as the cheapest 100%-coverage wins.** Status resolvers,
  the rule engine, and parsers (Chunks 1.3, 5.3, 6.1) are pure and
  table-driven — "the cheapest 100%-coverage wins" — and they unblock
  everything layered above them. Front-load the high-ROI, fully-coverable work.
- **A runnable artifact as early as possible.** A walking skeleton launches by
  Chunk 2.2, and the chunk-completion contract requires it keeps launching from
  then on, "so every later chunk is verifiable in a real terminal, not just in
  tests." Integration is continuous, not deferred to the end.
- **A uniform chunk contract is what makes fan-out possible.** Every chunk is
  "independently implementable and testable, completed only when the full
  Spec 08 gate is green," with the same five-point definition of done
  (feature-file-first, TDD loop, gate green, no new ignore comments, skeleton
  still launches). Identical, self-verifying units with explicit dependencies
  are exactly what let the build be handed to worktree-isolated subagents in
  parallel (see §8).
- **Compute the critical path and the parallelism frontier up front.** The plan
  ships a dependency graph, names the critical path
  (`0.1 → 0.2 → 1.1 → 2.1/2.2 → 2.3 → 3.1 → 5.1 → 5.3 → 6.2 → 6.3 → 7.1`), and
  the widest parallelism point ("after 3.1, chunks 3.2/3.3/4.1/4.2/4.3 are
  mutually independent"). That's scheduler input for an unattended pipeline,
  not prose.
- **Place real-cluster tests surgically.** `@envtest` (real apiserver) is
  reserved for the handful of behaviors fakes genuinely can't reproduce — watch
  resumption via resourceVersion, 403 via impersonation, the 409
  reload-and-re-edit conflict — while all *logic* is tested against fakes. The
  irreducibly flaky real paths (exec WebSocket, kind `@cluster` smoke) are
  marked **non-gating**. Determinism where possible, reality only where
  necessary.
- **Spot infrastructure reuse in the dependency graph.** Metrics discovery
  (5.1) depends on the port-forward manager (4.3) because "the system tunnel
  reuses forward machinery" — one subprocess-lifecycle path serves two
  features, caught at planning time rather than rebuilt.
- **Name the one invariant that must never break.** The plan singles out the
  secret-redaction invariant for *adversarial* fixtures in the agent
  tool-dispatch chunk (6.2), elevating the security-critical property above
  ordinary coverage.
- **Make time injectable everywhere it matters.** Idle-stream close, row
  animations, round caps, and download progress are all planned against a fake
  `Clock` — the same discipline the spec enforces by banning `Date.now()` —
  so time-dependent behavior is deterministically testable.

---

*Caveat on provenance:* these were distilled from session transcripts; some
thinking blocks weren't recorded, so evidence is drawn from the commands and
text that were. Where a technique encodes a fact about this environment (VM
sizes, model IDs, library versions), re-confirm it still holds before relying
on it — see [CLAUDE.md](../CLAUDE.md) for the current ground truth.
