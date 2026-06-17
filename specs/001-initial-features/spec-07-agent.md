# Privateer — Agent Spec
**Spec:** 07-agent  
**Status:** Draft  
**Depends on:** Spec 01 (Architecture), Spec 02 (Navigation & Layout), Spec 04 (Core Views)

---

## 1. Goals

- Define the agent's prompt architecture: cluster summary + tool calls
- Define the general-purpose and targeted tool catalog
- Define the AgentTab as a persistent conversation panel in the detail pane
- Define the full request/response lifecycle
- Define degradation behavior when the model is unavailable

---

## 2. Architecture Overview

```
User types query in command bar
        │
        ▼
Agent Layer receives query + builds prompt
        │
        ├── System prompt: cluster summary snapshot
        ├── Tool definitions: general + targeted
        └── User message: raw query
        │
        ▼
Model reasons, calls tools via AgentToolDispatcher
        │
        ├── Tool calls → State Store queries (in-process, no I/O)
        └── Tool results → returned to model
        │
        ▼
Model produces final AgentAction
        │
        ├── navigate  → UI navigation dispatch
        ├── filter    → namespace/search filter update
        ├── answer    → text appended to AgentTab
        └── unknown   → "I couldn't understand that" in AgentTab
```

All tool calls are resolved against the in-process State Store. No network calls during inference — tools are pure reads of already-cached cluster state.

---

## 3. Prompt Architecture

### 3.1 System prompt structure

```
You are Privateer, a Kubernetes cluster assistant embedded in a TUI.
You help users navigate, inspect, and understand their cluster.

You have access to tools to inspect cluster state. Use them to answer
questions accurately. Do not guess resource names or states.

When you have enough information, respond with a JSON action object.
Never respond with free text — always respond with a JSON action.

## Current cluster state summary

Context: {activeContext}
Namespace filter: {activeNamespace | "all namespaces"}
Active view: {activeResourceKind}

### Workload health
- Pods: {runningCount} running, {warningCount} warning, {errorCount} error, {pendingCount} pending
- Deployments: {healthyCount} healthy, {degradedCount} degraded
- StatefulSets: {healthyCount} healthy, {degradedCount} degraded

### Namespaces
{namespaceList: name, podCount, errorCount — one per line, top 10 by pod count}

### Active health issues
{top 5 health rule violations from Spec 06 rule engine, severity + title only}

### Kafka (if detected)
{kafkaClusterName}: {brokerCount} brokers, {topicCount} topics
Consumer groups with lag > threshold: {lagSummary}

## Available resource types
{allResourceKinds joined by comma}

## Response format
Always respond with a valid JSON object matching one of these schemas:
{"action":"navigate","resource":"<kind>"}
{"action":"filter","namespace":"<ns>","search":"<term>"}
{"action":"answer","text":"<answer, max ~80 words; bullet lines allowed>"}
{"action":"multi","steps":[<array of above actions>]}
{"action":"unknown","raw":"<what you understood"}
```

### 3.2 Context snapshot sizing

The system prompt is designed to stay under 2,000 tokens. With Gemma 4 E2B's 128K context window this is a latency discipline rather than a correctness requirement — smaller prompts mean faster CPU inference. Tool results are capped at ~600 tokens each (truncated with a marker) for the same reason.

Rules:
- Namespace list: top 10 by pod count, truncated with "and N more"
- Health issues: top 5 by severity
- Kafka summary: one line per cluster, one line for lag summary
- No full resource lists in the system prompt — tools handle that

### 3.3 Conversation history

The AgentTab maintains a conversation history. Each new query appends to the history and sends the last 3 turns to the model (system prompt + last 3 user/assistant pairs). Older turns are dropped to stay within context window limits.

---

## 4. Tool Catalog

### 4.1 General-purpose tools

#### `list_resources`
List resources of any kind with optional filters.

```typescript
{
  name: "list_resources",
  description: "List Kubernetes resources of a given kind. Use this to find resources by name, namespace, or status.",
  parameters: {
    kind: string,              // e.g. "Pod", "Deployment", "Service"
    namespace?: string,        // omit for all namespaces
    status?: "error" | "warning" | "healthy" | "unknown",
    search?: string,           // substring match on name
    limit?: number             // default 20, max 50
  },
  returns: Array<{
    name: string,
    namespace: string,
    status: string,
    statusLabel: string,
    age: string
  }>
}
```

#### `get_resource`
Get full details of a specific resource.

```typescript
{
  name: "get_resource",
  description: "Get full details of a specific Kubernetes resource including spec and status.",
  parameters: {
    kind: string,
    name: string,
    namespace?: string
  },
  returns: {
    name: string,
    namespace: string,
    labels: Record<string, string>,
    annotations: Record<string, string>,
    spec: object,              // top 2 levels of spec only, to limit size
    status: object,            // top 2 levels of status only
    age: string,
    events: Array<{type, reason, message, age}>  // last 5 events
  }
}
```

#### `get_events`
Get Kubernetes events for a resource or namespace.

```typescript
{
  name: "get_events",
  description: "Get recent Kubernetes events for a resource or namespace. Useful for diagnosing errors.",
  parameters: {
    namespace?: string,
    resourceKind?: string,
    resourceName?: string,
    type?: "Warning" | "Normal",  // default: Warning
    limit?: number                // default 10
  },
  returns: Array<{
    type: string,
    reason: string,
    message: string,
    count: number,
    age: string,
    involvedObject: { kind, name, namespace }
  }>
}
```

#### `count_resources`
Count resources by kind and status — useful for aggregate questions.

```typescript
{
  name: "count_resources",
  description: "Count resources by kind and optionally by status or namespace. Use for questions like 'how many pods are crashing'.",
  parameters: {
    kind: string,
    namespace?: string,
    status?: "error" | "warning" | "healthy" | "unknown"
  },
  returns: {
    total: number,
    byStatus: Record<string, number>,
    byNamespace: Record<string, number>
  }
}
```

---

### 4.2 Targeted tools — Pods

#### `get_pod_detail`
Rich pod inspection including all containers, resource usage, and owner chain.

```typescript
{
  name: "get_pod_detail",
  description: "Get detailed information about a specific pod including all container states, resource usage, restart history, and owner references. Use this for diagnosing pod issues.",
  parameters: {
    name: string,
    namespace: string
  },
  returns: {
    name: string,
    namespace: string,
    phase: string,
    nodeName: string,
    podIP: string,
    qosClass: string,
    containers: Array<{
      name: string,
      image: string,
      state: string,          // running | waiting | terminated
      reason?: string,        // e.g. CrashLoopBackOff
      restartCount: number,
      ready: boolean,
      cpuRequest?: string,
      cpuLimit?: string,
      memRequest?: string,
      memLimit?: string,
      lastTerminatedReason?: string,
      lastTerminatedExitCode?: number
    }>,
    initContainers: Array<{ name, state, reason, restartCount }>,
    conditions: Array<{ type, status, reason, message }>,
    ownerKind: string,        // e.g. ReplicaSet
    ownerName: string,
    topOwnerKind: string,     // e.g. Deployment (resolved up the chain)
    topOwnerName: string,
    recentEvents: Array<{ type, reason, message, count, age }>
  }
}
```

#### `find_erroring_pods`
Find pods in error state with triage summary — the single most common diagnostic query.

```typescript
{
  name: "find_erroring_pods",
  description: "Find all pods currently in an error state with a triage summary. Returns the most actionable information for diagnosing what is wrong.",
  parameters: {
    namespace?: string        // omit for all namespaces
  },
  returns: Array<{
    name: string,
    namespace: string,
    errorReason: string,      // e.g. CrashLoopBackOff, OOMKilled, ImagePullBackOff
    restartCount: number,
    affectedContainer: string,
    lastExitCode?: number,
    lastEvent?: string,       // most recent warning event message
    ownerDeployment?: string  // if owned by a deployment
  }>
}
```

---

### 4.3 Targeted tools — Deployments

#### `get_deployment_detail`
Rich deployment inspection including rollout status, pod summary, and HPA.

```typescript
{
  name: "get_deployment_detail",
  description: "Get detailed information about a deployment including rollout status, pod health summary, HPA configuration, and recent events.",
  parameters: {
    name: string,
    namespace: string
  },
  returns: {
    name: string,
    namespace: string,
    replicas: { desired, ready, available, updatedReplicas },
    strategy: string,
    image: string,            // first container image
    conditions: Array<{ type, status, reason, message }>,
    pods: {
      total: number,
      byStatus: Record<string, number>,
      erroring: Array<{ name, reason, restarts }>  // pods in error state
    },
    hpa?: {
      name: string,
      minReplicas: number,
      maxReplicas: number,
      currentReplicas: number,
      cpuTarget?: number,
      cpuCurrent?: number
    },
    recentEvents: Array<{ type, reason, message, age }>
  }
}
```

#### `get_rollout_status`
Check whether a deployment rollout is in progress or stuck.

```typescript
{
  name: "get_rollout_status",
  description: "Check the rollout status of a deployment. Useful for determining if a deployment is progressing, complete, or stuck.",
  parameters: {
    name: string,
    namespace: string
  },
  returns: {
    status: "complete" | "progressing" | "stuck" | "failed",
    message: string,
    updatedReplicas: number,
    totalReplicas: number,
    availableReplicas: number,
    progressDeadlineExceeded: boolean,
    estimatedTimeRemaining?: string
  }
}
```

---

### 4.4 Targeted tools — Kafka

#### `get_kafka_lag`
Consumer group lag summary for a topic or all topics.

```typescript
{
  name: "get_kafka_lag",
  description: "Get consumer group lag for Kafka topics. Use for questions about message backlog, slow consumers, or lag trends.",
  parameters: {
    topic?: string,           // omit for all topics
    consumerGroup?: string    // omit for all groups
  },
  returns: Array<{
    topic: string,
    consumerGroup: string,
    totalLag: number,
    trend: "climbing" | "dropping" | "stable",
    status: "healthy" | "warning" | "critical",
    partitionCount: number
  }>
}
```

---

## 5. AgentToolDispatcher

The in-process dispatcher that resolves tool calls against the State Store:

```typescript
class AgentToolDispatcher {
  constructor(private store: StateStore) {}

  async dispatch(toolName: string, params: object): Promise<object> {
    switch (toolName) {
      case 'list_resources':    return this.listResources(params);
      case 'get_resource':      return this.getResource(params);
      case 'get_events':        return this.getEvents(params);
      case 'count_resources':   return this.countResources(params);
      case 'get_pod_detail':    return this.getPodDetail(params);
      case 'find_erroring_pods': return this.findErroringPods(params);
      case 'get_deployment_detail': return this.getDeploymentDetail(params);
      case 'get_rollout_status': return this.getRolloutStatus(params);
      case 'get_kafka_lag':     return this.getKafkaLag(params);
      default: throw new Error(`Unknown tool: ${toolName}`);
    }
  }
}
```

All dispatches are synchronous reads from the State Store — no async I/O, no network calls. Tool results are returned to the model in the next inference step.

**Redaction invariant:** the dispatcher redacts Secret material at the boundary, unconditionally. Any result containing a resource of kind `Secret` (including via `get_resource`, `list_resources`, or embedded references) has all `data` and `stringData` values replaced with `[redacted]`. There is **no reveal path through the agent** — the YAML view's confirm-to-reveal flow (Spec 04 §6.1) is the only way to display secret values, ever. This invariant is enforced in the dispatcher, not in prompts.

---

## 6. AgentAction Execution

Final actions dispatched to the UI layer:

```typescript
type AgentAction =
  | { action: 'navigate'; resource: string }
  | { action: 'filter'; namespace?: string; search?: string }
  | { action: 'answer'; text: string }
  | { action: 'multi'; steps: AgentAction[] }
  | { action: 'unknown'; raw: string }
```

**`navigate`** — selects the resource type in the left sidebar, clears the search filter.

**`filter`** — updates the namespace dropdown and/or search field without changing the resource type.

**`multi`** — executes steps in sequence. Common pattern: `navigate` then `filter`. Example: "show me the erroring order pods" → `[{navigate: Pod}, {filter: search="order", status="error"}]`

**`answer`** — appended to the AgentTab conversation. Not shown in the command bar. If the detail pane is hidden (e.g. on the Health Dashboard with nothing selected), the pane auto-opens with the Agent tab active; closing it returns to the hidden state.

**`unknown`** — same auto-open behavior as `answer`; appended to AgentTab as: `I couldn't understand that. Try: "show me erroring pods", "how many deployments are in default", "find the order-api deployment".`

---

## 7. AgentTab

### 7.1 Placement

A persistent tab in the center bottom detail pane. Always available regardless of what resource is selected in the left sidebar or list. Does not reset on navigation.

Tab label: `Agent` — no resource name prefix (unlike other tabs which show the selected resource name).

```
 [Overview] [YAML] [Events]  ·  [Agent]                              ✕
```

The Agent tab is visually separated from resource-specific tabs with a `·` divider.

### 7.2 Layout

```
 ╔══ Agent ══════════════════════════════════════════════════════════════════╗
 ║                                                                           ║
 ║  > show me the erroring pods                                              ║
 ║  ↳ Navigated to Pods, filtered to error status                           ║
 ║    Found 2 erroring pods:                                                 ║
 ║    • order-api-7d9f-xk2p — CrashLoopBackOff (14 restarts)               ║
 ║    • payment-worker-3f8a — OOMKilled (exit 137)                          ║
 ║                                                                           ║
 ║  > what's wrong with the order-api pod                                    ║
 ║  ↳ order-api-7d9f-xk2p is in CrashLoopBackOff. The last container exit  ║
 ║    had code 1. Most recent event: "Back-off restarting failed container"  ║
 ║    3 minutes ago. Check logs for the root cause.                          ║
 ║                                                                           ║
 ║  > _                                                                      ║
 ║                                                                           ║
 ║  [Clear history]                                                          ║
 ╚═══════════════════════════════════════════════════════════════════════════╝
```

### 7.3 Conversation rendering

Each exchange rendered as:

```
> {user query}
↳ {action taken, if navigate/filter}
  {answer text, if any}
```

- User queries in bright white
- Action confirmations (`↳ Navigated to Pods…`) in dim cyan
- Answer text in normal white
- Error/unknown responses in yellow
- Timestamps shown on hover (mouse) or `T` key toggle

### 7.4 History

- Last 20 exchanges retained in memory per session
- `[Clear history]` button clears display and resets model conversation context
- History is not persisted across restarts

### 7.5 Input

Input is always via the command bar (Spec 02 §7). The AgentTab is display-only — no input field inside the tab itself. Focusing the AgentTab and pressing `Space` focuses the command bar.

---

## 8. Fast Path — Deterministic Intent Parser

Before any inference, queries are tried against a deterministic parser. This is a latency optimization — common navigation intents resolve instantly instead of waiting on CPU inference.

**Patterns handled (case-insensitive):**

| Pattern | Action |
|---|---|
| `(show\|go to\|open) <kind-alias>` | navigate |
| `<kind-alias> in <namespace>` | navigate + filter namespace |
| `(erroring\|crashing\|failing\|broken) <kind-alias>?` | navigate Pods + filter status=error |
| `<kind-alias>` alone (e.g. just "pods") | navigate |
| bare namespace name matching a known namespace | filter namespace |

`<kind-alias>` matches the resource kind dictionary including short forms (`deploy`, `sts`, `ds`, `svc`, `cm`, `pvc`, `ing`, `topics`, …) — the same alias table used by `!<resource>` commands.

The parser only fires on **unambiguous full matches**. Anything with question words (what/why/how/which), comparatives, or unmatched tokens falls through to the model. The fast path never produces `answer` actions — those always come from the model.

**UX:** fast-path resolutions skip the `thinking…` state entirely; the action just happens, indistinguishable from a `!` command.

---

## 9. Inference Lifecycle

```
1. User submits query (Enter in command bar)
2. Command bar shows spinner: `> thinking…`
3. Agent Layer builds prompt (system + history + user message)
4. Model begins inference (async, non-blocking)
5. Model emits tool calls → dispatcher resolves → results appended to context
6. Steps 4–5 repeat until model emits final action (max 5 tool call rounds)
7. AgentAction parsed and validated
8. Action dispatched to UI
9. Exchange appended to AgentTab
10. Command bar clears spinner, returns to idle state
```

**Timeout:** if inference exceeds 15 seconds, cancel and append to AgentTab:
```
↳ Query timed out. The model took too long to respond. Try a simpler query.
```

**Max tool rounds:** 5 — prevents infinite loops if the model keeps calling tools without producing a final action.

---

## 10. Command Bar Agent UX

### 10.1 States

| State | Command bar display |
|---|---|
| Idle | `·  ask anything or !command` |
| Focused | `>  _` (cursor) |
| Thinking | `>  thinking…` (spinner) |
| Tool call in progress | `>  inspecting pods…` (tool name humanized) |
| Complete (navigate/filter) | bar clears, action visible in UI |
| Complete (answer) | bar clears, answer visible in AgentTab |
| Error | `>  ⚠ {error message}` fades after 3s |

### 10.2 Humanized tool call indicators

While the model is calling tools, the command bar shows a human-readable description:

| Tool | Display |
|---|---|
| `list_resources` | `looking up {kind}s…` |
| `get_resource` | `inspecting {name}…` |
| `find_erroring_pods` | `finding erroring pods…` |
| `get_deployment_detail` | `checking {name} deployment…` |
| `get_kafka_lag` | `checking consumer lag…` |
| `get_events` | `reading events…` |

---

## 11. Model Management

### 11.1 Model identity

- **Model:** Gemma 4 E2B (quantized INT4) — native function calling, structured JSON output, configurable thinking mode
- **Alternative:** Gemma 4 E4B via `agent.model` in config.yaml for machines with more RAM
- **Thinking mode policy:** disabled for navigation/filter intents (latency); enabled for diagnostic queries
- **Library:** `@huggingface/transformers` with ONNX runtime (model id verified against HF Hub ONNX availability at build time)
- **Model path:** `~/.config/p9r/models/gemma-4-E2B-it-onnx/`
- **Approximate size:** ~1.3GB quantized

### 11.2 First-run download

Per Spec 04 §13. Blocking download screen shown before TUI launches. `--no-agent` flag skips.

### 11.3 Model updates

- p9r ships with a pinned model version
- On version upgrade of p9r, if the pinned model version changes, the download screen is shown again
- No automatic background updates

### 11.4 `--no-agent` mode

When launched with `--no-agent`:
- Command bar shows: `·  !command` (no agent prompt)
- AgentTab hidden from detail pane
- All other features unaffected
- `Space` opens the command bar in command-only mode (input treated as `!`-prefixed); `!` prefix optional in this mode

---

## 12. v2 Capabilities (out of scope)

- **Actions** — agent triggers delete, restart, scale, port-forward with confirmation
- **Label search** — `label:app=order-api` prefix syntax in command bar search
- **Kafka message viewing** — agent can fetch and display recent messages from a topic
- **Multi-turn context** — agent remembers cluster state changes during a session

---

## 13. Resolved Decisions

| # | Question | Decision |
|---|---|---|
| OQ-1 | Prompt strategy | Compact cluster summary + tool calls for drill-down |
| OQ-2 | Tool granularity | General-purpose + targeted tools for pods and deployments |
| OQ-3 | Answer display | Persistent AgentTab in detail pane; command bar shows action feedback only |
| OQ-4 | Conversation history | Last 20 exchanges in memory; last 3 turns sent to model |
| OQ-5 | Max tool call rounds | 5 rounds before timeout |
| OQ-6 | Inference timeout | 15 seconds |
| OQ-7 | Model updates | Pinned per p9r version; re-download on version change |
| OQ-8 | Model identity | Gemma 4 E2B default, E4B config option; thinking mode off for navigation, on for diagnostics |
| OQ-9 | Fast path | Deterministic intent parser before inference for unambiguous navigation patterns |
| OQ-10 | Secret safety | Unconditional dispatcher-level redaction; no reveal path through agent |

---

*Spec series complete. All 7 specs cover the full v1 feature set of Privateer.*
