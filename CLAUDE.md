# p9r (Privateer)

A single-binary Kubernetes TUI — Bun · Ink 5 · React 18 · local LLM agent.
The files in `spec/` together form the specification; when behavior is in
question, the spec wins.

## Commands

```sh
bun run gate          # THE quality gate: format:check, lint, lint:grep, typecheck, test, bdd
bun run start         # run the TUI (needs a kube context; docker-desktop in dev)
bun run test          # vitest with coverage (see bar below)
bun run bdd           # cucumber BDD suite (~500 scenarios)
bun run build         # single binary for the host → dist/p9r
bun run build:all     # cross-compile every release target (scripts/build.ts)
bun run fixtures:up   # apply fixtures/ to the current cluster (add `kafka` for Strimzi; needs ≥4GB Docker VM)
```

Every change must pass `bun run gate` before it is done. Pieces of the bar:

- **Coverage is 100/100/100/100** (lines/branches/functions/statements) on
  `src/**` — `src/adapters/**` is structurally excluded (boundary glue over
  real SDKs, exercised by `test:envtest` and BDD instead). Coverage-ignore
  comments are forbidden by the grep gate. New logic goes in a pure, covered
  module; only thin wiring goes in `src/adapters/`.
- eslint runs with `--max-warnings 0`; tsc is strict with
  `exactOptionalPropertyTypes` (optional props need `?:` handling, not
  `| undefined` assignment).
- `scripts/grep-gate.sh` bans assorted escape hatches; read it before
  reaching for one.

## Architecture

- Pure, fully-covered modules (`src/k8s`, `src/store`, `src/ui`, `src/exec`,
  …) hold all logic behind interfaces; `src/adapters/` binds them to the real
  world (kube client, inference engine, fs, process).
- `src/adapters/live/controller.ts` is the composition root: it owns
  StreamManager → StateStore → table models → keyboard/mouse routing and
  exposes a snapshot via `useSyncExternalStore`; `LiveApp.tsx` renders it
  with prop-driven components.
- Persistent user state lives in `~/.config/p9r/` (config.yaml, layout.json,
  exec history, downloaded models, debug.log).

## Releases

The version lives in **three places** and all must be bumped together:
`package.json`, `src/version.ts` (what `p9r version` actually prints —
forgetting it shipped a mislabeled binary once), and the BDD feature files
`features/00-scaffold/version.feature` and `features/01-architecture/cli.feature`
(both assert the exact version string; missing them breaks the gate).

1. Bump all three, run `bun run gate` to confirm, commit, push to main.
2. `git tag vX.Y.Z && git push origin vX.Y.Z` — the tag triggers
   `.github/workflows/release.yml`, which cross-compiles all targets from one
   Linux host (`onnxruntime-node` ships every platform's natives;
   `scripts/build.ts` generates a per-target entry embedding the right shared
   lib) and publishes the GitHub release.
3. Verify: download an artifact and check `p9r version` reports the new
   version.

If a release went out wrong: `gh release delete vX.Y.Z --yes`, delete and
re-push the tag at the fixed commit.

## Bun/runtime gotchas (hard-won — do not relearn)

- `@kubernetes/client-node`'s Watch/Log/fetch-based APIs **drop the TLS agent
  under Bun** ("unable to verify the first certificate"). All cluster I/O
  goes through raw `node:https` via `buildKubeRequestOptions()` in
  `src/adapters/kube-client.adapter.ts`. Don't reintroduce SDK calls that use
  fetch.
- `sharp` is stubbed (`file:./stubs/sharp`, both in dependencies and
  overrides — both are required) because transformers imports it statically
  and text-only inference never calls it.
- Local models have per-model profiles in
  `src/adapters/inference-engine.adapter.ts` (Gemma: cpu, no tools — its
  graph crashes Bun's WebGPU EP with an uncatchable C++ exception; Qwen:
  webgpu + tools). Small models drift on tool-call syntax; extraction is
  deliberately tolerant.
- Mouse: ink-mouse's drag event is broken — drags are parsed straight off
  `process.stdin` in MouseRouter. Mode 1003h (any-motion) must stay
  suppressed and all mouse modes hard-disabled on quit/suspend/exit, or
  escape sequences leak into the user's shell.
- Terminals deliver rapid keys as one chunk ("jj"); the controller splits
  multi-char input — keep it that way.
- Diagnostics go to `~/.config/p9r/debug.log` via `src/adapters/logger.ts`
  (pino, sync destination — Bun can't use worker transports). Never write to
  stdout/stderr; they belong to Ink. `P9R_DEBUG=1` enables debug level.

## Claude Code cloud sessions

The web sandbox has no cluster by default — run
`bash scripts/claude-cluster-up.sh` to bring up a local kind cluster (it
works around the sandbox's cgroup v1 host, denied negative oom_score_adj,
blocked Docker Hub CDN, and TLS-intercepting proxy); after that
`bun run fixtures:up` and `bun run start` work normally.
`scripts/claude-env-setup.sh` is the environment Setup script: it installs
kubectl/kind and pre-pulls the node image into the environment cache.
The default network allowlist blocks registry.k8s.io, so the metrics-server
and kube-state-metrics fixtures need `registry.k8s.io` and `*.pkg.dev`
added as custom allowed domains in the environment settings.

## Testing the TUI

Drive it under tmux: `tmux new-session -d -s p9r -x 170 -y 50 'bun run start'`,
then `send-keys` / `capture-pane -p`. Use the key name `Space` (not `' '`);
inject SGR mouse with `send-keys -l $'\e[<0;x;yM'`. Stdin tests use
`test/ink-stdin.ts` `safeWrite` (waits for Ink's readable listener) — writing
directly causes chronic flakes. BDD can flake under heavy host CPU load.

## Working on this codebase

[docs/PROCESS-NOTES.md](docs/PROCESS-NOTES.md) catalogs the non-obvious
techniques that made this build work — verify-by-reconstruction, root-causing
to system/VM signals, bypassing misbehaving libraries at a lower level,
black-box driving the TUI under tmux, and the multi-agent integration-safety
discipline. Worth a read before the obvious approach stalls.

The `fable-planner` skill (`.claude/skills/fable-planner/`) turns those notes
into an actionable playbook for planning decompositions and implementing/
debugging rigorously — invoke it (or let it auto-trigger) when carving work
into a build order, building against the strict gate, or when a fix "should
work" but doesn't. It complements `spec-driven-development` (which owns the
spec→plan→build gates).

## README media

The README's animated demo and the GitHub social card are regenerated from
the committed terminal captures in `docs/frames/*.ansi`. The full
pipeline — capturing screens under tmux, rendering with `freeze`, and
assembling the APNG / social card with ImageMagick — is documented step by
step with the exact commands in [docs/MEDIA.md](docs/MEDIA.md).
