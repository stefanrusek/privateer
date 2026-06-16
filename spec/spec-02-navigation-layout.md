# Privateer — Navigation & Layout Spec
**Spec:** 02-navigation-layout  
**Status:** Draft  
**Depends on:** Spec 01 (Architecture)

---

## 1. Goals

- Three-region layout: sidebar, resource list, detail pane
- Keyboard-first navigation with full mouse support
- Resizable regions with sensible defaults
- Persistent command bar for context and keybind hints
- Namespace filter and text search always accessible

---

## 2. Overall Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  Left Sidebar     │  Namespace Filter  [all ▾]  Search [      ] │
│  (resource tree)  ├──────────────────────────────────────────────│
│                   │                                              │
│                   │  Resource List (center top)                  │
│                   │                                              │
│  ~20% width       │                                              │
│  resizable        ├──────── drag handle ──────────────────────── │
│                   │                                              │
│                   │  Detail / Edit Pane (center bottom)          │
│                   │  [hidden when nothing selected]              │
│                   │                                              │
├───────────────────┴──────────────────────────────────────────────│
│  Command Bar                                                     │
└──────────────────────────────────────────────────────────────────┘
```

### Region summary

| Region | Default size | Resizable | Hidden state |
|---|---|---|---|
| Left sidebar | 20% terminal width | Yes, horizontal drag | Never hidden |
| Center top (list) | 60% of remaining height | Yes, vertical drag | Never hidden |
| Center bottom (detail) | 40% of remaining height | Yes, vertical drag | Hidden until selection |
| Command bar | 1 row | No | Never hidden |
| Header bar | 1 row | No | Never hidden |

---

## 3. Left Sidebar — Resource Tree

### 3.1 Structure

Resources are grouped into logical categories matching how Lens organizes them. Each category is collapsible.

```
▼ Workloads
    Deployments
    StatefulSets
    DaemonSets
    ReplicaSets
    Pods
    Jobs
    CronJobs
▼ Networking
    Services
    Ingresses
    NetworkPolicies
▼ Configuration
    ConfigMaps
    Secrets
    HorizontalPodAutoscalers
▼ Storage
    PersistentVolumeClaims
    PersistentVolumes
    StorageClasses
▼ Access Control
    ServiceAccounts
    Roles
    RoleBindings
    ClusterRoles
    ClusterRoleBindings
▼ Nodes
    Nodes
▼ Namespaces
    Namespaces
▼ Custom Resources
    <CRD groups discovered at runtime>
```

### 3.2 Behavior

- **Expand/collapse** — click or arrow keys on category row
- **Select resource type** — click or Enter on a leaf node; loads that resource type into the center top list
- **Active item** — highlighted with a distinct background; persists across namespace filter changes
- **CRDs** — discovered at startup via the `apiextensions.k8s.io` API; grouped under Custom Resources by group name
- **Counts** — each leaf node shows a count badge (e.g. `Pods  42`). For core always-watched kinds (Spec 01 §3.1) the count is live from the State Store and reflects the current namespace filter. For on-demand kinds the badge shows a cluster-wide count from a periodic metadata-only LIST (60s), rendered dimmed; it becomes live and filter-aware once that kind's watch stream is open
- **Error state** — if a resource type returns 403, show a lock icon next to it; still selectable, shows permission error in list view

### 3.3 Sizing

- Default width: 20% of terminal width, minimum 18 characters, maximum 40% of terminal width
- Resize handle: the vertical border between sidebar and center; draggable with mouse, or keyboard shortcut `Alt+Left` / `Alt+Right` to nudge by 1 column
- Width persisted to `~/.config/p9r/config.yaml` on change

---

## 4. Header Bar

Single row above the center pane. Always visible.

```
 Namespace: [all namespaces ▾]    Search: [                    ]
```

### 4.1 Namespace Filter

- Dropdown showing all namespaces discovered from the cluster
- Options: `all namespaces` (default), or any specific namespace
- Selecting a namespace filters the resource list and all count badges in the sidebar
- Keyboard: `n` from normal mode opens the namespace picker; arrow keys + Enter to select
- Mouse: click to open dropdown

### 4.2 Text Search

- Live filter on the resource list — matches against resource name (and optionally labels)
- Clears on resource type change
- Keyboard: `/` from normal mode focuses the search field (vim convention)
- `Escape` clears search and returns focus to the list
- Mouse: click to focus

---

## 5. Center Top — Resource List

Displays the list of resources for the currently selected resource type, filtered by namespace and search.

- Tabular layout: columns vary by resource type (defined in Spec 03)
- Rows are selectable; selected row is highlighted
- Single click or Enter → loads detail into center bottom pane (opens it if hidden)
- Live updates via watch stream — new/modified/deleted rows animate subtly (no jarring redraws)
- Sortable columns: click column header or `s` + column number to sort
- Scrollable: mouse scroll or arrow keys / `j` / `k`
- Multi-select: deferred to v2 (reserved key: `v`, visual-select). `Space` is reserved globally for agent command bar focus.

### 5.1 Row Status Indicators

Each row has a leading status indicator column:

| Symbol | Meaning |
|---|---|
| `●` green | Running / Ready / Healthy |
| `●` yellow | Pending / Progressing |
| `●` red | Error / CrashLoopBackOff / Failed |
| `●` grey | Unknown / Terminating |

---

## 6. Center Bottom — Detail / Edit Pane

Hidden by default. Opens when a resource is selected in the list.

### 6.1 Pane sizing

- Default split: 60% list / 40% detail when opened
- Drag handle between list and detail is a horizontal rule; draggable with mouse or `Alt+Up` / `Alt+Down`
- Split ratio persisted per resource type in config
- Close: `Escape` when focus is in the detail pane, or click the `✕` in the pane header

### 6.2 Content

The detail pane hosts tabbed content. Tabs vary by resource type but the common set is:

| Tab | Content |
|---|---|
| Overview | Key fields rendered as structured form (not raw YAML) |
| YAML | Full resource YAML, syntax highlighted, editable |
| Events | Kubernetes events for this resource |
| Logs | For Pod resources only — log stream (see Spec 05) |
| Terminal | For Pod resources only — exec shell (see Spec 05) |
| Metrics | If Prometheus available — inline metrics for this resource |

- Tab navigation: mouse click, or `Tab` / `Shift+Tab`, or number keys `1`–`6`
- Active tab persisted per resource type

### 6.3 YAML Edit Mode

- YAML tab is read-only by default
- Press `e` or click `Edit` button to enter edit mode
- Edit mode: cursor appears in YAML, full keyboard editing
- `Ctrl+S` to apply — `replace` (PUT) via the k8s API, per Spec 04 §6.3
- `Escape` to cancel and discard changes
- Diff view shown before apply: changed lines highlighted

---

## 7. Command Bar

Single row at the bottom of the terminal. Always visible.

```
 ctx: my-cluster   ns: default   Pods      > ask anything or !command
```

The command bar is **agent-first**. Typing anything sends a natural language query to the Agent Layer. Raw commands are prefixed with `!`.

### 7.1 Left side (status)

- **Context** — active kubeconfig context name; clickable to open context switcher
- **Namespace** — active namespace filter; mirrors the header bar dropdown  
- **Resource type** — currently selected resource type in the sidebar

### 7.2 Right side (input)

- Default prompt: `> ask anything or !command`
- **Focus:** `Space` from normal mode (when list or sidebar is focused) opens the command bar input
- **Escape:** dismisses input, returns focus to previous pane
- **Enter:** submits query or command

### 7.3 Natural language input (default)

Anything typed without a `!` prefix is sent to the Agent Layer as a natural language query.

Examples:
```
show me the order pods
find the pod that is crashing
how many pods are in error state
which namespace has the most deployments
```

Agent responses are one of:
- **Navigation** — sidebar and filters update, command bar clears
- **Filter** — namespace/search fields update, command bar clears  
- **Answer** — response text appears inline in the command bar for ~5 seconds, then fades

### 7.4 Command input (`!` prefix)

| Command | Action |
|---|---|
| `!ctx` | Open context switcher |
| `!ns <name>` | Switch namespace |
| `!q` / `!quit` | Quit |
| `!<resource>` | Navigate directly to resource type (e.g. `!pods`, `!deploy`) |

### 7.5 Mode indicator

A subtle indicator on the left of the input area shows current mode:

| Mode | Indicator |
|---|---|
| Normal (bar unfocused) | dim `>` |
| Agent input | bright `>` |
| Command input (after `!`) | bright `!` |
| Edit mode (YAML pane) | yellow `EDIT` |
| Search mode (`/` active) | bright `/` |

*Full mode indicator design deferred to Spec 04.*

---

## 8. Keyboard Navigation Model

Privateer uses a **modal input model** similar to vim, but deliberately minimal.

The overarching rule: **`Tab` / `Shift+Tab` move *between* regions; the arrow
keys act *within* the focused region.** Nothing else changes focus except a
mouse click and opening the detail pane (which focuses it). In particular:

- The arrow keys never jump focus to a different region.
- In the **list**, `←` / `→` horizontally scroll the table (§5).
- In the **detail** pane, `←` / `→` switch to the previous / next tab and
  `↑` / `↓` scroll the tab content (Spec 04 §4.1).
- In the **sidebar**, `←` / `→` collapse / expand (§8.4) — unchanged.
- Opening the detail pane (Enter, `e`, `l`, second click on a selected row,
  agent auto-open) sets focus to the detail pane, so the keys you type next go
  to the thing you just opened (e.g. `/` in the Logs tab opens the Logs search,
  not the global resource-list search).

### 8.1 Modes

| Mode | Description |
|---|---|
| **Normal** | Default. Arrow keys navigate lists and tree. Shortcut keys active. |
| **Search** | Entered via `/`. Typing filters the list. |
| **Command** | Entered via `:`. Typing enters a command. |
| **Edit** | Entered via `e` in YAML tab. Full text editing. |

Mode is shown in the command bar (detail deferred to Spec 04).

### 8.2 Global keybindings (Normal mode)

| Key | Action |
|---|---|
| `?` | Toggle help overlay |
| `q` | Quit — from **every** region in normal mode (port-forward quit-confirm still applies). A literal `q` while a text input is active (search / command / YAML edit / Logs search) is typed, not a quit. |
| `Escape` | Close the detail pane when it is open (focus returns to the list); cancel an active search / command / edit mode otherwise. `Escape` never quits the app. |
| `/` | Focus search |
| `n` | Open namespace picker |
| `Space` | Focus command bar (agent input) |
| `Tab` | Cycle focus between regions: sidebar → list → detail → sidebar (detail included only while it is open). Works from every region, **including** the detail pane. |
| `Shift+Tab` | Cycle focus reverse |
| `r` | Refresh current resource list |
| `Ctrl+C` | Quit (always, any mode) |

### 8.3 List keybindings (Normal mode, list focused)

| Key | Action |
|---|---|
| `j` / `↓` | Move down |
| `k` / `↑` | Move up |
| `Enter` | Open detail pane for selected row |
| `d` | Delete selected resource (confirm dialog) |
| `e` | Open YAML editor for selected resource |
| `l` | Open logs (pods only) |
| `x` | Exec shell (pods only) |
| `p` | Port-forward (pods/services) |
| `y` | Copy resource name to clipboard |
| `Ctrl+F` | Page down |
| `Ctrl+B` | Page up |
| `gg` | Jump to top (multi-key sequence; 500ms buffer per Spec 01 §3.5) |
| `G` | Jump to bottom |

### 8.4 Sidebar keybindings (Normal mode, sidebar focused)

| Key | Action |
|---|---|
| `j` / `↓` | Move down |
| `k` / `↑` | Move up |
| `Enter` / `→` | Expand category or select resource type |
| `←` | Collapse category |
| `h` | Collapse all categories |
| `l` | Expand all categories |

---

## 9. Mouse Support

All interactive elements support mouse interaction:

| Element | Mouse action |
|---|---|
| Sidebar items | Click to select / expand |
| Sidebar resize handle | Click and drag |
| List rows | Click to select, double-click to open detail |
| List column headers | Click to sort |
| Detail pane tabs | Click to switch |
| Detail resize handle | Click and drag |
| Namespace dropdown | Click to open |
| Search field | Click to focus |
| Command bar context | Click to open context switcher |
| Scroll anywhere | Mouse wheel |

---

## 10. Context Switcher

Triggered by `:ctx` command or clicking context name in command bar.

- Full-screen overlay (modal)
- Lists all contexts from kubeconfig
- Current context highlighted
- Search/filter by typing
- Select with Enter or click
- Escape to cancel

---

## 11. Help Overlay

Triggered by `?`. Full-screen overlay showing all keybindings organized by mode and context. Dismiss with `?` or `Escape`.

---

## 12. Resolved Decisions

| # | Question | Decision |
|---|---|---|
| OQ-1 | Command bar mode indicator design | Subtle single-character indicator (`>`, `!`, `/`, `EDIT`); full design in Spec 04 |
| OQ-2 | Search match on labels/annotations? | Deferred to Spec 04; likely opt-in via `label:` prefix syntax |

---

*Next: Spec 03 — Resource Model*
