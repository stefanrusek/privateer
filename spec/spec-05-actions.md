# Privateer — Actions Spec
**Spec:** 05-actions  
**Status:** Draft  
**Depends on:** Spec 01 (Architecture), Spec 02 (Navigation & Layout), Spec 04 (Core Views)

---

## 1. Goals

- Define log streaming UX including container selection, controls, and download
- Define exec/shell UX including command specification and container selection
- Define port-forward UX including multi-forward management
- Define the persistent Port-Forward Manager panel
- All actions are triggered from the resource list or detail pane

---

## 2. Action Triggers

| Action | Trigger (list focused) | Trigger (detail pane) |
|---|---|---|
| Logs | `l` on a Pod row | `Logs` tab |
| Exec | `x` on a Pod row | `[Exec]` button in Overview tab |
| Port-forward | `p` on a Pod or Service row | `[Port-Forward]` button in Overview tab |
| Delete | `d` on any row | `[Delete]` button in Overview tab |
| Port-forward manager | `!fwd` command or `F` key | — |

---

## 3. Logs

### 3.1 Container Selection

On triggering logs for a pod:

**Single running container** → open LogsTab directly, no picker.

**Multiple containers** → show inline picker in the command bar:

```
 Container: [order-api ●] [envoy-proxy ●] [config-reloader ○]  Escape to cancel
```

- `●` green = currently running
- `●` yellow = waiting / initializing  
- `○` grey = terminated
- Default selection: the single running container if only one is running; otherwise first running container
- Arrow keys or click to select, Enter to confirm
- Init containers shown after regular containers, labeled `(init)`

**All terminated** (post-mortem) → picker shown with all containers greyed, no default selection.

### 3.2 LogsTab Layout

```
 ╔══ Logs — order-api-7d9f-xk2p / order-api ═══════════════════════════════════╗
 ║  [order-api ▾]  [● Live]  [Timestamps]  [Wrap]  [100 lines ▾]  [Download]  ║
 ║ ─────────────────────────────────────────────────────────────────────────── ║
 ║  2026-06-09T14:22:01Z  INFO  Server listening on :8080                      ║
 ║  2026-06-09T14:22:02Z  INFO  Connected to database                          ║
 ║  2026-06-09T14:22:05Z  WARN  Retry attempt 1 for order-service              ║
 ║  2026-06-09T14:22:09Z  ERROR Failed to connect to payment-svc: timeout      ║
 ║                                                                              ║
 ║  [Search logs: /                                               ]             ║
 ╚══════════════════════════════════════════════════════════════════════════════╝
```

### 3.3 Log Controls

#### Container switcher (`[order-api ▾]`)
- Dropdown to switch between containers without closing the tab
- Same picker UI as §3.1 but inline in the toolbar

#### Live toggle (`[● Live]` / `[○ Paused]`)
- Default: Live (tailing the stream)
- Clicking pauses the stream — new lines stop appearing, scroll position locked
- `[● Live]` shown in green when active, `[○ Paused]` in grey when paused
- Scrolling up automatically pauses; a `[Resume live tail ↓]` button appears at the bottom when paused and new lines are available

#### Timestamps toggle (`[Timestamps]`)
- Default: on
- Toggles ISO 8601 timestamp prefix on each line
- State persisted per session

#### Word wrap toggle (`[Wrap]`)
- Default: off (long lines scroll horizontally)
- When on: lines wrap at pane width
- State persisted per session

#### Line limit / since picker (`[100 lines ▾]`)
Dropdown with options:
- Last 100 lines (default)
- Last 500 lines
- Last 1000 lines
- Last 5000 lines
- All available
- Since 15 minutes
- Since 1 hour
- Since 6 hours
- Since 24 hours

Changing the selection restarts the stream from the new offset.

#### Previous container logs
Shown as an additional option in the container switcher dropdown, below a divider:
```
 ── Previous instance ──
 order-api (previous)
```
Uses `previous: true` flag in the logs API call. Only shown if a previous terminated instance exists (`.status.containerStatuses[].restartCount > 0`).

#### Log search (`/`)
- Pressing `/` focuses the search bar at the bottom of the log pane
- Matches are highlighted inline in the log stream
- `n` / `N` to jump to next / previous match (vim convention)
- `Escape` clears search and returns focus to log stream
- Search works on buffered lines only (not historical lines outside the current line limit)

#### Download (`[Download]`)
- Writes current log buffer to `~/Downloads/p9r-logs-<podname>-<container>-<timestamp>.txt`
- Brief `✓ Saved to ~/Downloads/…` confirmation in command bar
- No dialog — immediate action

### 3.4 Log Rendering

- Lines are rendered as plain text, not parsed
- Log level colorization applied heuristically:
  - Lines containing `ERROR` or `FATAL` or `error` → red
  - Lines containing `WARN` or `WARNING` or `warn` → yellow
  - Lines containing `DEBUG` or `debug` → dim grey
  - All others → normal white
- Colorization is best-effort — not configurable in v1
- Timestamps (when shown) rendered in dim grey to reduce visual noise
- Maximum buffer: 10,000 lines in memory; older lines dropped as new ones arrive

---

## 4. Exec / Terminal

### 4.1 Container Selection

Same logic as logs (§3.1) — auto-select single running container, picker for multiple.

### 4.2 Command Specification

Before opening the terminal, show a command input in the command bar:

```
 Command: [/bin/bash                    ]  Enter to open  Escape to cancel
```

- Default: `/bin/bash`
- Editable — user can specify any command (e.g. `/bin/sh`, `python3`, `env`)
- History: last 10 commands persisted to `~/.config/p9r/exec-history`
- Up/down arrow keys cycle through history while input is focused
- Empty input not allowed — defaults to `/bin/bash` if cleared

### 4.3 Exec — suspend-and-handover (v1)

Embedding a PTY emulator inside the Ink-rendered pane is a project-sized subsystem (requires a headless terminal emulator and a custom Ink renderer for it). v1 instead uses the **suspend-and-handover** model — the same approach k9s uses:

1. User confirms container + command
2. Privateer suspends the Ink renderer, disables mouse reporting, and restores the terminal to its normal state
3. The raw TTY is wired directly to the k8s exec WebSocket stream (full PTY: window size negotiated, SIGWINCH forwarded on resize)
4. The user has a completely normal shell — `vim`, `top`, colors, everything works because nothing is being emulated
5. When the remote shell exits (or the connection drops), Privateer re-enables mouse reporting and resumes the Ink renderer exactly where it left off

Connection drop during a session prints a plain-text notice and returns to the TUI — reconnect is a fresh `x` invocation.

**Consequence:** there is no `Terminal` tab in the detail pane in v1, and no background/persistent sessions. Update to Spec 04 §4.2: the Terminal column is removed from the tab availability table; exec is reachable only via the `x` key / Overview action button.

### 4.4 Embedded TerminalTab (v2)

The in-pane terminal with persistent background sessions (session survives navigation, `Terminal ●` indicator, `[Keep running]` flow) is deferred to v2, contingent on integrating a headless terminal emulator (e.g. an xterm.js headless core) with an Ink rendering bridge.

---

## 5. Port-Forward

### 5.1 Trigger flow

On pressing `p` on a Pod or Service:

```
 Port-forward order-api-7d9f-xk2p
 Remote port: [8080      ]  Local port: [8080      ]  [Start]  Escape to cancel
```

- Remote port pre-populated from the pod/service's declared ports (if multiple, shows a dropdown)
- Local port defaults to match remote port; editable
- If local port is already in use, shows inline warning: `⚠ Port 8080 already in use — try 8081`
- Enter or `[Start]` launches the forward
- Implemented via `kubectl port-forward` subprocess (per Spec 01 §10 OQ-2)

### 5.2 Port-Forward Manager

A persistent overlay panel accessible from anywhere via `F` key or `!fwd` command.

```
 ╔══ Port Forwards ══════════════════════════════════════════════════════════╗
 ║                                                                           ║
 ║  ● localhost:8080  →  order-api-7d9f-xk2p:8080       default   [✕]      ║
 ║  ● localhost:5432  →  postgres-primary-0:5432         database  [✕]      ║
 ║  ✕ localhost:9090  →  prometheus-operated-0:9090      monitoring [retry] ║
 ║                                                                           ║
 ║  [+ New Forward]                                               [Close]   ║
 ╚═══════════════════════════════════════════════════════════════════════════╝
```

### 5.3 Port-Forward Manager — row states

| Indicator | Meaning |
|---|---|
| `●` green | Active and healthy |
| `●` yellow | Starting / connecting |
| `✕` red | Failed / disconnected |

### 5.4 Port-Forward Manager — actions

- **`[✕]`** — stop the forward (terminates kubectl subprocess); confirmation for active forwards
- **`[retry]`** — restart a failed forward
- **`[+ New Forward]`** — opens the same port picker UI as §5.1 but for any pod/service (shows a resource search input first)
- **`[Close]`** — closes the manager panel; forwards continue running

### 5.5 Port-Forward Manager — persistence

- Active forwards are listed in the manager for the lifetime of the p9r process
- Forwards are **not** persisted across restarts (kubectl subprocesses die with the parent)
- The manager remembers the last 10 forwards (pod name, ports) for quick re-establishment after restart — shown as a "Recent" section:

```
 RECENT
 localhost:8080  →  order-api:8080       default   [Restore]
 localhost:5432  →  postgres-primary:5432  database  [Restore]
```

### 5.6 Port-Forward subprocess management

Each active port-forward spawns a `kubectl port-forward` subprocess:

```
kubectl port-forward pod/<name> <local>:<remote> -n <namespace>
```

- Subprocess stdout/stderr is monitored; failures detected and reflected in manager status
- On p9r exit: all kubectl subprocesses are explicitly terminated (SIGTERM)
- A failed pod (evicted, deleted) causes the forward to fail — manager shows `✕` with the reason

### 5.7 Status bar indicator

When any port-forward is active, a persistent indicator appears in the command bar status area:

```
 ctx: my-cluster  ns: default  Pods  ⇄ 2  ·  ask anything or !command
```

`⇄ 2` — 2 active forwards. Clicking opens the Port-Forward Manager.

### 5.8 Quit guard

If any port-forwards are active, `q` and `!q` show an inline confirmation:

```
 2 port-forwards active. Quit anyway? [Quit] [Cancel]
```

Default selection: Cancel. `Ctrl+C` remains an immediate quit in all cases (escape hatch, per Spec 02 §8.2) — all kubectl subprocesses are still terminated cleanly via SIGTERM on exit.

---

## 6. Delete

### 6.1 Trigger

`d` key on a selected resource row, or `[Delete]` button in Overview tab.

### 6.2 Confirmation

Inline in command bar (per Spec 04 §12):

```
 Delete Pod order-api-7d9f-xk2p? [Delete] [Cancel]
```

- Default selection: Cancel
- For Deployments, StatefulSets — clarify what delete means:
  ```
  Delete Deployment order-api? This will remove the deployment and all its pods. [Delete] [Cancel]
  ```

### 6.3 Execution

- Calls k8s DELETE API directly via `@kubernetes/client-node`
- Watch stream picks up the DELETED event and removes the row with fade animation
- On error: show error in command bar (e.g. `✗ Delete failed: forbidden`)

### 6.4 Cascade behavior

- Default: foreground deletion (k8s default cascade)
- No option for orphan/background in v1 — standard delete only

---

## 7. Resolved Decisions

| # | Question | Decision |
|---|---|---|
| OQ-1 | Container auto-selection for logs/exec | Auto-select single running container; picker for multiple or all-terminated |
| OQ-2 | Log controls scope | Full set: container switch, live toggle, timestamps, wrap, line limit, previous instance, search, download |
| OQ-3 | Exec default command | `/bin/bash`; user-specifiable with history |
| OQ-4 | Port-forward concurrency | Multiple simultaneous; managed via Port-Forward Manager panel |
| OQ-5 | Port-forward implementation | `kubectl port-forward` subprocess per Spec 01 |
| OQ-6 | Forward persistence across restarts | Not persisted; recent forwards shown for quick restore |
| OQ-7 | Delete cascade | Standard foreground cascade only in v1 |
| OQ-8 | Exec rendering | Suspend-and-handover (k9s model) in v1; embedded TerminalTab deferred to v2 |
| OQ-9 | Quit with active forwards | Inline confirmation; Ctrl+C bypasses |

---

*Next: Spec 06 — Metrics*
