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

All five regions are bordered and the borders **collapse** into one connected
grid (Option A): a full-width header across the top, a full-width command bar
across the bottom, a full-height sidebar on the left, and the list stacked above
the detail pane in the right column. Adjacent regions share a single border line
with correct box-drawing junctions (`┬ ┴ ├ ┤ ┼`).

```
┌────────────────────────────────────────────────────────────────────┐
│ docker-desktop  ns: [default ▾]                          /<search>  │  header (full width)
├──────────────────┬─────────────────────────────────────────────────┤
│  Left Sidebar    │  Resource List (center top)                      │
│  (resource tree) │                                                  │
│  ~20% width      ├───────────────────────────────────────────────── │  ← list│detail line (V resize)
│  resizable       │  Detail / Edit Pane (center bottom)              │
│                  │  [hidden when nothing selected]                  │
├──────────────────┴─────────────────────────────────────────────────┤
│  Command Bar                                                        │  (full width)
└────────────────────────────────────────────────────────────────────┘
         ↑ sidebar│right line = horizontal resize handle
```

The **focused** region is drawn with a **double-line, accent-coloured** border
and a bold title; unfocused regions are single dim lines. Because a double-line
glyph occupies exactly one cell, switching focus changes only border weight,
colour, and title style — **never any region's position or size** (no reflow).
When detail is closed the list fills the right column and there is no list│detail
line; the sidebar│right line (the horizontal-resize handle) always exists.

### Region summary

| Region | Default size | Resizable | Hidden state |
|---|---|---|---|
| Left sidebar | 20% terminal width | Yes, horizontal drag | Never hidden |
| Center top (list) | 60% of remaining height | Yes, vertical drag | Never hidden |
| Center bottom (detail) | 40% of remaining height | Yes, vertical drag | Hidden until selection |
| Command bar | 1 row | No | Never hidden |
| Header bar | 1 row | No | Never hidden |

### 2.1 Geometry — single source of truth

All region sizes and positions are computed by one pure module,
`src/ui/layout-geometry.ts`. `computeFrame({ columns, rows, sidebarRatio,
verticalRatio, showDetail })` returns the **inner content `Rect`** of every
region (header, sidebar, list, detail, command bar) plus the two shared border
**`Segment`** handles (sidebar│right vertical, list│detail horizontal). Every
consumer derives from it — `controller.tableWidth()` = `frame.list.width`,
`controller.visibleHeight()` = `frame.list.height`, the sidebar width =
`frame.sidebar.width`, and the metrics chart width = `min(frame.detail.width,
MAX_CHART_WIDTH)`. No consumer performs geometry arithmetic of its own.

The frame is **border-aware**: it accounts for one column/row per frame edge and
counts shared (collapsed) edges once. There is **no `max(60, …)`-style floor**
that could exceed the real pane: when the terminal is too small, inner
dimensions clamp toward documented minimums and content is **truncated**, never
wrapped. The list and the metrics charts therefore never wrap or spill at any
terminal size, detail pane open or closed. Ratios are clamped (sidebar
0.1–0.4, vertical 0.2–0.8) and the sidebar inner width is floored at 18
columns.

The collapsed-grid **renderer** is the pure frame model `src/ui/frame.ts`:
`computeBorderGrid({ frame, columns, rows, focus })` emits a 2-D grid of
box-drawing glyphs (border cells and blank content windows), drawing the
focused region's border ring at double weight and resolving mixed
single/double junctions (`╞ ╡ ╤ ╧ ╪ ╫ ╟ ╢ ╓ ╖ ╘ ╛` …, falling back to the
all-single shape for the few 3-way-mixed corners Unicode lacks). Every junction
glyph is verified width-1 so switching focus weight causes zero reflow. The thin
Ink renderer (`src/ui/components/FrameChrome.tsx`) slices this grid into bands
and strips and composites each region's content into its window — it carries no
glyph or geometry decisions of its own.

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

Full-width single row across the top of the collapsed grid. Always visible. It
shows, left to right: the **current context**, the **namespace** filter, and the
**search** field (right-aligned).

```
 docker-desktop  ns: [default ▾]                          /<search>
```

- The **context** chip sits to the left of the namespace and is rendered as a
  distinct inline element (chunk 04 wraps it as a `<Button>` that opens the
  context switcher; today `!ctx`/`c` open it). Its value is `state.context`.
- The **namespace** and **search** are the inline elements described below.

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
- Vertically scrollable: mouse scroll or `↑` / `↓` / `j` / `k`
- Horizontally scrollable: `←` / `→` pan the columns (§5.2)
- Multi-select: deferred to v2 (reserved key: `v`, visual-select). `Space` is reserved globally for agent command bar focus.

### 5.1 Row Status Indicators

Each row has a leading status indicator column:

| Symbol | Meaning |
|---|---|
| `●` green | Running / Ready / Healthy |
| `●` yellow | Pending / Progressing |
| `●` red | Error / CrashLoopBackOff / Failed |
| `●` grey | Unknown / Terminating |

### 5.2 Horizontal scrolling (natural-width viewport)

When a resource kind has more column width than fits the list pane, the list is
a horizontal **window** over fixed, **natural-width** columns — columns are
never squeezed or wrapped to fit; the pane clips them and `←` / `→` pan the
hidden ones into view.

- **Natural widths** are stable and data-independent: fixed-width columns keep
  their width; percentage-width columns (Spec 03) resolve against a constant
  baseline (`LIST_BASELINE_WIDTH` = 120), *not* the live pane width, so the
  layout never jitters as rows arrive or as the user scrolls.
- The leading **status dot + `Name`** columns are **pinned**: they always render
  at the left at their natural widths and never scroll. (A kind with no `Name`
  column pins only the status column.) The remaining columns pan together as one
  unit.
- `→` advances the horizontal offset by one column, `←` retreats it; both snap
  to column boundaries (headers stay aligned) and both clamp. The maximum offset
  lands the final column flush against the right edge — you cannot scroll blank
  space in past it. When the natural total fits the pane, `←` / `→` are no-ops.
- When columns are hidden, a `‹` marker shows at the pinned/scrollable boundary
  (more to the left) and a `›` at the right edge (more to the right); each
  occupies one header cell and shifts no data column.
- The horizontal offset **resets to 0 when the active kind changes** (the column
  set differs) and **persists** across vertical scroll, selection, sort, and
  search within the same kind.

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

All mouse gestures come from a **single SGR stdin stream** parsed by
`parseSgrMouse`/`parseSgrMouseChunk` and routed through one pure `dispatch`
reducer over a frame-derived hit-region registry (no ink-mouse, no second
parser). Mouse reporting enables modes 1000h (click) + 1002h (button-held
motion) + 1006h (SGR); any-motion 1003h stays **off**; **every** mouse mode is
hard-disabled on quit/suspend/exit so escape sequences never leak into the
shell.

| Element | Mouse action |
|---|---|
| Sidebar items | Click to select / expand |
| Sidebar resize handle | Click and drag (±1-cell grab tolerance, latched) |
| List rows | Click to select; a second click on the already-selected row opens detail |
| List column headers | Click to sort |
| Detail pane tabs | Click to switch |
| Detail resize handle | Click and drag (±1-cell grab tolerance, latched) |
| Header **namespace** chip | Click to open the namespace picker |
| Header **context** chip | Click to open the context switcher |
| Search field | Click to focus |
| Scroll wheel | Scrolls the region **under the cursor** (sidebar / list / detail), independent of keyboard focus; detail Logs pause/resume tail accordingly |

---

## 10. Context Switcher

Triggered by the **`c`** key, the `!ctx` command, or clicking the header
**context** chip (`<Button>`).

- Full-screen overlay (modal)
- Lists all contexts from kubeconfig
- Current context highlighted
- Search/filter by typing
- Select with Enter or click
- Escape to cancel

Selecting a context **closes the switcher immediately** and hands feedback to
the header: it shows `… connecting to <ctx>` until the first stream sync clears
it, or — on a connection failure — a persistent banner
`✗ Could not connect to <ctx>: <reason>` with **[Retry]** (re-runs the
connection) and **[Switch context]** (reopens the switcher). Switching to the
current context is a no-op.

Per-context memory: the `{ namespace, activeKind }` last viewed in each context
is remembered and restored on return — validated against the new cluster, with
Overview / all-namespaces fallbacks when a remembered kind/namespace is absent —
persisted in `~/.config/p9r/layout.json` under a `contexts` map (tolerant of the
old schema).

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
