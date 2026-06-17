# Privateer — Architecture Spec
**Spec:** 01-architecture  
**Status:** Draft  
**Binary:** `p9r`  
**Stack:** Bun · Ink (React TUI) · @kubernetes/client-node · Prometheus HTTP API · @huggingface/transformers

---

## 1. Goals

- Single binary TUI that replaces Lens and k9s
- Real-time resource state via Kubernetes watch streams
- Auto-discovered Prometheus metrics surfaced inline with resources
- Keyboard-first with full mouse support
- Local LLM agent in the command bar for natural language navigation and cluster queries
- Zero runtime dependencies beyond a valid kubeconfig and kubectl

---

## 2. Process Model

Privateer runs as a **single Bun process**. There is no separate backend daemon.

```
┌─────────────────────────────────────────────────────────────┐
│                       p9r process                           │
│                                                             │
│  ┌─────────────┐   ┌──────────────┐   ┌──────────────────┐ │
│  │  Ink UI     │   │ State Store  │   │  K8s Client      │ │
│  │  (React)    │◄──│ (in-memory)  │◄──│  Watch Streams   │ │
│  │             │   │              │   └──────────────────┘ │
│  │  Mouse +    │   │  Watch       │                        │
│  │  Keyboard   │   │  Aggregator  │   ┌──────────────────┐ │
│  │             │   │              │◄──│  Prometheus      │ │
│  │  Command    │   └──────┬───────┘   │  Client          │ │
│  │  Bar        │          │           └──────────────────┘ │
│  │  (Agent)    │◄─────────┤                                │
│  └─────────────┘          │           ┌──────────────────┐ │
│                    ┌──────▼───────┐   │  Agent Layer     │ │
│                    │  Agent Layer │   │  @hf/transformers│ │
│                    │  (Gemma 4 E2B)│   │  ONNX runtime    │ │
│                    │  State query │   │  ~/.config/p9r/  │ │
│                    │  UI dispatch │   │  models/         │ │
│                    └──────────────┘   └──────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**Rationale:** A single-process model avoids IPC complexity, keeps state coherent, and matches how k9s and Claude Code work. Bun's event loop handles concurrent watch streams without threads.

---

## 3. Layer Definitions

### 3.1 K8s Client Layer

**Library:** `@kubernetes/client-node`

Responsibilities:
- Load and parse kubeconfig from `~/.kube/config` (or `KUBECONFIG` env)
- Support multiple contexts; active context is switchable at runtime
- Expose typed API clients per resource group (core, apps, batch, networking, rbac, etc.)
- Open and manage `Watch` streams for each active resource type
- Handle reconnection with exponential backoff on stream failure
- Emit structured events into the Watch Aggregator

**Watch stream lifecycle — two-tier policy:**

*Core set (always watched, opened at startup):* Pods, Deployments, StatefulSets, DaemonSets, Nodes, Namespaces, detected Kafka CRDs (Kafka, KafkaTopic), plus a single cluster-wide watch on **Warning events only** (`fieldSelector=type=Warning`). These power the Health Dashboard (the default launch view), sidebar count badges, the agent's cluster summary, and pod triage — all of which need cluster-wide state regardless of what the user has viewed.

*On-demand set (lazy):* all other resource types (ConfigMaps, Secrets, RBAC, storage, generic CRDs, …).
- Opened when the resource type is first viewed
- Kept alive while in the active navigation path
- Closed after a configurable idle timeout (default: 5 minutes off-screen)
- Sidebar count badges for on-demand kinds come from a periodic metadata-only LIST (every 60s), not a watch (see Spec 02 §3.2)

*All streams:*
- Watch events carry `resourceVersion` for consistent resumption
- Stored objects are stripped of `managedFields` and the `kubectl.kubernetes.io/last-applied-configuration` annotation to keep memory usage low on large clusters

**Normal-type Events** are never watched — the EventsTab and agent `get_events` tool fetch them via on-demand LIST with a field selector (`involvedObject.name=…`) when requested.

**Error handling:**
- 401/403 → surface permission error in UI, do not crash
- Connection failure → retry with backoff, show degraded indicator
- Context switch → tear down all streams, reinitialize. The switch is not
  assumed instant: while reconnecting the header shows a transient
  `connecting` status that clears on the first successful stream sync; a
  connection failure surfaces a persistent "Could not connect" banner with
  **[Retry]** and **[Switch context]** actions. The outgoing context's
  `{ namespace, activeKind }` is remembered and the incoming context's
  remembered values are restored (validated against the new cluster, falling
  back to Overview / all-namespaces when absent), persisted in
  `~/.config/p9r/layout.json` under a `contexts` map.

### 3.2 Watch Aggregator

A lightweight in-process pub/sub layer between the K8s client and the State Store.

Responsibilities:
- Receives raw watch events (`ADDED`, `MODIFIED`, `DELETED`) from all active streams
- Normalizes events into a common `ResourceEvent` type
- Fans out to State Store subscribers

```typescript
type WatchEventType = 'ADDED' | 'MODIFIED' | 'DELETED';

interface ResourceEvent {
  type: WatchEventType;
  apiVersion: string;
  kind: string;
  namespace: string | null;
  name: string;
  object: KubernetesObject;  // full resource body
  receivedAt: number;        // Date.now()
}
```

### 3.3 State Store

An in-memory reactive store. Not Redux — a simple Map-based structure with change notification.

**Structure:**
```
Store
└── clusters
    └── <context-name>
        └── resources
            └── <kind>/<namespace>/<name> → ResourceObject
```

Responsibilities:
- Apply watch events (upsert on ADDED/MODIFIED, delete on DELETED)
- Maintain derived state: status rollups per namespace, per node, per workload
- Notify Ink UI of changes via a subscription model (similar to Zustand)
- Never block — all mutations are synchronous, notifications are async (microtask)

**No persistence.** State is rebuilt from watch streams on each launch. Config (context preferences, pinned resources, layout) is persisted separately to `~/.config/p9r/`.

### 3.4 Prometheus Client Layer

Responsibilities:
- Auto-discover Prometheus endpoint (see §5)
- Poll metrics on a configurable interval (default: 30s)
- Expose a simple query interface: `query(promql: string): Promise<MetricResult>`
- Cache results; serve cached values to UI between polls
- Degrade gracefully — metrics are always optional, never block resource display

**No watch streams.** Prometheus uses polling, not streaming. The poll interval is intentional — Prometheus itself scrapes on intervals, sub-30s polling adds no value.

### 3.5 Ink UI Layer

**Library:** Ink v5+ (React for CLIs)

Responsibilities:
- Render all UI as React components
- Consume State Store via hooks (equivalent to `useStore`)
- Handle all keyboard input via Ink's `useInput` hook
- Never perform I/O directly — all data fetching goes through Store or Client layers

**Rendering model:**
- Ink re-renders on state change, same as React
- Components subscribe only to the slice of state they need (avoid full-tree re-renders)
- Terminal resize events trigger a layout recalculation

**Input Layer (mouse):**
Ink has no built-in mouse support — Privateer implements its own, the same approach Claude Code uses:
- Enable SGR mouse reporting on startup: `\x1b[?1003h\x1b[?1006h` (any-motion tracking + SGR extended coordinates); disabled on exit/suspend
- Parse SGR sequences (`\x1b[<b;x;yM/m`) from stdin into structured `MouseEvent`s (click, release, drag, scroll, motion)
- A **hit-testing registry**: components register their rendered bounding boxes each render pass; the input layer routes mouse events to the topmost registered region
- Drag handling (pane resize) tracks press→motion→release sequences against the registered drag-handle regions
- Multi-key sequences (`gg`) are handled by the keyboard side of the input layer with a 500ms sequence buffer

This is a first-class subsystem, not a library flag — it should be one of the first implementation chunks since every interactive component depends on it.

### 3.6 Agent Layer

**Library:** `@huggingface/transformers` (ONNX runtime, runs in-process)  
**Model:** Gemma 4 E2B (quantized, ~1.3GB) — config-overridable to E4B via `agent.model`  
**Model path:** `~/.config/p9r/models/`

Responsibilities:
- Accept natural language input from the command bar
- Receive a structured context snapshot from the State Store (current namespace, active resource type, visible resource list with status)
- Produce a structured `AgentAction` response — never free text displayed directly
- Dispatch `AgentAction` to the UI layer for execution

**AgentAction type (v1):**
```typescript
type AgentAction =
  | { type: 'navigate'; resource: string }               // e.g. navigate to Pods
  | { type: 'filter'; namespace?: string; search?: string }  // set filters
  | { type: 'answer'; text: string }                     // answer displayed in command bar
  | { type: 'unknown'; raw: string }                     // couldn't parse intent
```

**Context snapshot passed to model:**
```typescript
interface AgentContext {
  activeContext: string;
  activeNamespace: string;
  activeResource: string;
  visibleResources: Array<{
    name: string;
    namespace: string;
    status: 'healthy' | 'warning' | 'error' | 'unknown';
    age: string;
  }>;
  allResourceTypes: string[];
  allNamespaces: string[];
}
```

The context snapshot is serialized into the prompt. Only the visible resource list is included (not the full cluster state) to stay within the model's context window.

**v1 capability boundary:**
- Navigate to resource types
- Set namespace and search filters
- Answer questions about visible state
- No mutations — no delete, restart, scale, or port-forward

**v2 (out of scope for this spec):**
- Actions with confirmation step

**First-run model download:**
- On first launch, if model is absent from `~/.config/p9r/models/`, Privateer shows a full-screen download progress UI
- Download is blocking — the TUI does not launch until the model is ready
- Download URL sourced from Hugging Face Hub via `@huggingface/transformers` model resolution
- Checksum verified after download
- User can skip with `--no-agent` flag; agent features disabled for that session

---

## 4. Configuration

**File:** `~/.config/p9r/config.yaml`

```yaml
# Active context (overrides kubeconfig current-context)
activeContext: my-cluster

# Prometheus override (if auto-discovery fails)
prometheus:
  url: http://prometheus.monitoring.svc:9090

# UI preferences  
ui:
  mouseSupport: true
  refreshInterval: 30       # seconds, for non-watch resources
  idleStreamTimeout: 300    # seconds before closing off-screen watch streams
  theme: dark               # dark | light

# Resource visibility (hide resources you never use)
hiddenResources:
  - EndpointSlices
  - Events
```

Config is watched for changes and hot-reloaded without restart.

---

## 5. Prometheus Auto-Discovery

Attempted in order, first success wins:

1. **Config override** — `~/.config/p9r/config.yaml` explicit URL
2. **`PROMETHEUS_URL` env var**
3. **In-cluster ServiceMonitor scan** — query the k8s API for `monitoring.coreos.com/v1/ServiceMonitor` resources, extract targets
4. **Standard namespace probe** — try `http://prometheus-operated.monitoring:9090`, `http://prometheus.monitoring:9090`, `http://prometheus-server.monitoring:9090` (port-forwarded automatically if in-cluster)
5. **Annotation scan** — look for pods with `prometheus.io/scrape: "true"` annotations that expose `/metrics` on a known port
6. **Disabled** — if none found, metrics features are hidden, no error shown

Discovery runs once at startup and re-runs on context switch.

---

## 6. Kubeconfig & Multi-Cluster

- Read from `KUBECONFIG` env or `~/.kube/config`
- All contexts are available in a context switcher (keyboard shortcut: `:ctx` or dedicated keybind)
- Switching context tears down all watch streams and reinitializes
- Each context gets its own State Store namespace
- Recently used contexts are persisted in config

---

## 7. Entry Point & CLI Interface

```
p9r                          # launch TUI (default)
p9r --context <name>         # launch with specific context
p9r --kubeconfig <path>      # use alternate kubeconfig
p9r --namespace <ns>         # start focused on namespace
p9r version                  # print version and exit
p9r completion bash|zsh|fish # shell completion script
```

No subcommands that duplicate kubectl. Privateer is a TUI, not a CLI toolkit.

---

## 8. Dependencies (top-level)

| Package | Purpose |
|---|---|
| `bun` | Runtime |
| `ink` | React TUI renderer |
| `react` | Component model |
| `@kubernetes/client-node` | K8s API + watch |
| `@huggingface/transformers` | Local LLM inference (ONNX) |
| `js-yaml` | YAML parse/render for resource views |
| `date-fns` | Human-readable timestamps |
| `ansi-escapes` | Terminal control sequences (cursor; mouse protocol handled by custom Input Layer §3.5) |

No ORM, no database, no HTTP server. Keep the dependency surface minimal.

---

## 9. Out of Scope for This Spec

- Specific UI layouts and keybindings → Spec 02 (Navigation & Layout)
- Resource type coverage → Spec 03 (Resource Model)
- Individual view designs → Spec 04 (Core Views)
- Action implementations → Spec 05+ (Actions)
- Metrics display → Spec 06 (Metrics)
- Agent prompt design and context serialization → Spec 07 (Agent)

---

## 10. Resolved Decisions

| # | Question | Decision |
|---|---|---|
| OQ-1 | Persist context state (last viewed resource, scroll position) across restarts? | No — state is ephemeral, preferences only |
| OQ-2 | Port-forward for Prometheus auto-discovery — kubectl or direct SPDY? | Use `kubectl port-forward` via subprocess |
| OQ-3 | Multi-cluster simultaneous view in v1? | No — open a second terminal instance per cluster |
| OQ-4 | Plugin/extension system in v1? | No — out of scope for v1 |

---

*Next: Spec 02 — Navigation & Layout*
