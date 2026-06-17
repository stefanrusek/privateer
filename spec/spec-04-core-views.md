# Privateer — Core Views Spec
**Spec:** 04-core-views  
**Status:** Draft  
**Depends on:** Spec 01 (Architecture), Spec 02 (Navigation & Layout), Spec 03 (Resource Model)

---

## 1. Goals

- Define the rendering contract for all reusable view components
- Define the detail pane tab structure and content per resource type
- Define YAML view, edit mode, and diff/confirm flow
- Define the Events tab filtering behavior
- Finalize command bar mode indicator design
- Define first-run model download screen

---

## 2. View Component Inventory

| Component | Used in |
|---|---|
| `ResourceTable` | Center top — all resource list views |
| `DetailPane` | Center bottom — tabbed detail container |
| `OverviewTab` | Detail pane — structured read-only summary |
| `YamlTab` | Detail pane — syntax highlighted YAML, editable |
| `DiffView` | Modal overlay — before save confirmation |
| `EventsTab` | Detail pane — filtered kubernetes events |
| `LogsTab` | Detail pane — pods only, see Spec 05 |
| `AgentTab` | Detail pane — persistent agent conversation, see Spec 07 |
| `MetricsTab` | Detail pane — if Prometheus available, see Spec 06 |
| `CommandBar` | Bottom row — agent input, mode indicator, status |
| `ContextSwitcher` | Full-screen modal overlay |
| `HelpOverlay` | Full-screen modal overlay |
| `FirstRunScreen` | Full-screen — model download on first launch |
| `ConfirmDialog` | Modal overlay — destructive action confirmation |

---

## 3. ResourceTable

The list view rendered in the center top pane.

### 3.1 Structure

```
 ● Name                    Namespace      Ready   Phase      Restarts  Age
 ─────────────────────────────────────────────────────────────────────────
 ● order-api-7d9f-xk2p     default        1/1     Running    0         2d
 ● payment-svc-3f8a-mn4q   default        0/1     Error      14        3h
 ● analytics-6b2c-pp9r     analytics      1/1     Running    0         5d
```

### 3.2 Column rendering rules

- **Status column** — always first, 2 chars wide: `●` colored green/yellow/red/grey
- **Name column** — always second, never truncated if space allows; truncated with `…` suffix if needed
- **Age column** — always last, right-aligned, uses age formatting from Spec 03 §6
- **All other columns** — order defined per resource type in Spec 03
- **Column headers** — bold, clicking sorts ascending; clicking again sorts descending; active sort column shows `▲` or `▼`
- **Default sort** — Name ascending, except Pods which default to Status (errors first)

### 3.3 Row states

| State | Rendering |
|---|---|
| Default | Normal text, alternating row background (subtle) |
| Hovered | Row background highlight (mouse) |
| Selected | Distinct background, persists when pane loses focus |
| New (just added by watch) | Brief green flash on row appearance (300ms) |
| Modified (watch MODIFIED event) | Brief blue flash on changed cells (300ms) |
| Deleted (watch DELETED event) | Row struck through, fades out over 500ms |

### 3.4 Empty states

| Condition | Message |
|---|---|
| No resources found | `No <ResourceType> found in <namespace>` |
| Search filtered to zero | `No results for "<search term>"` |
| 403 Forbidden | `Permission denied — cannot list <ResourceType>` |
| Watch stream error | `Connection error — retrying… (<attempt>/<max>)` |
| Loading (initial fetch) | Spinner + `Loading <ResourceType>…` |

### 3.5 Pagination

No pagination — Privateer uses virtual scrolling. The full resource list is held in memory (State Store); only visible rows are rendered. Handles clusters with thousands of pods without performance issues.

---

## 4. DetailPane

The tabbed container in the center bottom pane.

### 4.1 Tab bar

```
 order-api-7d9f-xk2p  [Overview] [YAML] [Events] [Logs] [Metrics]  ·  [Agent]  ✕
```

- Resource name shown left of tabs
- `✕` closes the detail pane (returns to hidden state)
- Tabs that are unavailable for the resource type are hidden (not grayed out)
- Active tab underlined
- Tab keyboard nav (when the detail pane is focused): `←` / `→` switch to the
  previous / next navigable tab (wrapping around), and number keys `1`–`6` jump
  directly to a tab. `Tab` / `Shift+Tab` do **not** switch tabs — they cycle
  keyboard focus between regions (Spec 02 §8.2). The navigable-tab list is the
  available content tabs for the resource kind (§4.2) followed by the always-
  present Agent tab.
- An `answer` or `unknown` agent action auto-opens the detail pane with the Agent tab active if the pane is hidden (see Spec 07 §6)

### 4.2 Tab availability by resource type

| Resource | Overview | YAML | Events | Logs | Metrics |
|---|---|---|---|---|---|
| Pod | ✓ | ✓ | ✓ | ✓ | ✓ |
| Deployment | ✓ | ✓ | ✓ | — | ✓ |
| StatefulSet | ✓ | ✓ | ✓ | — | ✓ |
| DaemonSet | ✓ | ✓ | ✓ | — | ✓ |
| Node | ✓ | ✓ | ✓ | — | ✓ |
| KafkaTopic | ✓ | ✓ | ✓ | — | ✓ |
| Kafka | ✓ | ✓ | ✓ | — | ✓ |
| All others | ✓ | ✓ | ✓ | — | if Prometheus |

The `Agent` tab (Spec 07) is always present, separated by a divider. Exec/Terminal is a suspend-and-handover action (`x` key), not a tab, in v1 — see Spec 05 §4.3.

---

## 5. OverviewTab

Read-only structured summary of the resource. Not a form — no inline editing.

### 5.1 Layout

Two-column key/value layout with logical sections separated by subtle dividers.

```
 METADATA
 Name          order-api-7d9f-xk2p
 Namespace     default
 Created       2 days ago (2026-06-07 14:23:01)
 Node          node-3.cluster.internal
 Labels        app=order-api  version=v2.1.0  env=production
 Annotations   2 annotations  [show]

 STATUS
 Phase         Running
 Ready         1/1
 Restarts      0
 IP            10.244.3.42

 CONTAINERS
 order-api     gcr.io/myapp/order-api:v2.1.0   Running   1/1
```

### 5.2 Section definitions per resource type

**Pod:**
- Metadata: name, namespace, created, node, labels, annotations
- Status: phase, ready, restarts, pod IP, host IP, QoS class
- Containers: name, image, state, ready, restarts, ports
- Volumes: name, type, source

**Deployment:**
- Metadata: name, namespace, created, labels, annotations
- Status: ready replicas, up-to-date, available, strategy
- Selector: pod selector labels
- Template: pod template labels, containers summary

**Node:**
- Metadata: name, created, labels, roles
- Status: Ready condition, conditions list
- Capacity: CPU, memory, pods (allocatable vs capacity)
- System: OS, kernel, container runtime, kubelet version
- Addresses: internal IP, hostname

**KafkaTopic:**
- Metadata: name, namespace, created, labels
- Spec: partitions, replication factor, retention bytes, retention ms, cleanup policy
- Status: ready condition, observed generation

**DopplerSecret:**
- Metadata: name, namespace, created
- Spec: project, config, managed secret name, secret namespace
- Status: sync condition, last synced time
- Link: `→ View managed Secret` (navigates to the referenced k8s Secret)

**Generic (all others):**
- Metadata section always present
- Status section if `.status` exists — key/value render of top-level status fields (depth 1 only)

### 5.3 Annotations collapse

Annotations are collapsed by default (show count). `[show]` toggle expands inline. Collapsed by default because annotations are often noisy (injected by operators).

---

## 6. YamlTab

### 6.1 Read mode (default)

- Full resource YAML, syntax highlighted
- Color scheme: keys in blue, strings in green, numbers in yellow, booleans in cyan, null in grey
- Line numbers shown
- Scrollable via the detail scroll viewport (mouse wheel or `↑`/`↓`); long lines
  clip to the detail width — they never wrap (navigation-overhaul chunk 07)
- Secret values replaced with `[redacted]` — a `[reveal]` button (accelerator
  **`v`**) at the top of the pane reveals the values
- `e` or clicking `[Edit]` button enters edit mode

### 6.2 Edit mode

Entered via `e` or `[Edit]` button click.

```
 ╔══ EDITING — Ctrl+S to save, Ctrl+E to open in $EDITOR, Escape to cancel ══╗
 ║ 1  apiVersion: apps/v1                                       ║
 ║ 2  kind: Deployment                                          ║
 ║ 3  metadata:                                                 ║
 ║ 4    name: order-api                                         ║
```

- Full cursor-based text editing, with a cursor-following scroll on both axes
  (no wrapping — long lines clip, matching read mode)
- Mode indicator in command bar changes to yellow `EDIT`
- Modified lines indicated with a `│` marker in the gutter (left of line numbers)
- YAML syntax errors shown inline as red underline + error message in status bar
- `Ctrl+S` — validate YAML, then show DiffView before applying
- `Ctrl+E` (or clicking `[Open in $EDITOR]`) — pop out to `$EDITOR` (fallback
  `vi`): the TUI suspends (mouse reporting torn down), the buffer is edited
  externally, and the result is reloaded + validated on return
  (navigation-overhaul chunk 07)
- `Escape` — cancel edit, confirm discard if changes were made

**Architecture (navigation-overhaul chunk 07):** the editor owns only its
transient editing state (the cursor/edit-op logic is the pure, fully-covered
`src/ui/yaml-edit.ts`; the apply/conflict state machine is the pure
`src/ui/yaml-apply.ts`). The **cluster boundary lives in the controller** — the
component performs no `kubeClient` calls; it hands the controller a YAML string
and receives typed apply/reload results. `DiffView` is prop-driven.

**Discard confirmation:**
```
 Discard changes? [Yes] [No]
```
Shown inline in the command bar. Default selection: No.

### 6.3 Save flow

1. User presses `Ctrl+S`
2. YAML is parsed and validated client-side — if invalid, show error, do not proceed
3. DiffView opens (see §7) — the diff review **is** the confirm step; there is no
   second confirmation on top of it
4. User confirms (`[Apply]`/Enter) → PUT request sent to k8s API (`replace`
   semantics), performed by the controller
5. On success: exit edit mode, resource updates via watch stream
6. On `409 Conflict`: the DiffView shows a conflict bar offering
   **`[Reload & re-edit]`** (accelerator `r` — re-fetch the fresh resource and
   re-open the editor on it) and **`[Discard]`** (Esc — throw the pending edits
   away, return to read mode)
7. On any other API error: the message is shown over the diff; `[Apply]`/Enter
   retries, `[Cancel]`/Esc returns to edit mode with changes preserved

---

## 7. DiffView

Modal overlay shown between `Ctrl+S` and actual API call.

### 7.1 Layout

```
 ╔══ Review Changes ════════════════════════════════════════════╗
 ║                                                              ║
 ║  Deployment / default / order-api                           ║
 ║                                                              ║
 ║    spec:                                                     ║
 ║      replicas: 2  →  3                                      ║
 ║  -   image: myapp:v2.0.0                                    ║
 ║  +   image: myapp:v2.1.0                                    ║
 ║                                                              ║
 ║  [Apply]  [Cancel]                                          ║
 ╚══════════════════════════════════════════════════════════════╝
```

### 7.2 Diff format

- Unified diff style
- Removed lines prefixed with `-` in red
- Added lines prefixed with `+` in green
- Context lines (unchanged, surrounding) shown without prefix, dimmed
- Only changed sections shown — unchanged sections collapsed with `… N lines unchanged`
- Inline diffs for single-line value changes (old value struck through, new value highlighted)

### 7.3 Interaction

- `Enter` or clicking `[Apply]` → proceeds with save (`[Applying…]` while in
  flight); on success the tab returns to read mode
- `Escape` or clicking `[Cancel]` → returns to edit mode (changes preserved)
- On `409 Conflict`: `[Reload & re-edit]` (`r`) re-fetches the resource and
  re-opens the editor on the fresh body (`[Reloading…]` while in flight);
  `[Discard]` (Esc) throws the edits away and returns to read mode
- Scrollable if diff is long
- **Prop-driven (navigation-overhaul chunk 07):** DiffView holds no cluster
  client — the controller performs `replace`/`get` and feeds the status back in.
  The apply/conflict/error transition logic lives in pure `src/ui/yaml-apply.ts`.

---

## 8. EventsTab

### 8.1 Default view — Warnings only

```
 [Warning ✓] [All]                                    14 events (3 warnings)

 Type     Reason              Age    Count  Message
 ──────────────────────────────────────────────────────────────────────────
 Warning  BackOff             3m     14     Back-off restarting failed container
 Warning  FailedScheduling    1h     2      Insufficient memory on all nodes
```

- Toggle between `[Warning ✓]` (default) and `[All]` — clicking switches mode
- Warning count shown in tab label when warnings exist: `Events (3)`
- Events sourced from the k8s Events API filtered by `involvedObject.name` and `involvedObject.namespace`
- Sorted by last timestamp descending (most recent first)

### 8.2 All events view

Adds Normal type events (Pulled, Created, Started, Scheduled, etc.) to the table. Same columns.

### 8.3 Event columns

| Column | Source | Width |
|---|---|---|
| Type | `.type` (Normal/Warning) | 8 |
| Reason | `.reason` | 20 |
| Age | `.lastTimestamp` | 10 |
| Count | `.count` | 6 |
| Message | `.message` | remaining |

### 8.4 Empty state

```
 No warning events  [Show all events]
```

If no warnings but normal events exist, prompt to show all.

---

## 9. Command Bar — Final Design

Resolves OQ-1 from Spec 02.

```
 ctx: my-cluster  ns: default  Pods   >  ask anything or !command
```

### 9.1 Mode indicator

The `>` character left of the input area changes based on mode:

| Mode | Indicator | Color |
|---|---|---|
| Normal (unfocused) | `·` | dim grey |
| Agent input (focused) | `>` | bright white |
| Command input (`!` typed) | `!` | bright cyan |
| Search active (`/`) | `/` | bright white |
| Edit mode (YAML) | `EDIT` | yellow |
| Diff confirm pending | `DIFF` | yellow |

### 9.2 Right side — contextual hints

Dim key hints shown when command bar is unfocused, replaced by input prompt when focused:

```
 · Space agent  / search  ? help  q quit
```

Hints are context-sensitive — when a pod is selected, add `l logs  x exec  p fwd`.

---

## 10. ContextSwitcher

Full-screen modal. Triggered by `!ctx` or clicking context name in command bar.

```
 ╔══ Switch Context ════════════════════════════════════════════╗
 ║  Search: [                    ]                             ║
 ║                                                              ║
 ║  ● my-cluster          (current)                            ║
 ║    staging-cluster                                          ║
 ║    dev-cluster                                              ║
 ║                                                              ║
 ║  Escape to cancel                                           ║
 ╚══════════════════════════════════════════════════════════════╝
```

- Live search filters context list by typing
- Current context marked with `●`
- Arrow keys + Enter or click to select
- Selecting triggers context switch (tears down streams, reinitializes)
- A brief full-screen transition indicator shown during reinitialization:
  ```
  Connecting to staging-cluster…
  ```

---

## 11. HelpOverlay

Full-screen modal triggered by `?`. Organized by section:

```
 ╔══ Privateer — Keyboard Reference ════════════════════════════╗
 ║                                                              ║
 ║  GLOBAL                                                      ║
 ║  Space      Focus agent command bar                         ║
 ║  /          Search                                          ║
 ║  n          Namespace picker                                ║
 ║  Tab        Cycle pane focus                                ║
 ║  ?          This help                                       ║
 ║  q          Quit                                            ║
 ║                                                              ║
 ║  LIST (when list is focused)                                 ║
 ║  j / ↓      Move down                                       ║
 ║  k / ↑      Move up                                         ║
 ║  Enter      Open detail                                     ║
 ║  d          Delete (confirm)                                ║
 ║  e          Edit YAML                                       ║
 ║  l          Logs (pods only)                                ║
 ║  x          Exec shell (pods only)                          ║
 ║  p          Port-forward                                    ║
 ║                                                              ║
 ║  YAML EDIT                                                   ║
 ║  Ctrl+S     Save (shows diff)                               ║
 ║  Ctrl+E     Open in $EDITOR                                 ║
 ║  Escape     Cancel edit                                     ║
 ║                                                              ║
 ║  COMMANDS (!prefix)                                          ║
 ║  !ctx       Switch context                                  ║
 ║  !ns <name> Switch namespace                                ║
 ║  !pods      Navigate to resource type                       ║
 ║  !q         Quit                                            ║
 ║                                                              ║
 ║  Press ? or Escape to close                                 ║
 ╚══════════════════════════════════════════════════════════════╝
```

---

## 12. ConfirmDialog

Used for destructive actions (e.g. delete). (Secret reveal is a direct `v`
toggle in the YAML tab — see §6.1 — not a confirm dialog.)

```
 Delete Pod order-api-7d9f-xk2p? [Delete] [Cancel]
```

- Shown inline in the command bar area (not a full modal)
- Default selection: Cancel
- Enter confirms selected action, Escape cancels
- Destructive button (`[Delete]`) shown in red

---

## 13. FirstRunScreen

Shown on first launch when model is absent from `~/.config/p9r/models/`.

```
 ╔══════════════════════════════════════════════════════════════╗
 ║                                                              ║
 ║   privateer                                                  ║
 ║                                                              ║
 ║   Downloading AI model for the command bar agent.           ║
 ║   This is a one-time setup (~1.3GB).                        ║
 ║                                                              ║
 ║   Gemma 4 E2B (quantized)                                    ║
 ║   ████████████████░░░░░░░░░░░░░░  52%  690MB / 1.3GB        ║
 ║   2.1 MB/s · ~1m 34s remaining                             ║
 ║                                                              ║
 ║   The model runs locally. Nothing leaves your machine.      ║
 ║                                                              ║
 ║   Ctrl+C to cancel  ·  Run with --no-agent to skip         ║
 ║                                                              ║
 ╚══════════════════════════════════════════════════════════════╝
```

- Progress bar updates in real time
- Speed and ETA calculated from rolling average of last 5s of download
- "Nothing leaves your machine" — important trust signal given cluster access
- On completion: brief `✓ Model ready` message, then TUI launches normally
- On failure: error message + retry prompt
- `Ctrl+C` cancels download and exits
- `--no-agent` flag skips this screen entirely and disables agent features

---

## 14. Resolved Decisions

| # | Question | Decision |
|---|---|---|
| OQ-1 | YAML save semantics | `replace` (PUT) — matches kubectl edit behavior |
| OQ-2 | Diff before save | Yes — DiffView modal with confirm step |
| OQ-3 | Overview tab editability | Read-only structured summary — YAML tab is the edit surface |
| OQ-4 | Events default filter | Warning events only by default, toggle for all |
| OQ-5 | Command bar mode indicator | Single character `·` / `>` / `!` / `/` / `EDIT` / `DIFF` |
| OQ-6 | Search on labels | Deferred — label search via `label:key=value` prefix syntax, Spec 07 |

---

*Next: Spec 05 — Actions (Logs, Exec, Port-Forward)*
