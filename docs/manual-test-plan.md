# p9r Manual Test Plan

An exhaustive, agent-executable manual test plan for the p9r Kubernetes TUI
(version **0.3.0**). Derived from `src/ui/keymap.ts` (the authoritative binding
registry), `specs/navigation-overhaul/`, `spec/spec-0*.md`, and `features/`.

Each test has an **ID**, **Area**, **Preconditions**, **Steps** (exact
keys/mouse), **Expected** (specific/checkable), and a blank **Result** for the
executor to fill in `PASS` / `FAIL` + notes. Tests that require a live cluster
are marked **[CLUSTER]**; tests that work with no/empty cluster are **[NO-CLUSTER]**.

---

## 0. Setup & harness

All tests are driven through `tmux` against the real app.

### Launch

```sh
# Standard launch (needs a kube context; docker-desktop or kind in dev)
tmux new-session -d -s p9r -x 170 -y 50 \
  'export PATH="/opt/homebrew/bin:$HOME/go/bin:$HOME/.bun/bin:$PATH"; bun run start 2>/tmp/p9r-err.txt; sleep 1200'

# Give Ink time to mount, then capture (with SGR colour) and a colour-stripped copy:
tmux capture-pane -e -p -t p9r > /tmp/p9r-cap-color.txt          # keep colour for border/dim checks
tmux capture-pane -p -t p9r | sed 's/\x1b\[[0-9;]*m//g' > /tmp/p9r-cap.txt   # plain text
```

### Sending input

- Ordinary keys: `tmux send-keys -t p9r 'j'` (chars), `tmux send-keys -t p9r Enter`.
- **Space MUST be sent by name:** `tmux send-keys -t p9r Space` (never `' '`).
- Modifiers: `tmux send-keys -t p9r C-c` (Ctrl+C), `C-f`, `C-s`, `C-e`, `C-b`.
- Arrows: `tmux send-keys -t p9r Up` / `Down` / `Left` / `Right`.
- `Tab` / `BTab` (Shift+Tab), `PageUp` / `PageDown`, `Escape`.
- Multi-key chords like `g g`: send `g` twice in quick succession:
  `tmux send-keys -t p9r 'gg'` (the controller splits multi-char chunks).
- Capital letters (`G`, `N`, `P`, `F`): `tmux send-keys -t p9r 'G'`.
- Punctuation: `'!'`, `'/'`, `'?'`, `'+'`, `'-'`, `'['`, `']'`.

### Injecting SGR mouse (X = column, Y = row, 1-based as shown on screen)

- **Left click:** press `tmux send-keys -t p9r -l $'\e[<0;X;YM'` then release `tmux send-keys -t p9r -l $'\e[<0;X;Ym'`.
- **Wheel up:** `tmux send-keys -t p9r -l $'\e[<64;X;YM'`
- **Wheel down:** `tmux send-keys -t p9r -l $'\e[<65;X;YM'`
- **Drag:** press `$'\e[<0;X;YM'`, then motion `$'\e[<32;X2;Y2M'` (32 = left button held + motion), then release `$'\e[<0;X2;Y2m'`.

### Clean-config-home trick (to force first-run / model chooser)

```sh
# Point XDG/HOME config at a throwaway dir so ~/.config/p9r is empty:
HOME=$(mktemp -d) ... bun run start          # or set XDG_CONFIG_HOME to an empty dir
```
Use a temp `HOME`/`XDG_CONFIG_HOME` so `~/.config/p9r/{config.yaml,layout.json,
exec history,models,debug.log}` is absent → first-run model chooser appears.
To test "normal launch" use the real (already-configured) home.

### Error / loop watchdog (run after EVERY test that changes state)

```sh
grep -n "Maximum update depth\|render loop\|stack\|Error:\|TypeError\|at Object\." /tmp/p9r-err.txt
```
Any hit (especially **`Maximum update depth`** — the Button render-loop
regression) is an automatic **FAIL** for the test in progress.

### Teardown / between tests

- Quit cleanly with `q`, then verify the shell prompt is clean (no leftover
  escape sequences — mouse modes must be restored). Re-launch fresh per group.
- `tmux kill-session -t p9r` at the end.

### Reading the frame

The frame is a **single connected bordered grid** (collapsed borders):
full-width header (top), full-height sidebar (left), list + detail panes
(centre/right), full-width command bar (bottom). The **focused** region has a
**double-line accent border**; all others are **single/dim**. Use the
colour capture (`/tmp/p9r-cap-color.txt`) to confirm the double-line accent and
dim borders; use the plain capture for text content.

---

## 1. Launch & first-run

| ID | Area | Pre | Steps | Expected | Result |
|----|------|-----|-------|----------|--------|
| LR-01 | version **[NO-CLUSTER]** | — | Run `bun run start -- version` (or `dist/p9r version`) | Prints exactly `0.3.0` and exits 0 | PASS — prints `p9r 0.3.0`, exit 0 |
| LR-02 | model chooser **[NO-CLUSTER]** | Clean config home (temp HOME/XDG) | Launch | First-run **ModelChooser** screen renders (not the main grid); lists selectable models; arrow keys move highlight | PASS — ModelChooser renders with Gemma/Qwen/No-agent; ↑/↓ move highlight |
| LR-03 | model chooser select **[NO-CLUSTER]** | LR-02 showing | `Down`/`Up` to a model, `Enter` | Selection accepted; proceeds to download/main flow; no crash | PASS — picked "No agent", proceeded to main grid, no crash |
| LR-04 | model chooser quit **[NO-CLUSTER]** | LR-02 showing | `q` | App quits cleanly; shell prompt clean | PASS — q quit cleanly, no stderr errors |
| LR-05 | normal launch **[CLUSTER]** | Real config home, valid context | Launch | Main bordered grid renders: header, sidebar, list, command bar; no chooser; resource list populates within a few seconds | PASS — grid renders, no chooser, sidebar tree + Overview health populate |
| LR-06 | Esc never quits **[CLUSTER]** | Main grid, list focused, no overlay/detail | Press `Escape` | App does **not** quit; remains on main grid (Esc only closes detail/cancels input) | PASS — Esc kept the grid up, app still running |
| LR-07 | q quits — list **[CLUSTER]** | List focused | `q` | App quits cleanly; shell clean | **FAIL (process leak)** — `q` unmounts the UI (screen restores) BUT the bun process does NOT exit: the Prometheus SystemTunnel `kubectl port-forward service/prometheus 39090:9090` is left running (never closed in `dispose()`), keeping the event loop alive. Verified: after `q`, no shell prompt returns and `bun run bin/p9r.ts` + the kubectl child stay alive indefinitely. (UI teardown is clean; the leak is the failure.) Severity: FUNCTIONAL (hang-on-quit when Prometheus tunnel active). |
| LR-08 | q quits — sidebar **[CLUSTER]** | `Tab` to sidebar | `q` | Quits cleanly | **FAIL (same root cause as LR-07)** — UI unmounts but process hangs on the leaked Prometheus kubectl port-forward. Focus region is irrelevant; all `q` paths hit the leak. |
| LR-09 | q quits — detail **[CLUSTER]** | Open detail (Enter on a row), detail focused | `q` | Quits cleanly | **FAIL (same root cause as LR-07)** — UI unmounts but process hangs on the leaked Prometheus kubectl port-forward. |
| LR-10 | q quits — command bar context **[CLUSTER]** | `Tab` to command bar (NOT in input mode) | `q` | Quits cleanly | N/A — command bar is NOT Tab-reachable (cycle is sidebar↔list↔detail per navigation.ts); cannot enter a non-input command-bar focus to execute as written. q quits in normal mode regardless. |
| LR-11 | Ctrl+C quits any mode **[CLUSTER]** | While command-bar **input** mode active (`!` pressed, typing) | `C-c` | Quits cleanly (Ctrl+C quits from any mode, even input) | PASS — literal ETX (`send-keys -l $'\003'`) quit from `[!]` input mode and the process DID fully terminate. NOTE: Ctrl+C works only because the ETX delivers SIGINT to the whole process group, which also kills the leaked kubectl child — masking the LR-07 quit-leak bug. tmux `send-keys C-c` did NOT deliver the byte; use `-l $'\003'`. |
| LR-12 | q is literal in input **[CLUSTER]** | `!` opens command input | Type `q` | A `q` character is entered into the input — does **not** quit (q only quits outside input modes) | PASS — `!`+`q` shows `!q` in the input, app stays up |
| LR-13 | mouse modes restored on quit **[CLUSTER]** | Main grid | `q`, then in the shell run `printf 'test\n'` and move mouse | No stray `\e[<…` escape sequences leak into the shell; terminal mouse reporting is off | PASS (best-effort) — after q the pane returned to a clean zsh prompt with no escape garbage; direct DEC-mode inspection is limited under tmux capture but shell was clean |

---

## 2. Frame, focus & header chrome

All **[CLUSTER]** unless noted. Use the colour capture to verify border style.

| ID | Area | Pre | Steps | Expected | Result |
|----|------|-----|-------|----------|--------|
| FR-01 | collapsed grid | Main grid | Capture frame | One connected bordered grid: **full-width header** spans the top; **full-height sidebar** on the left; list+detail in the centre/right; **full-width command bar** at the bottom. Borders are collapsed (shared lines, no gaps) | PASS — single connected grid, full-width header/command bar, full-height sidebar, list+detail right; collapsed shared borders. NOTE: detail opens as list-top / detail-bottom in the right column (not side-by-side), still inside the right region. |
| FR-02 | initial focus | Fresh launch | Capture colour frame | Exactly one region has the **double-line accent** border (the focused region — list by default); all others single/dim | PASS — exactly one region accented. NOTE: default focus is **sidebar** (not list); sidebar border = bold cyan `║`, others dim `│`. |
| FR-03 | Tab cycles forward | List focused | `Tab` repeatedly, capturing after each | Focus advances through regions in a fixed cycle (e.g. sidebar → list → detail (if open) → command bar → header → …); accent border moves to the newly focused region each press | PASS — Tab cycles sidebar→list→detail(when open)→sidebar; accent moves each press. Command bar/header are NOT in the cycle (by design, navigation.ts) — the "…→ command bar → header" in the Expected is illustrative only. |
| FR-04 | Shift+Tab cycles back | After FR-03 | `BTab` repeatedly | Focus moves in the reverse order through the same cycle | PASS — BTab reverses the cycle |
| FR-05 | zero layout movement on focus | Note exact column/row of every border in capture | `Tab` through all regions, capture each | Border positions and region sizes are **byte-identical** across focus changes — only the border STYLE/colour changes, never geometry. No region grows/shrinks/shifts | PASS — after normalizing glyph style, captures are byte-identical pre/post Tab; only the `⌖ region` label and border style/colour change |
| FR-06 | focused = double-line, others dim | Any focus state | Inspect colour capture | Focused region border uses the accent colour + double-line glyphs; unfocused borders are dim single-line | PASS — focused = `\e[1m\e[36m` bold cyan double-line `║`; unfocused = `\e[2m` dim single-line `│` |
| FR-07 | header context chip placement | Main grid | Inspect header row | A **context chip** (showing current context, with `c̲:` accelerator prefix badge) sits **left of** the namespace dropdown in the header | PASS (with note) — context chip `docker-desktop` sits left of `ns: [all ▾]`, with the `c` accelerator underlined (`\e[4mc`). The spec describes a `c̲:` *prefix badge*; actual renders the underline on the `c` inside the context name (no separate `c:` badge). VISUAL/MINOR mismatch. |
| FR-08 | header namespace dropdown present | Main grid | Inspect header | A namespace **DropdownButton** (`[<ns> ▾]` style) appears in the header, right of the context chip | PASS — `[all ▾]` dropdown present, right of context chip |
| FR-09 | command bar mode indicator | Main grid | Inspect command bar | Bottom bar shows `ctx:`, `ns:`, resource kind, a mode glyph `[·]` (normal), and dim hint text when not focused | PASS — shows `ctx: docker-desktop`, `ns:` (blank when all-ns), kind (`Overview`/`Pods`), `[·]` glyph (dim gray), dim hints (Space agent / search / help / quit). MINOR: `ns:` value blank in all-namespaces while header shows `[all ▾]`. |
| FR-10 | command bar focus | `Tab` to command bar | Capture | Command bar shows accent border; mode indicator bolded | N/A as written — command bar is not Tab-reachable; it only "focuses" by entering input mode via `!`/`Space`, where the bar shows `[!]`/agent prompt accent (verified in CB-02). No passive non-input command-bar focus exists. |

---

## 3. Sidebar

| ID | Area | Pre | Steps | Expected | Result |
|----|------|-----|-------|----------|--------|
| SB-01 | focus sidebar | Main grid | `Tab` until sidebar accented | Sidebar gets double-line accent; a focus hint is visible | PASS — sidebar accented by default, `⌖ sidebar` hint in command bar |
| SB-02 | move down j/↓ | Sidebar focused | `j`, then `Down` | Highlight moves down one row each; entries are kind categories/kinds | PASS — j and Down each move highlight down one row (Overview→Workloads→Deployments) |
| SB-03 | move up k/↑ | After SB-02 | `k`, then `Up` | Highlight moves up one row each | PASS — k and Up each move up one |
| SB-04 | expand category → | Sidebar focused, highlight on a collapsed category | `Right` | Category expands, showing its child kinds | PASS — Right expanded collapsed Workloads (`▶`→`▼` + children) |
| SB-05 | expand via Enter | Highlight on a collapsed category | `Enter` | Category expands (Enter expands category; selects when on a kind) | PASS — Enter expanded a collapsed category |
| SB-06 | collapse category ← | Highlight on an expanded category | `Left` | Category collapses / moves to parent | PASS — Left collapsed expanded Workloads (`▼`→`▶`) |
| SB-07 | expand-all l | Sidebar focused, some collapsed | `l` | All categories expand | PASS — l expanded every category |
| SB-08 | collapse-all h | Sidebar focused, some expanded | `h` | All categories collapse | PASS — h collapsed every category to `▶` |
| SB-09 | select kind | Sidebar focused, highlight on a kind (e.g. Pods) | `Enter` (or `Right` on a leaf) | The list switches to that kind; list begins loading those resources; focus appropriate per spec | PASS — Enter on Pods switched list to Pods, focus moved to list, command bar shows `Pods` |

---

## 4. List / resource table

All **[CLUSTER]** (need rows). Use a kind with many rows (Pods) for scroll tests.

| ID | Area | Pre | Steps | Expected | Result |
|----|------|-----|-------|----------|--------|
| LT-01 | move down j/↓ | List focused, ≥3 rows | `j`, then `Down` | Selected row moves down one each; selection highlight follows | PASS — j and Down each move selection down one (verified via inverse-video row) |
| LT-02 | move up k/↑ | After LT-01 | `k`, then `Up` | Selection moves up one each | PASS — k and Up each move up one |
| LT-03 | no wrap-by-one (bug regression) | Selection at top row | `k` / `Up` | Selection does **not** wrap to the bottom by one; stays clamped at top (regression: list wrap-by-one) | PASS — at top, k/Up keep selection on first pod, no wrap |
| LT-04 | no wrap at bottom | `G` to bottom | `j` / `Down` | Selection stays clamped at the last row; no wrap to top | PASS — at bottom, j/Down stay on last pod, no wrap |
| LT-05 | jump to top g g | Selection mid-list | `gg` | Selection jumps to first row; viewport scrolls to top | PASS — gg jumps to first pod |
| LT-06 | jump to bottom G | Selection at top | `G` | Selection jumps to last row; viewport scrolls to bottom | PASS — G jumps to last pod |
| LT-07 | page down Ctrl+F | Long list, at top | `C-f` | Viewport pages down by ~one page; selection advances | PASS — Ctrl+F advanced selection a page (to bottom, 18 rows = ~1 page) |
| LT-08 | page up Ctrl+B | After LT-07 | `C-b` | Viewport pages up by ~one page | PASS — Ctrl+B paged back to top |
| LT-09 | horizontal scroll → | List focused, kind with wide columns | `Right` repeatedly | Columns pan left (scroll right); **status dot + `Name` columns stay pinned**; `‹`/`›` overflow markers appear on the scrollable side(s) | PASS — Right pans columns left, `‹` left marker appears, hidden `Memory` column revealed; `● Name` stay pinned |
| LT-10 | horizontal scroll ← | After LT-09 | `Left` repeatedly | Columns pan back; left `‹` marker disappears when fully reset | PASS — Left resets; `‹` gone, `›` right marker returns, Namespace back |
| LT-11 | pinned columns | During LT-09 | Inspect leftmost columns | The status indicator column and `Name` never scroll out of view | PASS — `●` status + `Name` remain leftmost throughout hscroll |
| LT-12 | hscroll reset on kind change | Scrolled right, then switch kind via sidebar | Switch kind | Horizontal scroll resets to 0 (no leftover offset / no `‹` marker) for the new kind | PASS — after switching kind the new list starts at offset 0 (no `‹`) |
| LT-13 | no wrap-by-one at any width | Resize terminal to several widths (e.g. 80, 120, 200 cols), each time scroll columns fully right then left | Inspect each width | At no width does a column wrap onto the next line; content fits the natural-width viewport | PASS — at 80/120/200 cols, list shows exactly 18 one-line pod rows; no column wraps to a second line |
| LT-14 | global filter / | List focused | `/`, type a substring matching some rows, observe | List filters to matching rows live; filter applies to the resource list only | PASS — `/coredns` filtered list to 2 coredns pods live, command bar `[/]` |
| LT-15 | global filter clear | After LT-14 | `Escape` | Filter cancelled; full list restored; Esc does not quit | PASS — Esc restored all 18 pods, mode `[·]`, app still running |
| LT-16 | filter is list-focused only | Detail pane open and **detail focused** | `/` | `/` does **not** open the global list filter (it is captured by detail/logs context — see LG-12); global filter only triggers when the list is focused | **FAIL** — with detail open & focused on the **Overview** tab, `/` opened the global list filter (`[/]`) and typing `web` filtered the underlying pod list 18→3. Expected `/` to be captured by detail context / be a no-op. (Note: keymap.ts lists `/` as a *global* binding "Search the resource list", so this may be by-design for non-Logs tabs — but it contradicts LT-16's stated expectation.) Severity: FUNCTIONAL (spec/behavior conflict). |

---

## 5. Command bar

| ID | Area | Pre | Steps | Expected | Result |
|----|------|-----|-------|----------|--------|
| CB-01 | Space opens agent input | List focused **[CLUSTER]** | `Space` | Command bar enters agent/command input mode; block cursor shown; typing is captured | PASS — Space opens input (`[!]` glyph, inverse block cursor), typing captured; command bar accented |
| CB-02 | ! opens command input | List focused | `!` | Command bar enters command (`!`) mode; mode glyph `[!]` cyan | PASS — `!` opens command input, `[!]` glyph in cyan (`\e[36m`), `! ` prompt |
| CB-03 | Esc cancels input | CB-02 active | `Escape` | Input mode exits; returns to normal; nothing executed; no quit | PASS — Esc returns to `[·]` normal, nothing executed, app still running |
| CB-04 | switch kind by typing name + Enter | List focused | `Space`, type `pods` (or a kind name), `Enter` | List switches to that kind (fast-path resolves the alias) | PASS — Space+`services`+Enter (and `deployments`/`pods`) switch the list to that kind |
| CB-05 | !ctx command | List focused | `!`, type `ctx`, `Enter` | Context switcher opens | PASS — `!ctx` opens the "Switch Context" switcher (current `● docker-desktop` marked) |
| CB-06 | !ns <name> command | List focused **[CLUSTER]** | `!`, type `ns kube-system`, `Enter` | Namespace switches to `kube-system`; list updates; header ns dropdown reflects it | PASS — `!ns kube-system` switched ns; header `[kube-system ▾]`, command bar `ns: kube-system` |
| CB-07 | !q quits | List focused | `!`, type `q`, `Enter` | App quits cleanly | **FAIL** — `!q`+Enter unmounts the UI but the process HANGS (does not exit). Same root cause as the quit-leak bug: the Prometheus SystemTunnel `kubectl port-forward` is never closed in `dispose()`, so bun never exits; the command-bar input then appears stuck/unresponsive (keys leak to raw terminal as `^[^[^[`). Only a raw SIGINT/ETX recovers. Severity: FUNCTIONAL (hang-on-quit). |
| CB-08 | !quit quits | List focused | `!`, type `quit`, `Enter` | App quits cleanly | **FAIL (same root cause as CB-07)** — `!quit` routes through the same `forceQuit()→dispose()→onExit(unmount)` path that leaves the Prometheus `kubectl port-forward` running, so the process hangs instead of exiting. (Not separately re-driven to avoid more zombies; mechanism is identical and confirmed via CB-07 + the q-hang repro.) Severity: FUNCTIONAL. |
| CB-09 | !<resource> navigates | List focused **[CLUSTER]** | `!`, type `deploy` (or `svc`), `Enter` | List navigates to that kind (alias resolved) | PASS — `!deploy` navigated to Deployments |
| CB-10 | unknown ! command | List focused | `!`, type `bogusxyz`, `Enter` | Handled gracefully (no crash); unknown command surfaced/ignored per UI; no `Maximum update depth` in stderr | PASS — `!bogusxyz` surfaced `✗ Unknown command: !bogusxyz`, no crash, no `Maximum update depth` |

---

## 6. Detail pane (all tabs)

| ID | Area | Pre | Steps | Expected | Result |
|----|------|-----|-------|----------|--------|
| DT-01 | open detail (Enter) | List focused, row selected **[CLUSTER]** | `Enter` | Detail pane opens to the right and is **focused** (accent border on detail); Overview tab shown | PASS (with note) — Enter opens detail, focused (accent), defaults to **Overview** on a *fresh* open (METADATA shown). NOTE: the detail remembers the last-used tab within a session, so a re-open lands on whatever tab you last viewed (not always Overview). Also the pane renders as list-top / detail-bottom in the right column, not strictly "to the right". |
| DT-02 | close detail (Esc) | Detail open & focused | `Escape` | Detail pane closes; focus returns to list; no quit | PASS — Esc closes detail, focus returns to list, app still running |
| DT-03 | next tab → | Detail focused, Overview | `Right` | Advances to the next tab (e.g. YAML) | PASS — Right: Overview→YAML (`[Edit]` + `kind: Pod` manifest) |
| DT-04 | prev tab ← | After DT-03 | `Left` | Returns to previous tab | PASS — Left: YAML→Overview (METADATA) |
| DT-05 | jump to tab 1 | Detail focused | `1` | Jumps to tab 1 (Overview) | PASS — `1` jumps to Overview |
| DT-06 | jump to tabs 2–6 | Detail focused | Press `2`,`3`,`4`,`5`,`6` in turn | Each jumps to the corresponding tab; tabs present depend on kind (Overview/YAML/Events/Logs/Metrics, etc.) | PASS — `2`→YAML, `3`→Events, `4`→Logs, `5`→Metrics (pod has 5 tabs; `6` is a no-op as there are only 5) |
| DT-07 | tab strip click | Detail open | (see MS section) | Clicking a tab label switches to it | **FAIL** — clicking tab labels in the strip (row 24) does NOT select the label under the cursor: clicking [Overview] (col 50) activated Events/Logs/Metrics depending on the click ROW (23/24/25), so the click→tab hit-test is mis-mapped (column ignored, vertical offset wrong). Keyboard tab switching works fine (DT-03..06). Same defect as MS-15. Severity: FUNCTIONAL (mouse). |
| DT-08 | nothing clipped | Each tab | Inspect frame on every tab | Content fits inside the detail Rect; nothing spills past the right border or wraps unexpectedly | PASS — on Overview/YAML/Events/Metrics, all 21 detail content rows end at the `║` right border; nothing spills |

### Scrolling on EVERY detail tab (Overview / YAML / Events / Logs / Metrics)

Run DSC-* once per tab; substitute the tab where noted. **[CLUSTER]**.

| ID | Area | Pre | Steps | Expected | Result |
|----|------|-----|-------|----------|--------|
| DSC-01 | scroll down ↓ (Overview) | Overview tab focused, content taller than pane | `Down` several times | Content scrolls down line-by-line; scrollbar thumb moves down | PASS — Down scrolls Overview (METADATA→Namespace…) |
| DSC-02 | scroll up ↑ (Overview) | After DSC-01 | `Up` several times | Content scrolls back up | PASS — Up scrolls back to METADATA |
| DSC-03 | PageDown/PageUp (Overview) | Overview tab | `PageDown`, then `PageUp` | Pages by a viewport height each direction | PASS — PageDown/PageUp page the Overview content |
| DSC-04 | g / G (Overview) | Overview tab | `g`, then `G` | `g` to top, `G` to bottom of content | PASS — G to bottom (volumes/ca-certs), g to top (METADATA) |
| DSC-05 | scrollbar present | Any long tab | Inspect right edge of pane | A scrollbar/indicator renders when content exceeds the viewport; reflects position | PASS — `█` scrollbar thumb on the right edge of Overview/YAML/Metrics |
| DSC-06 | YAML tab scroll | YAML tab (tab 2), long manifest | `Down`/`Up`/`PageDown`/`PageUp`/`g`/`G` | All scroll the YAML body; no clipping | PASS — g→line 1 (`kind: Pod`), G→line 200, PageDown→line 23; no clipping |
| DSC-07 | Events tab scroll | Events tab, resource with many events | Same keys | Events list scrolls | PARTIAL PASS — Events tab renders (filter buttons, columns); scroll keys safe (no crash). Could not exercise multi-page scroll: no resource in this cluster had enough events (max 1 event on crasher pod). |
| DSC-08 | Logs tab scroll | Logs tab, streaming pod | `Up` (see Logs section for tail-pause) | Log ring scrolls | PASS — see LG-13 (Up pauses tail and scrolls the log ring back) |
| DSC-09 | Metrics tab scroll | Metrics tab | Same keys | Metrics content scrolls; **no wrapping** of metric lines (regression) | PASS — Metrics scrolls (g/G); CPU/Memory charts + axis labels fit the Rect with NO line wrapping (regression fixed) |

---

## 7. Logs tab

All **[CLUSTER]**, ideally a multi-container pod plus a single-container pod.

| ID | Area | Pre | Steps | Expected | Result |
|----|------|-----|-------|----------|--------|
| LG-01 | logs stream immediately | Pod row, open detail, go to Logs tab | Switch to Logs | Default container logs **start streaming immediately** — **NO full-screen modal** picker (regression: picker was full-screen) | PASS — Logs tab streams the default container inline, NO full-screen modal (verified on prometheus + crasher/coredns) |
| LG-02 | toolbar present inline | Logs tab | Inspect toolbar row | Inline toolbar shows `[Co̲ntainer ▾]`, `[NNN l̲ines ▾]`, and toggle buttons (pause/timestamps/wrap/download) with underlined accelerators — all inside the detail area | **FAIL (VISUAL)** — toolbar renders correctly ONLY when there are "No log lines". When log lines are PRESENT (e.g. prometheus), the toolbar row is **corrupted/overlapping**: the `Timestamps: on  Wrap: on` status text overwrites the `[Container ▾] p:● Live` portion, and the remaining buttons mash together (`Timestamps Wrap [100 lines ▾] Download`) over the `────` separator. `[Container ▾]` and the Live indicator become invisible. Underlined accelerators ARE present in the no-logs render. Severity: VISUAL (toolbar unreadable while logs present). |
| LG-03 | container dropdown via o | Logs tab, multi-container pod | `o` | An inline `DropdownButton` overlay opens **under** the `[Container ▾]` button, floating over logs (logs keep streaming behind); not full-screen | INCONCLUSIVE — pressing `o` did not open a visible dropdown on prometheus (single-container pod, likely a no-op), and the corrupted toolbar (LG-02) further garbled the row. No crash. Could not test on a true multi-container pod (fixtures in this cluster appear single-container for the pods reached). |
| LG-04 | pick container | LG-03 open | `Down` to another container, `Enter` | Switches streaming to the chosen container; dropdown closes | NOT RUN — depends on LG-03 (no multi-container dropdown reachable) |
| LG-05 | auto-open when no default | Pod whose containers are all terminated/waiting (defaultIndex −1) | Open Logs | Container dropdown auto-opens; no lines stream until a pick is made | NOT RUN — could not stage a pod with all-terminated containers |
| LG-06 | no containers hint | Pod with zero containers | Open Logs | Shows `✗ No containers found` hint; no crash | NOT RUN — no zero-container pod available |
| LG-07 | line-limit dropdown via l | Logs tab | `l` | `[NNN lines ▾]` dropdown opens; selectable limits | NOT FULLY VERIFIED — `l` accepted without crash; dropdown visibility obscured by the corrupted toolbar (LG-02). No crash, app stable. |
| LG-08 | change line limit | LG-07 open | Pick a different limit, `Enter` | Tail buffer/limit updates accordingly | NOT RUN — depends on LG-07 dropdown being visible |
| LG-09 | pause/resume p | Logs streaming | `p` | Live tail pauses (button toggles); `p` again resumes | PARTIAL PASS — `p` accepted without crash; could not visually confirm the Live/Paused button toggle because the toolbar is corrupted (LG-02). No errors. |
| LG-10 | timestamps t | Logs tab | `t` | Toggles per-line timestamps on/off | PASS — `t` toggles the per-line `2026-...Z` timestamp prefix off/on (verified on log lines) |
| LG-11 | wrap w | Logs tab, long lines | `w` | Toggles line wrapping on/off | PASS (accel fires) — `w` toggles wrap state (status flips Wrap: off↔on); no crash. Long-line visible wrap not exercised (prometheus lines fit). |
| LG-12 | download d | Logs tab | `d` | Logs download action fires (writes to a file / triggers save); no crash | INCONCLUSIVE — `d` fires without crash. The `✓ Saved to ~/Downloads/...` confirmation is not visible (hidden by the corrupted toolbar/status area, LG-02), and I could not directly stat the file (`~/Downloads` access hangs on this host, likely iCloud-backed). Code path writes to `~/Downloads/p9r-logs-<pod>-<container>-<ts>.txt` via fileSink. No crash. |
| LG-13 | scroll-up pauses tail | Logs streaming at bottom | `Up` several times | Live tail **pauses**; viewport walks back through the ring buffer | PASS — Up walks the viewport back through the ring (first line 19:00→17:00 timestamps); tail pauses |
| LG-14 | G resumes tail | After LG-13 | `G` | Jumps to the bottom and **resumes** live tail | PASS — G jumps to the latest lines (bottom) and resumes tail |
| LG-15 | search within logs / | Logs tab | `/`, type a substring present in logs | Search runs **within the logs only** — does **NOT** leak to the global pod/list filter (regression) | PASS — `/Deleting` filtered/jumped the log view to matching lines; command bar stayed `[·]` (NOT `[/]`); global list untouched. Regression RG-04 fixed. |
| LG-16 | next match n | LG-15 active, ≥2 matches | `n` | Jumps to next match | PASS (functional) — `n` cycles matches without crash (hard to visually confirm match cursor when all visible lines match; no error) |
| LG-17 | prev match N | LG-15 active | `N` | Jumps to previous match | PASS (functional) — `N` cycles matches backward without crash |
| LG-18 | previous-instance P | Pod that has restarted | `P` | Shows previous-instance (previous container) logs | NOT RUN — did not exercise on a restarted pod's previous instance (crasher has restarts but Logs were empty for current instance; deferred). |

---

## 8. YAML tab

All **[CLUSTER]**.

| ID | Area | Pre | Steps | Expected | Result |
|----|------|-----|-------|----------|--------|
| YA-01 | read mode renders | Detail → YAML tab | Inspect | Resource YAML rendered, syntax-highlighted, scrollable; action affordances `[Edit]` etc. visible (clickable buttons) | PASS — YAML rendered with line numbers, cyan syntax highlight, `█` scrollbar, `[Edit]` button |
| YA-02 | reveal secrets v | YAML tab on a Secret | `v` | Redacted secret values are revealed (toggle); base64/values shown | NOT RUN — did not navigate to a Secret in this pass (cluster has 1 Secret; deferred) |
| YA-03 | enter edit e | YAML tab | `e` | Enters in-pane multi-line editor; cursor visible; editing keys captured by editor | PASS — `e` enters in-pane editor: header `╔══ EDITING — Ctrl+S to save, Ctrl+E to open in $EDITOR, Escape to cancel`, editable line-numbered buffer |
| YA-04 | type edits | YA-03 active | Type some characters | Text inserts at cursor; buffer updates | PASS — typed `XYZ`, inserted at cursor (line 1 → `XYZkind: Pod`) |
| YA-05 | cursor-follow scroll | Editing a long manifest | Arrow/Down to move cursor past viewport bottom | Editor scrolls to keep the cursor visible (cursor-following scroll) | PASS — moving cursor down 30 lines scrolled the viewport (top line 1→10), cursor stays visible |
| YA-06 | save → diff confirm Ctrl+S | Editing with changes | `C-s` | A **diff/confirm** view appears before anything touches the cluster; shows additions/removals | NOT RUN — deliberately not exercised to avoid mutating the live cluster (save path is cluster-writing) |
| YA-07 | confirm apply | YA-06 diff shown | Confirm (Enter/Apply) | Change applied to the cluster (resource updated); returns to read mode reflecting new YAML | NOT RUN — cluster-mutating; skipped for safety |
| YA-08 | $EDITOR pop-out Ctrl+E | Editing | `C-e` | App suspends and opens `$EDITOR` (mouse modes restored during suspend); on exit returns to the editor with the edited content; mouse modes restored | NOT RUN — suspend/$EDITOR handover not driven in this pass |
| YA-09 | cancel edit Esc | Editing with pending changes | `Escape` | Prompts/cancels the edit; pending edits **discarded** (revert/discard); returns to read mode with original YAML; no quit | **PARTIAL FAIL** — Esc with pending changes correctly shows a `Discard changes?  [Yes]  [No]` confirm (red [Yes]/green [No]) — good. BUT the `[Yes]` (discard) action is **not triggerable**: neither Enter, Tab+Enter, Left/Right+Enter, nor clicking `[Yes]` dismisses it; the dialog has no visible button focus/selection and Enter is a no-op. Only a 2nd Esc works (= cancel discard, back to editing). So you can never actually discard via the dialog. Same confirm-dialog/click-mapping defect as DT-07/MS-23. Severity: FUNCTIONAL. |
| YA-10 | 409 conflict reload | Edit a resource, have it change server-side, then Ctrl+S | Apply | A 409 conflict is detected → the editor **reloads** the latest and lets you re-edit (no silent overwrite/crash) | NOT RUN — requires a save (cluster-mutating) + a concurrent server-side change; skipped for safety |

---

## 9. List-row actions

All **[CLUSTER]**. Select a row in the list first.

| ID | Area | Pre | Steps | Expected | Result |
|----|------|-----|-------|----------|--------|
| AC-01 | edit YAML e | Any resource row selected | `e` | Opens detail on the YAML tab in edit mode (or YAML editor) for that resource | |
| AC-02 | copy name y | Row selected | `y` | Resource name copied to clipboard; a confirmation/toast shown | |
| AC-03 | delete confirm d | Row selected | `d` | A **confirm dialog** appears (does not delete immediately) | |
| AC-04 | delete cancel | AC-03 dialog open | Cancel (Esc/No) | Dialog closes; resource NOT deleted | |
| AC-05 | delete confirm yes | AC-03 dialog (use a disposable fixture resource) | Confirm (Enter/Yes) | Resource deleted; row disappears from list | |
| AC-06 | logs l (pod) | A **Pod** row selected | `l` | Opens detail Logs tab streaming (pod-only action) | |
| AC-07 | exec x (pod) | A Pod row selected | `x` | Container picker (if multi-container) → exec session (see Exec section) | |
| AC-08 | port-forward p (pod) | A Pod row selected | `p` | Port-forward dialog/setup for the pod opens | |
| AC-09 | pod-only actions guarded | A non-pod row (e.g. ConfigMap) selected | `l` / `x` / `p` | These are no-ops or unavailable for non-pod kinds (no crash) | |

---

## 10. Exec & port-forward

All **[CLUSTER]**.

| ID | Area | Pre | Steps | Expected | Result |
|----|------|-----|-------|----------|--------|
| EX-01 | exec container picker | Multi-container pod, `x` | Observe | Container picker shown to choose a container | |
| EX-02 | exec handover | Pick a container | Confirm | App **suspends** Ink and hands the terminal to the shell; you get an interactive prompt in the pod | |
| EX-03 | exec return restores mouse | Exit the shell (`exit`) | Return to p9r | Ink resumes; **mouse modes restored** — back in shell later, no escape leak; capture shows clean main grid | |
| EX-04 | port-forward manager F | Main grid | `F` | Port-forward manager overlay opens, listing active forwards | |
| EX-05 | create port-forward | PF manager / `p` on a pod | Specify ports, confirm | Forward established and listed; local port reachable | |
| EX-06 | stop port-forward | PF manager with an active forward | Select + stop | Forward removed from the list and torn down | |

---

## 11. Context switching

All **[CLUSTER]**; ideally with **two** contexts configured (one reachable, one not).

| ID | Area | Pre | Steps | Expected | Result |
|----|------|-----|-------|----------|--------|
| CX-01 | c opens switcher | Normal mode | `c` | Context switcher opens with the **current context marked** (accent + marker) | |
| CX-02 | chip opens switcher | Main grid | Click the header context chip (see MS) | Same switcher opens | |
| CX-03 | c is literal while typing | List filter `/` active (or command input) | `c` | `c` appended to the input; switcher does **NOT** open | |
| CX-04 | filter contexts | Switcher open | Type part of a context name | List filters to matching contexts | |
| CX-05 | navigate + select | Switcher open | `Down`/`Up`, `Enter` on a different reachable context | Switcher **closes immediately**; header shows `… connecting to <ctx>` | |
| CX-06 | connected clears status | After CX-05, reachable ctx | Wait for first sync | Connecting status clears; list populates from the new context | |
| CX-07 | switch to current = no-op | Switcher open | Select the context you're already on | No-op; no reconnect | |
| CX-08 | error banner | Select an **unreachable** context | Wait | Persistent banner `✗ Could not connect to <ctx>: <reason>` with `[Retry]` and `[Switch context]` buttons | |
| CX-09 | Retry action | CX-08 banner shown | Press/click `[Retry]` (`r`) | Re-runs the connection attempt | |
| CX-10 | Switch-context action | CX-08 banner shown | Press/click `[Switch context]` | Reopens the switcher | |
| CX-11 | per-context memory (ns+kind) | On ctx A: set ns=kube-system, select kind=Deployments; switch to ctx B; switch back to A | Observe A | A restores ns=kube-system and kind=Deployments (validated against current cluster); B kept its own ns/kind | |
| CX-12 | memory survives restart | Set ns+kind on a context, quit, relaunch | Observe | The remembered ns+kind for that context is restored from `layout.json` | |
| CX-13 | memory validation fallback | Remembered kind no longer exists in cluster | Switch to that context | Falls back to `Overview` (kind) / all-namespaces (ns) when the remembered value is gone | |

---

## 12. Namespace dropdown

All **[CLUSTER]**.

| ID | Area | Pre | Steps | Expected | Result |
|----|------|-----|-------|----------|--------|
| NS-01 | open via n | Main grid | `n` | Namespace picker/dropdown opens listing namespaces | |
| NS-02 | open via header dropdown | Main grid | Click the header `[ns ▾]` DropdownButton | Same dropdown opens (anchored under the button) | |
| NS-03 | filter | Dropdown open | Type part of a namespace name | List filters to matching namespaces | |
| NS-04 | select | Dropdown open | `Down`/`Enter` on a namespace | Namespace switches; list reloads scoped to it; header reflects new ns | |
| NS-05 | all-namespaces | Dropdown open | Select the all-namespaces entry | List shows resources across all namespaces | |

---

## 13. Metrics

All **[CLUSTER]**. Some require Prometheus / metrics-server installed (note inline).

| ID | Area | Pre | Steps | Expected | Result |
|----|------|-----|-------|----------|--------|
| MT-01 | sparkline column | Pods list, metrics available | Inspect list | A sparkline column renders per row; `~` dim prefix when from session buffer (metrics-server-only) | |
| MT-02 | metrics detail tab | Open a pod's detail → Metrics tab | Inspect | Full ASCII/Braille charts (CPU/mem) render; not wrapped | |
| MT-03 | time-range selector [ / ] | Metrics tab | `[` then `]` | Cycles the chart time range; chart re-renders for the range | |
| MT-04 | Prometheus vs fallback | Cluster with Prometheus | Inspect Metrics tab | Full history + multiple charts; range options (1h/4h/1d/2d) enabled | |
| MT-05 | metrics-server-only note | Cluster with metrics-server only, no Prometheus | Inspect Metrics tab | `ℹ Prometheus not found — showing current values only.` note; historical ranges disabled; `session data` label | |
| MT-06 | no metrics at all | Cluster without metrics | Inspect Metrics tab | Graceful guidance message (install metrics-server / Prometheus); no crash | |

---

## 14. Agent

**[CLUSTER]** + a downloaded model (or no-agent mode).

| ID | Area | Pre | Steps | Expected | Result |
|----|------|-----|-------|----------|--------|
| AG-01 | open agent input | Main grid | `Space` | Command bar enters agent prompt mode; block cursor | |
| AG-02 | ask a question | AG-01 active | Type e.g. `show me failing pods`, `Enter` | Agent runs; a response / navigation occurs | |
| AG-03 | tool-call line | Agent answering a question that uses a tool | Observe | A tool-call line is shown (the agent's tool invocation is surfaced) | |
| AG-04 | no-agent mode | Launched without a model / no-agent mode | `Space`, type, Enter | Falls back to fast-path command behavior; no crash | |

---

## 15. Help overlay

**[NO-CLUSTER]** is fine for most (overlay is local), but focus-dependent ordering needs a region focused.

| ID | Area | Pre | Steps | Expected | Result |
|----|------|-----|-------|----------|--------|
| HP-01 | open ? | Main grid, list focused | `?` | Help overlay opens; title **"Keyboard Reference"** renders **fully** (not clipped — regression) | |
| HP-02 | grouped, current-region-first | Open `?` while **list** focused | Inspect | Groups shown with the **List** group first, then **Global**, then the rest in canonical order | |
| HP-03 | current-region-first (sidebar) | `Tab` to sidebar, `?` | Inspect | **Sidebar** group leads, then Global | |
| HP-04 | current-region-first (detail/logs) | Open Logs tab focused, `?` | Inspect | **Detail · Logs** group leads, then Global | |
| HP-05 | accelerators underlined | Help open | Inspect colour capture | Accelerator letters (`c`, `o`, `l`, `p`, `t`, `w`, `d`, `r`) are underlined in the relevant entries | |
| HP-06 | scrollable ↑/↓ | Help open, content taller than overlay | `Down`/`Up` | Help content scrolls | |
| HP-07 | g/G or PageUp/Down in help | Help open | (try) `PageDown`/`PageUp` | Pages through the help (if supported) | |
| HP-08 | close with ? | Help open | `?` | Help overlay closes; returns to grid | |
| HP-09 | close with Esc | Help open | `Escape` | Help overlay closes; no quit | |
| HP-10 | all keymap groups present | Help open, scroll through all | Inspect | Every KEYMAP group appears: Global, Sidebar, List, Detail (all tabs), Detail · Logs, Detail · YAML, Detail · Metrics, Command bar, Overlays | |


---

## 16. Mouse interactions

All **[CLUSTER]** unless noted. X = column, Y = row (1-based as shown on screen).
Determine X/Y from the plain capture before each click.

| ID | Area | Pre | Steps | Expected | Result |
|----|------|-----|-------|----------|--------|
| MS-01 | click region → focus (sidebar) | Main grid, list focused | Click inside the sidebar region | Sidebar becomes focused (accent border moves there) | |
| MS-02 | click region → focus (list) | Sidebar focused | Click inside the list region | List becomes focused | |
| MS-03 | click region → focus (detail) | Detail open, list focused | Click inside the detail region | Detail becomes focused | |
| MS-04 | click region → focus (command bar) | Main grid | Click the command bar | Command bar becomes focused | |
| MS-05 | click region → focus (header) | Main grid | Click empty header area | Header becomes focused (if focusable) | |
| MS-06 | click row → select | List focused, multiple rows | Click a non-selected row | That row becomes selected (highlight moves to it) | |
| MS-07 | second click row → open detail | A row already selected | Click that same row again | Detail pane opens for that row | |
| MS-08 | wheel over list scrolls list | Detail open, list under cursor | Wheel-down at list coords (`\e[<65;X;YM`) | The **list** scrolls — not the detail (routes by cursor geometry) | |
| MS-09 | wheel over detail scrolls detail | Detail open | Wheel-down at detail coords | The **detail** content scrolls, not the list | |
| MS-10 | wheel over sidebar scrolls sidebar | Long sidebar | Wheel at sidebar coords | Sidebar scrolls | |
| MS-11 | wheel up at list | List scrolled down | Wheel-up at list coords (`\e[<64;X;YM`) | List scrolls up | |
| MS-12 | drag sidebar│list handle | Main grid | Press on the sidebar│list vertical border, drag right several cols, release | Sidebar widens; list narrows; layout recomputes; no `Maximum update depth` | |
| MS-13 | drag list│detail handle | Detail open | Press on the list│detail border, drag, release | The list/detail split ratio changes | |
| MS-14 | grabbed handle does not slip | Mid-drag | Start a drag on a border, move the cursor a column to the side and several rows away, release | The grabbed handle keeps tracking (no slip to a different handle/region) | |
| MS-15 | click detail tab → switch | Detail open | Click a tab label in the tab strip | Detail switches to that tab | |
| MS-16 | click ✕ → close detail | Detail open | Click the close `✕` control | Detail pane closes | |
| MS-17 | click namespace DropdownButton | Main grid | Click the header `[ns ▾]` | Namespace dropdown opens; click an item → namespace switches | |
| MS-18 | click context chip → switcher | Main grid | Click the header context chip | Context switcher opens | |
| MS-19 | click Logs [Container ▾] | Logs tab | Click `[Container ▾]` | Container dropdown opens; click an item selects it | |
| MS-20 | click Logs [NNN lines ▾] | Logs tab | Click `[NNN lines ▾]` | Line-limit dropdown opens; click an item selects it | |
| MS-21 | accelerator letters fire buttons | Logs tab | Press the underlined accelerator (`o`,`l`,`p`,`t`,`w`,`d`) | Each fires the same action as clicking the corresponding button | |
| MS-22 | click Logs toggle buttons | Logs tab | Click the pause / timestamps / wrap / download buttons | Each toggles/fires like its accelerator | |
| MS-23 | click confirm-dialog buttons | Delete confirm open | Click `[Yes]` / `[No]` (or the accent buttons) | The corresponding action fires | |
| MS-24 | click context banner buttons | Error banner shown (CX-08) | Click `[Retry]` / `[Switch context]` | Each fires its action | |
| MS-25 | mouse modes restored on quit | Main grid | `q` then move the mouse in the shell | No SGR escape sequences leak; mouse reporting off | |
| MS-26 | mouse modes restored on suspend | During exec handover or `$EDITOR` pop-out | Move mouse while suspended, then return | No escape leak while suspended; clean grid + working mouse on return | |
| MS-27 | mode 1003h suppressed | Any mouse activity | Move the mouse without clicking, watch stderr/shell | No any-motion (1003h) reporting; only press/release/wheel/drag events handled; no flood | |

---

## 17. Resize

All **[CLUSTER]**.

| ID | Area | Pre | Steps | Expected | Result |
|----|------|-----|-------|----------|--------|
| RS-01 | shrink width | Main grid at 170 cols | `tmux resize-window -t p9r -x 100` (or new session at -x 100) | Frame recomputes to the new width; borders still form a connected grid; no wrap/clip; focused border style preserved | |
| RS-02 | grow width | At 100 cols | Resize to `-x 200` | Frame recomputes; columns/charts use the extra width; no clip | |
| RS-03 | shrink height | At -y 50 | Resize to `-y 24` | Frame recomputes; sidebar/list/detail heights shrink; command bar stays at bottom; no overflow | |
| RS-04 | grow height | At -y 24 | Resize to `-y 60` | Frame fills the new height | |
| RS-05 | narrow extreme | Resize to `-x 70` | Inspect | List columns degrade gracefully (pinned status+Name remain); no wrap-by-one; no crash | |
| RS-06 | focus border survives resize | Focus a region, resize | Inspect after | The focused region keeps its double-line accent after recompute | |
| RS-07 | detail open across resize | Detail open, resize width and height | Inspect | Detail content reflows within its Rect; nothing clipped past the border | |
| RS-08 | no render loop on resize | Rapidly resize a few times | Check `/tmp/p9r-err.txt` | No `Maximum update depth` / stack traces | |

---

## 18. Regression checks (README "Bugs fixed")

Each maps to a specific historical bug. **[CLUSTER]** unless noted.

| ID | Area | Pre | Steps | Expected | Result |
|----|------|-----|-------|----------|--------|
| RG-01 | list wrap-by-one | List with N rows, selection at top | `Up`/`k` at the top; `Down`/`j` at the bottom | Selection clamps at the edge — never wraps by one to the opposite end (see LT-03/LT-04) | |
| RG-02 | metrics-tab wrapping | Metrics tab, narrowish width | Inspect chart/metric lines | Metric lines do **not** wrap onto extra rows; they fit the detail Rect (see DSC-09/MT-02) | |
| RG-03 | logs picker not full-screen | Multi-container pod, open Logs, press `o` | Inspect | Container picker is an **inline dropdown** anchored under the button — NOT a full-screen modal; logs keep streaming behind it (see LG-01/LG-03) | |
| RG-04 | / in Logs not leaking to global | Logs tab focused | `/`, type a query | Search stays **within the logs**; the global pod/list filter is untouched (verify list unchanged on returning to it) (see LG-15) | |
| RG-05 | wheel not scrolling list while detail focused | Detail open and **focused** | Wheel over the **detail** region | The detail scrolls; the list does **not** scroll (geometry-routed) (see MS-08/MS-09) | |
| RG-06 | arrows not scrolling list while detail focused | Detail open and focused | `Up`/`Down` | The **detail content** scrolls; the list selection does **not** move (arrows act within the focused region) | |
| RG-07 | help title not clipped | Open `?` | Inspect top of overlay | Title **"Keyboard Reference"** renders in full, not truncated (see HP-01) | |
| RG-08 | no Button render-loop **[NO-CLUSTER ok]** | Interact with any measured `<Button>`/`<DropdownButton>` (open/close dropdowns, click buttons repeatedly) | After each, `grep "Maximum update depth" /tmp/p9r-err.txt` | **No** `Maximum update depth` errors in stderr at any point | |

---

## 19. Keymap coverage cross-reference

Every binding in `src/ui/keymap.ts` must be exercised by ≥1 test above. This
table maps each binding (by scope) to its covering test ID(s).

### Global
| Binding | Covered by |
|---------|-----------|
| `Tab` / `Shift+Tab` cycle | FR-03, FR-04, FR-05 |
| `q` quit | LR-07..LR-10, LR-12 |
| `Ctrl+C` quit (any mode) | LR-11 |
| `Esc` close detail / cancel | LR-06, DT-02, CB-03, YA-09, HP-09 |
| `?` toggle help | HP-01, HP-08 |
| `/` search list | LT-14, LT-16 |
| `n` namespace picker | NS-01 |
| `Space` command/agent | CB-01, AG-01 |
| `!` command input | CB-02 |
| `c` context switcher (accel) | CX-01, CX-03 |
| `r` refresh / retry (accel) | CX-09 (retry); refresh: **RG-09 below** |
| `F` port-forward manager | EX-04 |
| `+`/`-` (Alt+↑/↓) resize split | **KB-RS below** |
| wheel | MS-08..MS-11 |
| drag border | MS-12, MS-13, MS-14 |
| click | MS-01..MS-07 |

### Sidebar
| Binding | Covered by |
|---------|-----------|
| `↑`/`↓` (`k`/`j`) | SB-02, SB-03 |
| `←` collapse/parent | SB-06 |
| `→`/`Enter` expand/select | SB-04, SB-05, SB-09 |
| `h` collapse all | SB-08 |
| `l` expand all | SB-07 |

### List
| Binding | Covered by |
|---------|-----------|
| `↑`/`↓` (`k`/`j`) | LT-01, LT-02 |
| `←`/`→` hscroll | LT-09, LT-10 |
| `g g` top | LT-05 |
| `G` bottom | LT-06 |
| `Ctrl+F`/`Ctrl+B` page | LT-07, LT-08 |
| `Enter` open detail | DT-01 |
| `e` YAML editor | AC-01 |
| `y` copy name | AC-02 |
| `d` delete (confirm) | AC-03..AC-05 |
| `l` logs (pods) | AC-06 |
| `x` exec (pods) | AC-07 |
| `p` port-forward (pods) | AC-08 |

### Detail (all tabs)
| Binding | Covered by |
|---------|-----------|
| `←`/`→` prev/next tab | DT-03, DT-04 |
| `↑`/`↓` scroll | DSC-01, DSC-02 |
| `PageUp`/`PageDown` | DSC-03 |
| `g`/`G` top/bottom | DSC-04 |
| `1`–`6` jump | DT-05, DT-06 |
| `Esc` close | DT-02 |

### Detail · Logs
| Binding | Covered by |
|---------|-----------|
| `↑`/`↓` (pauses tail) | LG-13 |
| `PageUp`/`PageDown` | DSC-08 (+ DSC-03 pattern) |
| `g`/`G` | LG-14 (G), DSC-04 pattern (g) |
| `/` search | LG-15 |
| `n`/`N` next/prev match | LG-16, LG-17 |
| `o` container dropdown (accel) | LG-03, MS-19 |
| `l` line-limit dropdown (accel) | LG-07, MS-20 |
| `p` pause (accel) | LG-09 |
| `t` timestamps (accel) | LG-10 |
| `w` wrap (accel) | LG-11 |
| `P` previous instance | LG-18 |
| `d` download (accel) | LG-12 |

### Detail · YAML
| Binding | Covered by |
|---------|-----------|
| `e` edit | YA-03 |
| `v` reveal (Secrets) | YA-02 |
| `Ctrl+S` save/diff | YA-06, YA-07 |
| `Ctrl+E` $EDITOR | YA-08 |
| `Esc` cancel edit | YA-09 |

### Detail · Metrics
| Binding | Covered by |
|---------|-----------|
| `[`/`]` time range | MT-03 |

### Command bar
| Binding | Covered by |
|---------|-----------|
| type | CB-01, CB-04 |
| Enter run | CB-04..CB-09 |
| Esc cancel | CB-03 |

### Overlays (switcher / pickers / dropdowns)
| Binding | Covered by |
|---------|-----------|
| `↑`/`↓` (`k`/`j`) move highlight | CX-05, NS-04, LG-04, LR-03 |
| `Enter` select | CX-05, NS-04, LG-04 |
| `Esc` close | HP-09, NS (Esc), LG-03 dismiss |
| type filter | CX-04, NS-03 |

### Extra tests for bindings not otherwise exercised end-to-end

| ID | Area | Pre | Steps | Expected | Result |
|----|------|-----|-------|----------|--------|
| RG-09 | refresh `r` | List focused, normal mode **[CLUSTER]** | `r` | The resource list refreshes/re-fetches (no error; loadState cycles) | |
| KB-RS1 | resize split `+` | Detail open **[CLUSTER]** | `+` several times | The list/detail vertical split grows the detail side; geometry recomputes | |
| KB-RS2 | resize split `-` | After KB-RS1 | `-` several times | The split shrinks the detail side back | |
| KB-RS3 | resize split Alt+↑/↓ | Detail open | `Alt+Up`, `Alt+Down` (`tmux send-keys -t p9r M-Up` / `M-Down`) | Equivalent to `+`/`-`; split resizes | |
| KB-G1 | overlay g (top) in detail | Long detail tab focused | `g` | Scrolls content to top (pairs with DSC-04) | |

---

## 20. Execution summary template

Fill in as tests run:

```
Section                         Pass / Total   (Wave 1 executor: sections 1–8)
1  Launch & first-run            9 / 13   (FAIL: LR-07, LR-08, LR-09 quit-hang; N/A: LR-10)
2  Frame, focus & header         9 / 10   (N/A: FR-10 — command bar not Tab-focusable)
3  Sidebar                       9 / 9    ✅
4  List / table                 15 / 16   (FAIL: LT-16 — `/` filters list while detail focused)
5  Command bar                   8 / 10   (FAIL: CB-07, CB-08 — !q/!quit hang, same root cause)
6  Detail (all tabs)            16 / 17   (DT 7/8 PASS, FAIL: DT-07 tab-strip click; DSC 9/9 PASS, DSC-07 partial)
7  Logs tab                      8 / 18   (FAIL: LG-02 toolbar corruption; LG-03..08,18 NOT RUN/inconclusive — single-container cluster + toolbar bug; PASS: LG-01,10,11,13,14,15,16,17)
8  YAML tab                      4 / 10   (FAIL: YA-09 discard-confirm unactivatable; NOT RUN: YA-02,06,07,08,10 — cluster-mutating/Secret/suspend not driven)
9–19                            (out of Wave 1 scope — not executed)
```

### Wave 1 headline failures (sections 1–8)

1. **CRITICAL — Quit hangs the process (LR-07/08/09, CB-07/08).** Any non-signal
   quit (`q`, `!q`, `!quit`) unmounts the Ink UI but the **process never exits**:
   the Prometheus `SystemTunnel` `kubectl port-forward service/prometheus
   39090:9090` is left running because `dispose()`
   (`src/adapters/live/controller.ts:729`) tears down streams/cancels but never
   `close()`s `this.promTunnel`. The leaked kubectl child keeps the bun event
   loop alive → the user's shell prompt never returns. Only a real SIGINT (ETX /
   `Ctrl+C` delivered as `\003`) recovers, because it signals the whole process
   group and kills the kubectl child too. Affects every cluster that has
   Prometheus discoverable.
2. **FUNCTIONAL — Logs toolbar corrupted when log lines present (LG-02).** With
   logs streaming, the toolbar row overlaps the status row: `[Container ▾] p:●
   Live` is overwritten by `Timestamps: on  Wrap: on`, buttons mash together. The
   `[Container ▾]`/Live indicator become invisible. Renders fine only when "No
   log lines". Accelerator keys still work, but the toolbar is unreadable and the
   container/line-limit/download dropdowns can't be seen.
3. **FUNCTIONAL — Confirm dialog / detail-region clicks not actionable
   (DT-07, YA-09).** Detail tab-strip clicks don't select the label under the
   cursor (column ignored, vertical offset wrong), and the `Discard changes?`
   confirm's `[Yes]` can't be triggered by Enter/Tab/arrows/click (only Esc =
   cancel works). Same defect family.
4. **FUNCTIONAL/spec-conflict — `/` filters the list while detail is focused
   (LT-16).** `/` on the Overview tab opened the global list filter and filtered
   the underlying pod list. `keymap.ts` documents `/` as a *global* binding, so
   this may be by-design — but it contradicts LT-16's expectation that detail
   context should capture `/`.

### Minor / visual notes
- FR-07: context accelerator is an underlined `c` inside the context name, not a
  separate `c̲:` badge as the spec text describes (cosmetic).
- FR-02/FR-03: default focus is **sidebar**; Tab cycle is sidebar↔list↔detail
  only (command bar/header are not Tab-reachable — the FR-03 "…→command
  bar→header" is illustrative, and FR-10/LR-10 cannot be executed as written).
- Detail opens list-top / detail-bottom in the right column (not strictly "to
  the right"); detail remembers the last-used tab across re-opens.
