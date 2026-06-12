<div align="center">

```
██████╗   █████╗  ██████╗
██╔══██╗ ██╔══██╗ ██╔══██╗
██████╔╝ ╚██████║ ██████╔╝
██╔═══╝   ╚═══██║ ██╔══██╗
██║       █████╔╝ ██║  ██║
╚═╝       ╚════╝  ╚═╝  ╚═╝
```

**P R I V A T E E R** · *the agentic Kubernetes TUI*

A single-binary Kubernetes terminal UI with a fully local LLM agent —
ask your cluster questions in plain language, nothing leaves your machine.

![p9r demo](docs/demo.png)

</div>

---

## Features

- **Live everything** — watch-stream driven resource tables, badges, and a
  cluster health dashboard that lands you on what's wrong first.
- **A local agent in the command bar** — press `Space` and type
  `crashing pods` or `why is order-api failing?`. Instant deterministic
  navigation for common phrases; a local ONNX model (Gemma 3n E2B or
  Qwen3 0.6B — your choice on first run) answers diagnostic questions.
  No API keys, no network calls, ever.
- **Best-practices engine** — 35 rules (resources, reliability, security,
  networking, storage, Kafka, observability) evaluated live against the
  cluster, with rule suppression via annotations.
- **Metrics that degrade gracefully** — Prometheus (auto-discovered
  in-cluster and reached through a managed port-forward tunnel) gives full
  ASCII time-series charts; plain metrics-server gives session sparklines;
  neither installed simply hides the columns.
- **First-class Kafka** — Strimzi CRD detection, broker/topic views,
  consumer-lag charts, and Kafka-specific health rules.
- **The actions you actually use** — log tailing (search, timestamps,
  previous instance, download), `exec` into containers with a real PTY,
  managed port-forwards with a quit guard, delete with confirm, and a full
  YAML editor with diff-before-apply.
- **Mouse + keyboard** — click rows, tabs, and the sidebar; scroll with the
  wheel; or never leave the home row (vim-style keys throughout).
- **One binary** — `bun build --compile` output with the ONNX runtime
  embedded. Layout, collapsed sections, and your per-kind tab choices
  persist between runs.

## Install

Requires `kubectl` on your PATH and a kubeconfig pointing at a cluster.

```sh
# from source (requires bun >= 1.3)
git clone <repo-url> && cd p9r
bun install
bun run build          # produces dist/p9r (single binary, ~100MB)
./dist/p9r
```

Or run straight from the checkout during development:

```sh
bun run start
```

On first launch p9r asks which agent model to use — **Gemma 3n E2B**
(best answers, ~3GB) or **Qwen3 0.6B** (small and fast, ~550MB) — and
downloads it once to `~/.config/p9r/models/`. Pick **No agent** to skip
the download entirely; navigation and `!commands` still work.

## Quick start

| Key | Action |
| --- | --- |
| `Space` | Ask the agent anything (`crashing pods`, `how many pods are running?`) |
| `!` | Commands: `!ns demo`, `!ctx`, `!pods`, `!q` |
| `/` | Filter the resource list |
| `n` | Namespace picker |
| `Enter` | Open the detail pane (Overview · YAML · Events · Logs · Metrics · Agent) |
| `l` / `x` / `p` / `d` | Logs / exec / port-forward / delete the selected pod |
| `F` | Port-forward manager |
| `e` | Edit YAML (diff before apply) |
| `[` `]` | Cycle metrics time range |
| `?` | Full keybinding reference |

## Configuration

`~/.config/p9r/config.yaml` (hot-reloaded while running):

```yaml
agent:
  model: onnx-community/gemma-3n-E2B-it-ONNX   # or any transformers.js ONNX id
  timeoutSeconds: 15                            # raise on slower machines
  # enabled: false                              # turn the agent off

prometheus:
  url: http://localhost:9090                    # skip auto-discovery
```

Choosing a model by machine: Gemma 3n E2B is the default and the right
pick at 16GB+ of RAM. On small machines (8GB laptops) choose Qwen3 0.6B —
it runs on the GPU via WebGPU and answers in well under a minute, while
Gemma on constrained hardware can take several minutes per answer. The
agent's tool-calling enables itself automatically when the measured model
speed fits your timeout budget.

## Test cluster fixtures

A reproducible playground (used by p9r's own verification):

```sh
bun run fixtures:up          # demo workloads + metrics-server + Prometheus
bun run fixtures:up kafka    # + single-node Strimzi Kafka (needs ~4GB Docker VM)
bun run fixtures:down
```

This gives you healthy deployments, a CrashLoopBackOff pod for the health
rules to find, Prometheus + kube-state-metrics scraping the exporters the
charts use, and (opt-in) a KRaft Kafka with a topic and kafka-exporter.

## Development

```sh
bun run gate          # format check · lint · grep-gate · typecheck ·
                      # unit tests (100% coverage enforced) · BDD
bun run test:envtest  # integration tests against a real kube-apiserver
```

The architecture is spec-driven: see `spec/` for the eight specification
documents this implementation follows, including the quality bar
(spec 08: 100% line/branch/function/statement coverage on all
non-adapter code, no coverage exemptions).

## License

TBD.
