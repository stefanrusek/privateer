# p9r Manual Test Plan

An exhaustive, agent-executable manual test plan for the p9r Kubernetes TUI
(version **0.3.0**). Derived from `src/ui/keymap.ts` (the authoritative binding
registry), `specs/002-navigation-overhaul/`, `spec/spec-0*.md`, and `features/`.

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
| LR-07 | q quits — list **[CLUSTER]** | List focused | `q` | App quits cleanly; shell clean | **[W4] PASS — FIXED** — with the Prometheus tunnel active, `q` exits cleanly: the bun process AND the leaked `kubectl port-forward service/prometheus 39090:9090` are both gone (`pgrep` empty), the launch wrapper's post-exit marker `EXITED=0` fires, and the pane's running command becomes `sleep`/shell (proving `bun run start` returned). The Wave-1 quit-hang (Prometheus tunnel never closed in `dispose()`) is resolved. |
| LR-08 | q quits — sidebar **[CLUSTER]** | `Tab` to sidebar | `q` | Quits cleanly | **[W4] PASS — FIXED** — `q` with focus on the sidebar exits cleanly (`EXITED=0`, all procs gone incl. the Prometheus tunnel). |
| LR-09 | q quits — detail **[CLUSTER]** | Open detail (Enter on a row), detail focused | `q` | Quits cleanly | **[W4] PASS — FIXED** — `q` with detail open/focused exits cleanly (`EXITED=0`, all procs gone). All `q` paths hit the same dispose, now tearing down the tunnel. |
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
| LT-16 | filter is list-focused only | Detail pane open and **detail focused** | `/` | `/` does **not** open the global list filter (it is captured by detail/logs context — see LG-12); global filter only triggers when the list is focused | **[W4] PASS — FIXED** — with detail open & focused on the **Overview** tab, `/` does NOT open the global list filter: mode stays `[·]` and the pod list stays at 5 rows (unfiltered) even after typing `web`. With the list/sidebar context focused, `/` correctly opens `[/]` and filters (5→3 `web`); Esc restores. The `/` scoping fix (commit `cdefaeb`) holds. |

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
| CB-07 | !q quits | List focused | `!`, type `q`, `Enter` | App quits cleanly | **[W4] PASS — FIXED** — `!q`+Enter exits cleanly with the Prometheus tunnel active: `EXITED=0`, the bun process and the kubectl tunnel are both gone. The Wave-1 hang is resolved. |
| CB-08 | !quit quits | List focused | `!`, type `quit`, `Enter` | App quits cleanly | **[W4] PASS — FIXED** — `!quit`+Enter exits cleanly (`EXITED=0`, all procs gone incl. the Prometheus tunnel). |
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
| DT-07 | tab strip click | Detail open | (see MS section) | Clicking a tab label switches to it | **[W4] PASS — FIXED** — clicking each tab label at its VISIBLE row selects exactly that tab (Overview→METADATA, YAML→[Edit], Events→events panel, Logs→stream, Metrics→charts). Column maps correctly and the vertical hit-test is aligned (no off-by-one). See MS-15. |
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
| LG-02 | toolbar present inline | Logs tab | Inspect toolbar row | Inline toolbar shows `[Co̲ntainer ▾]`, `[NNN l̲ines ▾]`, and toggle buttons (pause/timestamps/wrap/download) with underlined accelerators — all inside the detail area | **[W4] PASS — FIXED** — with log lines streaming (web/nginx and multi/nginx), the toolbar row (`[Container ▾] p:● Live  Timestamps  Wrap  [100 lines ▾]  Download`) and the status row (`Timestamps: on  Wrap: off`) render on SEPARATE, fully-readable lines — no overlap/mashing. `[Container ▾]` and the Live indicator are visible. The Wave-1 corruption-when-logs-present bug is resolved. |
| LG-03 | container dropdown via o | Logs tab, multi-container pod | `o` | An inline `DropdownButton` overlay opens **under** the `[Container ▾]` button, floating over logs (logs keep streaming behind); not full-screen | **[W4] PASS** — on `demo/multi` (nginx+busybox), `o` opens an inline dropdown anchored under `[Container ▾]` listing BOTH containers (`● busybox ✓`, `● nginx`) over the streaming logs — NOT full-screen. |
| LG-04 | pick container | LG-03 open | `Down` to another container, `Enter` | Switches streaming to the chosen container; dropdown closes | **[W4] PASS** — `Down`→nginx, `Enter` switched the header to `Logs — multi / nginx` and the stream to nginx's docker-entrypoint output (was busybox-tick); dropdown closed. |
| LG-05 | auto-open when no default | Pod whose containers are all terminated/waiting (defaultIndex −1) | Open Logs | Container dropdown auto-opens; no lines stream until a pick is made | NOT RUN — could not stage a pod with all-terminated containers (no such fixture). Negative case confirmed: `demo/multi` (has a default) streams immediately without auto-opening the dropdown. |
| LG-06 | no containers hint | Pod with zero containers | Open Logs | Shows `✗ No containers found` hint; no crash | NOT RUN — no zero-container pod is stageable in this cluster. |
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
| W2-LG-EXTRA | **[W2]** Logs auto-opens container dropdown? | Open Logs on a **single-container** pod (demo/web → nginx) | Open Logs tab via `l` | Per spec chunk 06 the inline container dropdown should auto-open ONLY when there is no default container; on a single/default-container pod it should NOT auto-open | **PASS / observation does NOT reproduce** — opening Logs on demo/web-…-zhldl (single nginx container) streams immediately and the container dropdown does **NOT** auto-open; keyboard is not captured (no Esc needed). The reported spurious auto-open behavior is NOT present on this build. (Also confirms LG-02 toolbar overlap fixed, with log lines present.) |
| W2-LG-02 | **[W2]** re-verify LG-02 toolbar | Logs tab with log lines present | Inspect toolbar + status rows | Toolbar `[Container ▾] … Download` and status `Timestamps/Wrap` must not overlap | **PASS — LG-02 FIXED** — with nginx log lines streaming, the toolbar row and the `Timestamps: on  Wrap: off` status row are on separate, fully-readable lines; no overwrite/mashing. (Was the Wave-1 FAIL.) |

---

## 8. YAML tab

All **[CLUSTER]**.

| ID | Area | Pre | Steps | Expected | Result |
|----|------|-----|-------|----------|--------|
| YA-01 | read mode renders | Detail → YAML tab | Inspect | Resource YAML rendered, syntax-highlighted, scrollable; action affordances `[Edit]` etc. visible (clickable buttons) | PASS — YAML rendered with line numbers, cyan syntax highlight, `█` scrollbar, `[Edit]` button |
| YA-02 | reveal secrets v | YAML tab on a Secret | `v` | Redacted secret values are revealed (toggle); base64/values shown | **[W2] PASS (reveal)** — on demo/`app-secret` YAML, `data:` shows `api-key: '[redacted]'` / `password: '[redacted]'`; pressing `v` reveals the real base64 values (`api-key: Zml4dHVyZS1ub3QtYS1yZWFsLWtleQ==`, `password: aHVudGVyMg==`). No crash. MINOR: re-pressing `v` did not clearly re-redact in my captures (reveal→hide toggle-back not confirmed); reveal direction works. (Also noted: a stray `[YAML]`/`l]` tab-strip artifact bleeds into YAML line 1 / mid-lines on this render — cosmetic.) |
| YA-03 | enter edit e | YAML tab | `e` | Enters in-pane multi-line editor; cursor visible; editing keys captured by editor | PASS — `e` enters in-pane editor: header `╔══ EDITING — Ctrl+S to save, Ctrl+E to open in $EDITOR, Escape to cancel`, editable line-numbered buffer |
| YA-04 | type edits | YA-03 active | Type some characters | Text inserts at cursor; buffer updates | PASS — typed `XYZ`, inserted at cursor (line 1 → `XYZkind: Pod`) |
| YA-05 | cursor-follow scroll | Editing a long manifest | Arrow/Down to move cursor past viewport bottom | Editor scrolls to keep the cursor visible (cursor-following scroll) | PASS — moving cursor down 30 lines scrolled the viewport (top line 1→10), cursor stays visible |
| YA-06 | save → diff confirm Ctrl+S | Editing with changes | `C-s` | A **diff/confirm** view appears before anything touches the cluster; shows additions/removals | **[W2] PASS** — Ctrl+S first validates YAML client-side (a malformed edit was rejected with `✗ YAML error line N: bad indentation…`), then shows a `Review Changes — Pod/demo/<name>` dialog with collapsed `… N unchanged lines` markers, the `+ w2test: ok` addition, and `[Apply] (Enter)  [Cancel] (Esc)` buttons. No cluster write happens before this dialog. |
| YA-07 | confirm apply | YA-06 diff shown | Confirm (Enter/Apply) | Change applied to the cluster (resource updated); returns to read mode reflecting new YAML | **[W4] PASS — FIXED** — edited `demo/multi` to add a benign `w2test: ok` label, `Ctrl+S`→diff (`Review Changes — Pod/demo/multi`, `+ w2test: ok`)→`Enter`: applied WITHOUT a 409. `kubectl get pod multi` confirmed the label landed (`{"app":"multi","w2test":"ok"}`); resourceVersion advanced 253519→253839 (a real update). Dialog closed to read mode (`[·]`). Reverted via `kubectl label … w2test-`. The Wave-2 always-409 stale-resourceVersion bug is resolved. |
| YA-08 | $EDITOR pop-out Ctrl+E | Editing | `C-e` | App suspends and opens `$EDITOR` (mouse modes restored during suspend); on exit returns to the editor with the edited content; mouse modes restored | **[W4] PASS — FIXED** — launched with `EDITOR=/tmp/p9r-editor.sh` (appends `w2test: ok` under metadata.labels + records a marker). `Ctrl+E` from the editor on `demo/multi` suspends Ink, runs `$EDITOR` (marker confirms it ran on the temp file), and resumes into a **LIVE editing buffer** (`╔══ EDITING` header, still editable) that now CONTAINS the externally-added `w2test: ok` line — i.e. the external edit is reflected back, NOT frozen. The follow-on `Ctrl+S`→diff→`Enter` then applied it (see YA-07). The Wave-2 "returns to a frozen read view / content not reloaded" bug is resolved. |
| YA-09 | cancel edit Esc | Editing with pending changes | `Escape` | Prompts/cancels the edit; pending edits **discarded** (revert/discard); returns to read mode with original YAML; no quit | **PARTIAL FAIL** — Esc with pending changes correctly shows a `Discard changes?  [Yes]  [No]` confirm (red [Yes]/green [No]) — good. BUT the `[Yes]` (discard) action is **not triggerable**: neither Enter, Tab+Enter, Left/Right+Enter, nor clicking `[Yes]` dismisses it; the dialog has no visible button focus/selection and Enter is a no-op. Only a 2nd Esc works (= cancel discard, back to editing). So you can never actually discard via the dialog. Same confirm-dialog/click-mapping defect as DT-07/MS-23. Severity: FUNCTIONAL. — **[W2 UPDATE] NOW PASS via accelerator** — the `Discard changes?  [Yes]  [No]` confirm is now actionable: pressing the **`y` accelerator** triggers Discard (returns to read mode with the original YAML) and `n` cancels. NOTE: Enter / Tab+Enter / Left-Right+Enter / clicking `[Yes]` are still all no-ops (no visible button focus); only the literal `y`/`n` accelerator keys work. Functional via keyboard accelerator; click/Enter activation still broken (tracks DT-07/MS-23 family). — **[W4] RE-VERIFIED: discard via Enter AND via click both still FAIL** (the `2615996` confirm-dialog fix only covered the *delete* confirm, not the YAML discard confirm). Repro: edit a pod's YAML, type a char, `Escape` → `Discard changes? [Yes] [No]` (Yes=red-underlined, No=green-underlined, neither bold-default-focused). `Enter` → dialog stays open (no-op). Clicking `[Yes]` interior (col 68, row 15) → dialog stays open (no-op). Only `y`/`n` accelerators work. Severity: FUNCTIONAL (minor — keyboard accelerator path works). REMAINING BUG. — **[CONF-RUN 2026-06-17, commit 0fea256] PARTIAL FAIL — click `[Yes]` STILL does not discard.** Independent re-verify of all five sub-paths on `demo/web` pod YAML: (a) `Esc`→prompt→**`Enter` discards** ✅ (reproducible 2×, returns to read mode, edit lost); (d) `Esc` on the prompt **cancels** ✅ (back to EDITING with changes intact); (e) **`y` discards / `n` cancels** ✅. BUT (b) **clicking `[Yes]` (col 73, row 15) does NOT discard** — the prompt is dismissed and the app returns to the EDITING buffer with changes intact (i.e. treated as click-on-editor-below = cancel, not Yes-activate); and (c) **clicking `[No]` (col 80) is a no-op that LEAVES THE DIALOG OPEN** (neither cancels-to-edit nor discards). So the `3cb1d5d` "accepts Enter/click" fix covered **Enter** (now works) but **NOT the `[Yes]`/`[No]` mouse-clicks**. Item-1 requirement "(b) click `[Yes]` discards" FAILS. Severity: FUNCTIONAL minor (Enter + `y`/`n` keyboard paths fully work; only click activation of the discard confirm is broken — same DT-07/MS-23 confirm-click family). |
| YA-10 | 409 conflict reload | Edit a resource, have it change server-side, then Ctrl+S | Apply | A 409 conflict is detected → the editor **reloads** the latest and lets you re-edit (no silent overwrite/crash) | **[W2] PASS** — 409 conflict is detected and surfaced as `✗ Conflict — resource was modified  [Reload & re-edit] (r)  [Discard] (Esc)`. Pressing `r` re-fetches the latest manifest (verified the editor's `resourceVersion` advanced to match the current cluster value) and returns to the editor for a clean re-edit — no silent overwrite, no crash. (Triggered organically/repeatedly because of YA-07's stale-resourceVersion bug; the conflict-handling UX itself is correct.) |

---

## 9. List-row actions

All **[CLUSTER]**. Select a row in the list first.

| ID | Area | Pre | Steps | Expected | Result |
|----|------|-----|-------|----------|--------|
| AC-01 | edit YAML e | Any resource row selected | `e` | Opens detail on the YAML tab in edit mode (or YAML editor) for that resource | PASS — `e` on a list row opens the detail pane on the **YAML** tab (read mode with `[Edit]` button + full manifest); a second `e` enters the in-pane editor. Lands on YAML tab as expected. |
| AC-02 | copy name y | Row selected | `y` | Resource name copied to clipboard; a confirmation/toast shown | PASS — `y` shows toast `✓ Copied crasher-5c98495b8f-2dhhf`; verified `pbpaste` returns the exact pod name. |
| AC-03 | delete confirm d | Row selected | `d` | A **confirm dialog** appears (does not delete immediately) | PASS — `d` shows a command-bar confirm `Delete Pod crasher-…? [Delete] [Cancel]`; pod NOT deleted yet. `[Delete]` is the focused/default button (bold-red-underlined). |
| AC-04 | delete cancel | AC-03 dialog open | Cancel (Esc/No) | Dialog closes; resource NOT deleted | PASS — Esc dismisses the confirm (mode → `[·]`); `kubectl` confirms the crasher pod still present (not deleted). |
| AC-05 | delete confirm yes | AC-03 dialog (use a disposable fixture resource) | Confirm (Enter/Yes) | Resource deleted; row disappears from list | **[W4] PASS — FIXED** — `[Delete]`+`Enter` deleted `demo/web-…-grgld`; the deleted row **disappeared from the UI list via the watch** (no stale row) and the Deployment respawn `web-…-klb7z` appeared; `r` refresh matched `kubectl` exactly (crasher, multi, klb7z, pszqk, zhb6n). The Wave-2 "deleted rows linger / list not reconciled" bug is resolved. Also re-verified the **delete confirm responds to both Enter and click**: `Enter`→fires delete; clicking `[Cancel]` interior dismisses (pod stays Running); clicking `[Delete]` interior fires the delete (pod→Terminating). |
| AC-06 | logs l (pod) | A **Pod** row selected | `l` | Opens detail Logs tab streaming (pod-only action) | PASS — `l` on demo/web-…-zhldl opens the detail **Logs** tab streaming the `nginx` container inline (`Logs — web-…-zhldl / nginx`, real log lines tailing). **Container dropdown did NOT auto-open** (correct for a single-container pod — see W2-LG-EXTRA). **LG-02 toolbar corruption is FIXED**: with log lines present, the toolbar `[Container ▾] p:● Live  Timestamps  Wrap  [100 lines ▾]  Download` and the status `Timestamps: on  Wrap: off` render on clean, separate, non-overlapping lines. |
| AC-07 | exec x (pod) | A Pod row selected | `x` | Container picker (if multi-container) → exec session (see Exec section) | PASS — `x` on demo/web-…-6jqtx opens a command-bar exec prompt `[!] exec <pod> ▸ /bin/bash (↑ history)` (single-container, so no container picker — none available in this cluster), then Enter hands over to an interactive in-pod shell (see EX-02). |
| AC-08 | port-forward p (pod) | A Pod row selected | `p` | Port-forward dialog/setup for the pod opens | PASS — `p` on a pod opens a command-bar port-forward setup `[!] ⇄ <pod> ports remote:local = <port>:<port>` (pre-filled with the container port). BUG NOTE: the port input field appears **non-editable** — typing digits and Backspace had no reliable effect (default ports must be accepted); see EX-05. |
| AC-09 | pod-only actions guarded | A non-pod row (e.g. ConfigMap) selected | `l` / `x` / `p` | These are no-ops or unavailable for non-pod kinds (no crash) | PASS — on a ConfigMap (`app-config`/demo), `l`, `x`, and `p` are all no-ops: no logs/exec/port-forward opened, mode stays `[·]`, no detail pane, no crash, no stderr errors. |

---

## 10. Exec & port-forward

All **[CLUSTER]**.

| ID | Area | Pre | Steps | Expected | Result |
|----|------|-----|-------|----------|--------|
| EX-01 | exec container picker | Multi-container pod, `x` | Observe | Container picker shown to choose a container | **[W4] PASS** — `x` on `demo/multi` (nginx+busybox) opens an `Exec — choose container` modal listing BOTH containers (busybox, nginx) with a `filter:` field and `↑/↓ select · Enter confirm · Esc cancel`. Multi-container picker path confirmed. (Esc cancels cleanly.) |
| EX-02 | exec handover | Pick a container | Confirm | App **suspends** Ink and hands the terminal to the shell; you get an interactive prompt in the pod | PASS — Enter on the exec prompt hands over to an interactive shell **inside the pod**: prompt `root@web-6b4dff767b-6jqtx:/#`, ran `hostname` → `web-6b4dff767b-6jqtx`, `id` → `uid=0(root)`. MINOR VISUAL: the Ink frame is not fully cleared on handover — the old grid remains drawn above the live shell prompt (shell works correctly regardless). |
| EX-03 | exec return restores mouse | Exit the shell (`exit`) | Return to p9r | Ink resumes; **mouse modes restored** — back in shell later, no escape leak; capture shows clean main grid | PASS — `exit` terminates the shell and p9r resumes a clean main grid (mode `[·]`, list focused). Verified **mouse modes restored**: an SGR click on the sidebar after return correctly moved focus to `⌖ sidebar`. No stderr errors, no escape leak. (Also satisfies MS-26.) |
| EX-04 | port-forward manager F | Main grid | `F` | Port-forward manager overlay opens, listing active forwards | PASS — `F` opens the **Port Forwards** overlay listing active/failed forwards (e.g. `● localhost:9090 → prometheus-…:9090 [✕]`, failed `✕ localhost:80 → web-… [retry]`) plus a RECENT section with `[Restore]`, and `[+ New Forward] [Close]`. — **[CONF-RUN 2026-06-17, commit 0fea256] PF manager bottom-row button clicks re-verified: `[Close]` PASS, `[+ New Forward]` FAIL.** Clicking `[Close]` (interior, at its visible row) closes the manager (count 1→0) ✅. BUT clicking `[+ New Forward]` (interior, at its visible row — row 6 in the compact layout, row 9 when a RECENT row is present) **does NOT open the new-forward flow — it just closes the manager** (no `⇄ … remote:local` prompt, no picker, mode returns to `[·]`). Root cause confirmed read-only in `src/adapters/live/LiveApp.tsx` (~L568): **`onNewForward={controller.closePfManager}`** is wired to the same close handler as `onClose`, so `[+ New Forward]` is a duplicate "close" instead of opening a new forward. The `0fea256` fix made both buttons *respond* to clicks (previously unclickable) but mis-wired New Forward. Severity: FUNCTIONAL (the `[+ New Forward]` button is non-functional; new forwards must still be created via `p` on a pod/Service). |
| EX-05 | create port-forward | PF manager / `p` on a pod | Specify ports, confirm | Forward established and listed; local port reachable | PASS (with caveats) — `p` on the **prometheus** pod (default 9090:9090) + Enter established a working forward: command bar shows `⇄ 1  ⇄ Forwarding localhost:9090 → prometheus-…:9090`, `curl http://localhost:9090/-/healthy` → **200**, and a `kubectl port-forward … 127.0.0.1:9090 LISTEN` is confirmed. CAVEATS: (1) the toast says "Forwarding…" **optimistically before the listen succeeds** — a forward on web:80 showed the same success toast but actually FAILED (privileged port; the manager correctly showed `✕ … unable to listen on any of the requested ports [{80 80}]`). (2) The port field is non-editable, so you're stuck with the default ports. |
| EX-06 | stop port-forward | PF manager with an active forward | Select + stop | Forward removed from the list and torn down | **[W4] PASS — FIXED (both paths)** — started a real forward (`p` on a web pod, edited local port to a high port → curl 200, kubectl child confirmed). In the PF manager: pressing **`x`** on the selected active row tore it down (row moved to RECENT `[Restore]`, kubectl child DEAD, curl→000); and clicking its **`[✕]`** interior on a fresh forward tore it down identically (child DEAD, curl→000). The Wave-2 "cannot stop a forward via the UI" bug is resolved. NOTE (separate follow-up): the PF port field IS now editable (the earlier "non-editable" note does not reproduce). — **[CONF-RUN 2026-06-17, commit 0fea256] per-row `[✕]` click re-verified PASS.** Started a real forward via `p` on `demo/web-…-fv2s2` (edited local port to `8090` by typing — the field appends digits — → `curl localhost:8090` = **200**, `kubectl port-forward pod/web-… 8090:80` child confirmed). In the PF manager, clicking the active row's **`[✕]`** (display col 54, accounting for multibyte glyphs) tore it down: the row moved to RECENT `[Restore]`, the kubectl child DIED (`pgrep` empty), and `curl` → **000**. |

---

## 11. Context switching

All **[CLUSTER]**; ideally with **two** contexts configured (one reachable, one not).

| ID | Area | Pre | Steps | Expected | Result |
|----|------|-----|-------|----------|--------|
| CX-01 | c opens switcher | Normal mode | `c` | Context switcher opens with the **current context marked** (accent + marker) | PASS — `c` opens the "Switch Context" switcher; current context marked `● docker-desktop`; filter field present. |
| CX-02 | chip opens switcher | Main grid | Click the header context chip (see MS) | Same switcher opens | PASS — clicking the header `docker-desktop` chip opens the same "Switch Context" switcher. Also satisfies MS-18. |
| CX-03 | c is literal while typing | List filter `/` active (or command input) | `c` | `c` appended to the input; switcher does **NOT** open | PASS — with the list filter active (`/ab`), pressing `c` appends → `/abc` and does NOT open the switcher. |
| CX-04 | filter contexts | Switcher open | Type part of a context name | List filters to matching contexts | PASS — typing `docker` keeps `docker-desktop`; a non-matching suffix shows `No matching contexts`. |
| CX-05 | navigate + select | Switcher open | `Down`/`Up`, `Enter` on a different reachable context | Switcher **closes immediately**; header shows `… connecting to <ctx>` | **[W4] PASS** — with a throwaway kubeconfig (`dd-copy`, `dd-broken`, `docker-desktop`): `c` opens the switcher listing all 3, current marked `●`. Selecting the reachable `dd-copy` (via filter `copy`+Enter) closes the switcher immediately and the header switches to `dd-copy`. (NOTE: the selection-cursor highlight is not very visible in capture, so I selected deterministically via the filter field rather than arrow-stepping.) |
| CX-06 | connected clears status | After CX-05, reachable ctx | Wait for first sync | Connecting status clears; list populates from the new context | **[W4] PASS** — after switching to `dd-copy`, the connecting status clears (no error/connecting banner) and the Overview/list populate (`Cluster Health — dd-copy`, resources listed). |
| CX-07 | switch to current = no-op | Switcher open | Select the context you're already on | No-op; no reconnect | PASS — selecting `docker-desktop` (the current ctx) closes the switcher with no reconnect/banner/error; list intact. |
| CX-08 | error banner | Select an **unreachable** context | Wait | Persistent banner `✗ Could not connect to <ctx>: <reason>` with `[Retry]` and `[Switch context]` buttons | **[W4] PASS** — selecting `dd-broken` (server `https://127.0.0.1:1`) raised the persistent banner `✗ Could not connect to dd-broken: ECONNREFUSED  Retry  Switch context` (header `c:dd-broken`, Overview shows `Cluster Health — dd-broken`). |
| CX-09 | Retry action | CX-08 banner shown | Press/click `[Retry]` (`r`) | Re-runs the connection attempt | **[W4] PASS** — both the `r` key AND clicking `[Retry]` re-fire the connection attempt; the ECONNREFUSED banner reappears (server still unreachable). |
| CX-10 | Switch-context action | CX-08 banner shown | Press/click `[Switch context]` | Reopens the switcher | **[W4] PASS** — clicking `[Switch context]` reopens the "Switch Context" switcher (now `● dd-broken` current, all 3 listed). |
| CX-11 | per-context memory (ns+kind) | On ctx A: set ns=kube-system, select kind=Deployments; switch to ctx B; switch back to A | Observe A | A restores ns=kube-system and kind=Deployments (validated against current cluster); B kept its own ns/kind | **[W4] PASS** — set `dd-copy`→demo/Pods and `docker-desktop`→kube-system/Deployments. Switching back and forth restored each context's own ns+kind: dd-copy reopened on demo/Pods, docker-desktop reopened on kube-system/Deployments. Per-context memory is independent and correct. |
| CX-12 | memory survives restart | Set ns+kind on a context, quit, relaunch | Observe | The remembered ns+kind for that context is restored from `layout.json` | **[W4] PASS — FIXED** — using a throwaway HOME: set ns=demo + kind=Services, quit cleanly (`EXITED=0`). `layout.json` `contexts` now contains `{"docker-desktop": {"namespace": "demo", "activeKind": "Services"}}` (was `{}` in Wave 2). Relaunched → app reopened on **ns=demo / Services** (restored). The Wave-2 "per-context ns/kind memory lost on restart" bug is resolved. |
| CX-13 | memory validation fallback | Remembered kind no longer exists in cluster | Switch to that context | Falls back to `Overview` (kind) / all-namespaces (ns) when the remembered value is gone | **CANNOT RUN — needs a second context / a way to invalidate the remembered kind** (single context; not feasible to safely make a kind disappear). |

---

## 12. Namespace dropdown

All **[CLUSTER]**.

| ID | Area | Pre | Steps | Expected | Result |
|----|------|-----|-------|----------|--------|
| NS-01 | open via n | Main grid | `n` | Namespace picker/dropdown opens listing namespaces | PASS — `n` opens the **Namespace** picker (modal) listing all 9 namespaces + `(all namespaces)`, a `filter:` field, and hint `↑/↓ select · Enter confirm · Esc cancel`. |
| NS-02 | open via header dropdown | Main grid | Click the header `[ns ▾]` DropdownButton | Same dropdown opens (anchored under the button) | PASS — clicking the header `[demo ▾]` opens a namespace dropdown anchored under the button (lists namespaces below the header). MINOR: this header-anchored variant overlays the frame a bit roughly (e.g. `kube-publicease` overlap artifact) and does not show an explicit `(all namespaces)` row (only the `n`-picker does). Also satisfies MS-17. |
| NS-03 | filter | Dropdown open | Type part of a namespace name | List filters to matching namespaces | PASS — typing `demo` in the `n` picker narrows the list to just `demo`. |
| NS-04 | select | Dropdown open | `Down`/`Enter` on a namespace | Namespace switches; list reloads scoped to it; header reflects new ns | PASS — selecting `demo` switches ns: header `[demo ▾]`, command bar `ns: demo`, list reloads scoped to demo. |
| NS-05 | all-namespaces | Dropdown open | Select the all-namespaces entry | List shows resources across all namespaces | PASS — selecting `(all namespaces)` in the `n` picker sets header `[all ▾]`, command bar `ns:` blank, and the list shows resources across all namespaces. |

---

## 13. Metrics

All **[CLUSTER]**. Some require Prometheus / metrics-server installed (note inline).

| ID | Area | Pre | Steps | Expected | Result |
|----|------|-----|-------|----------|--------|
| MT-01 | sparkline column | Pods list, metrics available | Inspect list | A sparkline column renders per row; `~` dim prefix when from session buffer (metrics-server-only) | PASS — Pods list renders a per-row CPU sparkline column with the `~` dim prefix (e.g. `~▃▂▂▂▃▇▂▃▃▃`). NOTE: the two brand-new demo pods (crasher, age 1h/17m) show no sparkline yet (insufficient history); established pods all show one. |
| MT-02 | metrics detail tab | Open a pod's detail → Metrics tab | Inspect | Full ASCII/Braille charts (CPU/mem) render; not wrapped | PASS — Metrics tab on coredns renders full ASCII block charts: `CPU Usage`, `Memory Usage`, `Network I/O`, each with Y-axis labels (8/6/4/2/0, 20M/15M/…) and X-axis time labels (05:28 / 05:58). No line wrapping; fits the Rect. |
| MT-03 | time-range selector [ / ] | Metrics tab | `[` then `]` | Cycles the chart time range; chart re-renders for the range | **[W4] PASS — FIXED** — the selector `[20m] [1h] [4h] [1d] [2d]` now cycles BOTH directions: `]` increases (1h→4h→1d→2d, clamps at 2d) and `[` decreases (1d→4h→1h→20m, clamps at 20m), charts re-render. The Wave-2 "`[` decrease is a no-op" bug is resolved. |
| MT-04 | Prometheus vs fallback | Cluster with Prometheus | Inspect Metrics tab | Full history + multiple charts; range options (1h/4h/1d/2d) enabled | PASS — Prometheus is connected; the Metrics tab shows full multi-range history with all ranges `20m/1h/4h/1d/2d` enabled and real charts. (No "session data" / "Prometheus not found" note present, as expected with Prometheus.) |
| MT-05 | metrics-server-only note | Cluster with metrics-server only, no Prometheus | Inspect Metrics tab | `ℹ Prometheus not found — showing current values only.` note; historical ranges disabled; `session data` label | **N/A — this cluster HAS Prometheus** (monitoring/prometheus connected), so the metrics-server-only note correctly does NOT appear; can't exercise without removing Prometheus. (Aside: the Overview best-practices panel says "No Prometheus found in cluster" while the Overview METRICS section AND the detail Metrics tab both show Prometheus connected — an internal inconsistency worth a look, but out of MT-05 scope.) |
| MT-06 | no metrics at all | Cluster without metrics | Inspect Metrics tab | Graceful guidance message (install metrics-server / Prometheus); no crash | **N/A — cluster has both metrics-server and Prometheus**; can't reach the no-metrics state without breaking the cluster. |

---

## 14. Agent

**[CLUSTER]** + a downloaded model (or no-agent mode).

| ID | Area | Pre | Steps | Expected | Result |
|----|------|-----|-------|----------|--------|
| AG-01 | open agent input | Main grid | `Space` | Command bar enters agent prompt mode; block cursor | PASS — Space opens agent input: `[!]` cyan mode glyph + inverse block cursor. (Model configured: `onnx-community/Qwen3-0.6B-ONNX`.) |
| AG-02 | ask a question | AG-01 active | Type e.g. `show me failing pods`, `Enter` | Agent runs; a response / navigation occurs | PASS — `show me failing pods` + Enter → command bar shows `> thinking…`, then (~40s) a generated answer renders in the detail pane (`> show me failing pods` / "The failing pods include those with no CPU or memory limits set, and running as root… triage summary…") with a `[Clear history]` button. No crash. Conversation history is retained across turns. |
| AG-03 | tool-call line | Agent answering a question that uses a tool | Observe | A tool-call line is shown (the agent's tool invocation is surfaced) | INCONCLUSIVE — a follow-up `list the deployments` returned `↳ I couldn't understand the model's response. Try rephrasing your query.` (the small Qwen3-0.6B drifted on tool-call syntax — the documented, deliberately-tolerated case). No visible tool-call line was surfaced in either run; the drift was handled gracefully (no crash). Could not deterministically elicit a clean tool-call line with this small model. |
| AG-04 | no-agent mode | Launched without a model / no-agent mode | `Space`, type, Enter | Falls back to fast-path command behavior; no crash | **[W2] PASS (fast-path verified) / could not isolate true no-agent** — `Space` + `pods` + Enter resolves via the **fast-path** and navigates the list (`↳ Navigated to Pod`) with no `thinking…` and no crash; NL queries that don't match a fast-path get a graceful fallback (`I couldn't understand that. Try: …`) — no crash either way. NOTE: I could not force a clean *no-agent* launch — even with a fresh `XDG_CONFIG_HOME` the app did not show the ModelChooser and still had a working agent (the model cache is shared across config homes), so the "launched without a model" precondition wasn't reproducible here. The fast-path + graceful-fallback behavior is confirmed regardless. |

---

## 15. Help overlay

**[NO-CLUSTER]** is fine for most (overlay is local), but focus-dependent ordering needs a region focused.

| ID | Area | Pre | Steps | Expected | Result |
|----|------|-----|-------|----------|--------|
| HP-01 | open ? | Main grid, list focused | `?` | Help overlay opens; title **"Keyboard Reference"** renders **fully** (not clipped — regression) | PASS — `?` opens the overlay; title `Keyboard Reference` renders in full, not clipped. |
| HP-02 | grouped, current-region-first | Open `?` while **list** focused | Inspect | Groups shown with the **List** group first, then **Global**, then the rest in canonical order | PASS — with list focused, **List** group leads, then **Global**, then the rest (Sidebar, Detail, …) in canonical order. |
| HP-03 | current-region-first (sidebar) | `Tab` to sidebar, `?` | Inspect | **Sidebar** group leads, then Global | PASS — with sidebar focused, the **Sidebar** group leads. |
| HP-04 | current-region-first (detail/logs) | Open Logs tab focused, `?` | Inspect | **Detail · Logs** group leads, then Global | PASS — with the Logs tab focused, the **Detail · Logs** group leads. |
| HP-05 | accelerators underlined | Help open | Inspect colour capture | Accelerator letters (`c`, `o`, `l`, `p`, `t`, `w`, `d`, `r`) are underlined in the relevant entries | PASS — accelerators are underlined+bold+cyan (e.g. `c` renders `\e[1;4m\e[36mc`); verified on `c`/`r`. |
| HP-06 | scrollable ↑/↓ | Help open, content taller than overlay | `Down`/`Up` | Help content scrolls | PASS — content scrolls (verified via PageDown/PageUp/g/G; scrollbar thumb present). |
| HP-07 | g/G or PageUp/Down in help | Help open | (try) `PageDown`/`PageUp` | Pages through the help (if supported) | PASS — PageDown/PageUp page through groups; `g`/`G` jump to top/bottom. |
| HP-08 | close with ? | Help open | `?` | Help overlay closes; returns to grid | PASS — `?` toggles the overlay closed (open count 1 → close count 0). |
| HP-09 | close with Esc | Help open | `Escape` | Help overlay closes; no quit | PASS — Esc closes the overlay and returns to the grid; app stays up. |
| HP-10 | all keymap groups present | Help open, scroll through all | Inspect | Every KEYMAP group appears: Global, Sidebar, List, Detail (all tabs), Detail · Logs, Detail · YAML, Detail · Metrics, Command bar, Overlays | PASS — scrolling reveals every group: List, Global, Sidebar, Detail (all tabs), Detail · Logs, Detail · YAML, Detail · Metrics, Command bar, Overlays. |


---

## 16. Mouse interactions

All **[CLUSTER]** unless noted. X = column, Y = row (1-based as shown on screen).
Determine X/Y from the plain capture before each click.

| ID | Area | Pre | Steps | Expected | Result |
|----|------|-----|-------|----------|--------|
| MS-01 | click region → focus (sidebar) | Main grid, list focused | Click inside the sidebar region | Sidebar becomes focused (accent border moves there) | **[W3] PASS** — clicking inside the sidebar (col10,row5) moved focus there (accent `║` on left, `⌖ sidebar`). |
| MS-02 | click region → focus (list) | Sidebar focused | Click inside the list region | List becomes focused | **[W3] PASS** — clicking the list region (col60,row5) focused the list (`⌖ list`, accent on right). |
| MS-03 | click region → focus (detail) | Detail open, list focused | Click inside the detail region | Detail becomes focused | **[W3] PASS** — with detail open, clicking the detail body (col60,row25) focused detail (`⌖ detail`). |
| MS-04 | click region → focus (command bar) | Main grid | Click the command bar | Command bar becomes focused | **[W3] PASS (as designed)** — clicking the command bar (row49) enters command **input** mode (`[!]` glyph + accent border). The command bar has no passive focus state (per FR-10); the click activates it. |
| MS-05 | click region → focus (header) | Main grid | Click empty header area | Header becomes focused (if focusable) | **[W3] N/A** — header is not a focusable region (not Tab-reachable per navigation.ts); clicking empty header area (col100,row2) is a no-op for focus. (Clicking the header's *controls* — chip/dropdown — works, see MS-17/MS-18.) No crash. |
| MS-06 | click row → select | List focused, multiple rows | Click a non-selected row | That row becomes selected (highlight moves to it) | **[W4] PASS — FIXED** — clicking a list row selects exactly the row AT the cursor Y: Y=5→crasher, Y=7→web-grgld, Y=9→web-zhb6n (each lands on the row it's on, no off-by-one). Column is irrelevant (correct). The Wave-3 vertical off-by-one is resolved. |
| MS-07 | second click row → open detail | A row already selected | Click that same row again | Detail pane opens for that row | **[W3] PASS (with MS-06 caveat)** — a 2nd click on the same row opens the detail pane (focused). The pod it opens reflects the MS-06 off-by-one (the row below the cursor). The open-on-2nd-click mechanism itself works. |
| MS-08 | wheel over list scrolls list | Detail open, list under cursor | Wheel-down at list coords (`\e[<65;X;YM`) | The **list** scrolls — not the detail (routes by cursor geometry) | **[W3] PASS** — with detail open + list shrunk to overflow, wheel-down over the list (col75) scrolled the LIST viewport (crasher→local-path-provisioner→web) while the detail header (Metrics — crasher) stayed unchanged. Geometry-routed correctly. |
| MS-09 | wheel over detail scrolls detail | Detail open | Wheel-down at detail coords | The **detail** content scrolls, not the list | **[W3] PASS** — wheel-down over the detail body (col60,row30) scrolled the Metrics content; the list rows were untouched. |
| MS-10 | wheel over sidebar scrolls sidebar | Long sidebar | Wheel at sidebar coords | Sidebar scrolls | **[W3] PASS** — at a constrained height (200×24) where the sidebar overflows (`↓ …`), wheel-down over the sidebar (col15) scrolled it (Overview→`↑ …`+ReplicaSets/Jobs/Pods); wheel-up restored the top. (Needs an overflowing sidebar; it fits at full height.) |
| MS-11 | wheel up at list | List scrolled down | Wheel-up at list coords (`\e[<64;X;YM`) | List scrolls up | **[W3] PASS** — after scrolling the list to the bottom, wheel-up over the list (col75,row7) scrolled it back up (local-path-provisioner→kube-apiserver). |
| MS-12 | drag sidebar│list handle | Main grid | Press on the sidebar│list vertical border, drag right several cols, release | Sidebar widens; list narrows; layout recomputes; no `Maximum update depth` | **[W3] PASS** — pressing the sidebar│list border (col46) and dragging right to col60 moved the border to col61 (sidebar widened, list narrowed, ~delta matches); dragging back returned it to col47. No `Maximum update depth`. |
| MS-13 | drag list│detail handle | Detail open | Press on the list│detail border, drag, release | The list/detail split ratio changes | **[W3] PASS** — the list│detail split is a *horizontal* handle (list top / detail bottom). Pressing it (row13,col100) and dragging down to row21 moved the split to row21 (list grew, detail shrank); delta exact. |
| MS-14 | grabbed handle does not slip | Mid-drag | Start a drag on a border, move the cursor a column to the side and several rows away, release | The grabbed handle keeps tracking (no slip to a different handle/region) | **[W3] PASS** — during a horizontal-split drag, the cursor X wandered far left (into the sidebar col20) and far right (col160) while moving up; the grabbed handle kept tracking the Y and landed exactly at the release row (14). No slip to another handle. |
| MS-15 | click detail tab → switch | Detail open | Click a tab label in the tab strip | Detail switches to that tab | **[W4] PASS — FIXED** — clicking each tab label at its VISIBLE row (row 14) switches to that exact tab: Overview(col49)→METADATA, YAML(col60)→[Edit], Events(col67)→events panel, Logs(col76)→stream, Metrics(col83)→charts. Column AND row hit-test both correct (no off-by-one). The Wave-3 vertical off-by-one is resolved. |
| MS-16 | click ✕ → close detail | Detail open | Click the close `✕` control | Detail pane closes | **[W4] PASS — FIXED** — clicking the `✕` at its VISIBLE row (col 92, row 14) closes the detail (tab strip gone, focus returns to list). No off-by-one. |
| MS-17 | click namespace DropdownButton | Main grid | Click the header `[ns ▾]` | Namespace dropdown opens; click an item → namespace switches | **[W3] PASS** — clicking the header `[all ▾]` (col23,row2) opened the namespace dropdown; clicking the "demo" item (row5) switched ns to demo (header `[demo ▾]`, command bar `ns: demo`). Header-control clicks and dropdown-item clicks both work (no off-by-one in the header/overlay). MINOR: header-anchored dropdown still shows the `kube-publicease` overlap artifact (per NS-02). |
| MS-18 | click context chip → switcher | Main grid | Click the header context chip | Context switcher opens | **[W3] PASS** — clicking the `docker-desktop` chip (col8,row2) opened the "Switch Context" switcher (`● docker-desktop` marked). |
| MS-19 | click Logs [Container ▾] | Logs tab | Click `[Container ▾]` | Container dropdown opens; click an item selects it | **[W3] PASS** — clicking `[Container ▾]` (col54,row17) opened the container dropdown (`● nginx ✓`); clicking the nginx item closed it and selected it. Dropdown opens at the visible row (no off-by-one for the toolbar). |
| MS-20 | click Logs [NNN lines ▾] | Logs tab | Click `[NNN lines ▾]` | Line-limit dropdown opens; click an item selects it | **[W3] PASS** — clicking `[100 lines ▾]` (col92,row17) opened the line-limit dropdown (Last 100/500/1000/5000 lines, …); clicking "Last 500 lines" updated the toolbar to `[500 lines ▾]`. |
| MS-21 | accelerator letters fire buttons | Logs tab | Press the underlined accelerator (`o`,`l`,`p`,`t`,`w`,`d`) | Each fires the same action as clicking the corresponding button | **[W3] PASS** — all fire: `o`→container dropdown, `l`→line-limit dropdown, `p`→pause/resume Live toggle, `t`→timestamps on/off, `w`→wrap on/off, `d`→download (`✓ Saved to ~/Downloads/p9r-logs-…-<ts>.txt`). |
| MS-22 | click Logs toggle buttons | Logs tab | Click the pause / timestamps / wrap / download buttons | Each toggles/fires like its accelerator | **[W3] PASS** — clicking the toolbar buttons at their visible row (row17) fires each: Timestamps (col75) toggled on→off, Wrap (col83) off→on, Download (col104) → `✓ Saved to ~/Downloads/…`, pause (col64) toggled Live↔Paused. No off-by-one for these toolbar buttons. |
| MS-23 | click confirm-dialog buttons | Delete confirm open | Click `[Yes]` / `[No]` (or the accent buttons) | The corresponding action fires | **[W3] PASS — appears FIXED** — on the command-bar delete confirm `[Delete] [Cancel]`, clicking the **button center** fires it: `[Cancel]` (mid-col) dismissed the dialog reliably (3/3 trials, pod not deleted); `[Delete]` (mid-col 42) fired the delete (crasher deleted+respawned). NOTE: clicks must land on the button's interior — hitting the bracket edge (e.g. col47 of a `[Cancel]` at 44) misses. This is an improvement over the Wave-1/2 "non-default confirm buttons unclickable" defect (DT-07/YA-09/EX-06 family) — at least the delete confirm now responds to clicks. |
| MS-24 | click context banner buttons | Error banner shown (CX-08) | Click `[Retry]` / `[Switch context]` | Each fires its action | **[W4] PASS** — with the `dd-broken` error banner up: clicking `[Retry]` (col 52, row 49) re-fired the connection (banner reappeared); clicking `[Switch context]` (col 60, row 49) reopened the switcher. Both banner buttons fire on click. |
| MS-25 | mouse modes restored on quit | Main grid | `q` then move the mouse in the shell | No SGR escape sequences leak; mouse reporting off | **[W3] PASS** — `q` quit cleanly (shell prompt returned — quit-hang fixed, confirming W2); after quit, a shell `echo` ran normally and a captured pane showed **0** stray mouse escape sequences (`\e[<…` / mode `100Xh`). Mouse reporting is off; no leak. (The un-cleared grid above the prompt is cosmetic; the shell underneath is clean.) |
| MS-26 | mouse modes restored on suspend | During exec handover or `$EDITOR` pop-out | Move mouse while suspended, then return | No escape leak while suspended; clean grid + working mouse on return | **[W3] PASS (per Wave 2)** — verified in EX-03 (exec `exit` → SGR click correctly moved focus, no leak) and YA-08 (`$EDITOR` pop-out restored mouse modes on return). Not re-driven in W3 to avoid extra suspend cycles; mechanism confirmed clean. |
| MS-27 | mode 1003h suppressed | Any mouse activity | Move the mouse without clicking, watch stderr/shell | No any-motion (1003h) reporting; only press/release/wheel/drag events handled; no flood | **[W3] PASS** — injecting bare any-motion events (`\e[<35;X;YM`, button-less motion) caused no state change (focus unchanged) and no stderr flood (stderr stayed at 1 line — just the shell echo). Any-motion (1003h) is suppressed; only press/release/wheel/drag are handled. |

---

## 17. Resize

All **[CLUSTER]**.

| ID | Area | Pre | Steps | Expected | Result |
|----|------|-----|-------|----------|--------|
| RS-01 | shrink width | Main grid at 170 cols | `tmux resize-window -t p9r -x 100` (or new session at -x 100) | Frame recomputes to the new width; borders still form a connected grid; no wrap/clip; focused border style preserved | **[W3] PASS** — at 100×50 the connected grid recomputed: full-width header, narrowed sidebar, list shows `›` overflow marker (columns degrade), no wrap/clip. |
| RS-02 | grow width | At 100 cols | Resize to `-x 200` | Frame recomputes; columns/charts use the extra width; no clip | **[W3] PASS** — at 200×55 the list uses the extra width to show MORE columns (CPU + Memory sparklines, `›` marker gone); no clip. |
| RS-03 | shrink height | At -y 50 | Resize to `-y 24` | Frame recomputes; sidebar/list/detail heights shrink; command bar stays at bottom; no overflow | **[W3] PASS** — at 200×24 heights shrank, command bar stayed at the bottom, no overflow; sidebar gained an `↓ …` overflow indicator (correctly scrollable). |
| RS-04 | grow height | At -y 24 | Resize to `-y 60` | Frame fills the new height | **[W3] PASS** — at 200×60 the frame fills the height; command bar at row 59, bottom border row 60. |
| RS-05 | narrow extreme | Resize to `-x 70` | Inspect | List columns degrade gracefully (pinned status+Name remain); no wrap-by-one; no crash | **[W3] PASS (minor cosmetic at sub-min size)** — at 70×30 the list pins `● Name`, shows Namespace with `›` overflow, no column wrap, no crash. At an extreme 70×20 it still doesn't crash/loop, but the **command-bar content overflows onto a wrapped line below the `└─┘` frame border** (cosmetic artifact at sub-minimum terminal sizes). |
| RS-06 | focus border survives resize | Focus a region, resize | Inspect after | The focused region keeps its double-line accent after recompute | **[W3] PASS** — focused sidebar, resized to 150×45: focus stayed `⌖ sidebar` and the sidebar's left border kept the bold-cyan double-line `║` accent after recompute. |
| RS-07 | detail open across resize | Detail open, resize width and height | Inspect | Detail content reflows within its Rect; nothing clipped past the border | **[W3] PASS** — with detail open, resized to 110×35 (Metrics) and 90×30 (YAML): every content row ends cleanly at the `║` right border, scrollbar intact, nothing clipped/spilling; tab strip fits. |
| RS-08 | no render loop on resize | Rapidly resize a few times | Check `/tmp/p9r-err.txt` | No `Maximum update depth` / stack traces | **[W3] PASS** — 8 rapid resizes across 70×20…200×55 produced **0** `Maximum update depth` / stack traces; stderr stayed at 1 line (shell echo only); frame renders fine after. |

---

## 18. Regression checks (README "Bugs fixed")

Each maps to a specific historical bug. **[CLUSTER]** unless noted.

| ID | Area | Pre | Steps | Expected | Result |
|----|------|-----|-------|----------|--------|
| RG-01 | list wrap-by-one | List with N rows, selection at top | `Up`/`k` at the top; `Down`/`j` at the bottom | Selection clamps at the edge — never wraps by one to the opposite end (see LT-03/LT-04) | **[W3] PASS** — with list focused: at the top, `Up`/`k` keep the first pod selected (no wrap to bottom); at the bottom, `Down`/`j` keep the last pod (no wrap to top). |
| RG-02 | metrics-tab wrapping | Metrics tab, narrowish width | Inspect chart/metric lines | Metric lines do **not** wrap onto extra rows; they fit the detail Rect (see DSC-09/MT-02) | **[W3] PASS** — on the Metrics tab, every chart/metric line ends at the `║` border (0 lines spill); no wrapping onto extra rows. Verified at narrow widths too (RS-07). |
| RG-03 | logs picker not full-screen | Multi-container pod, open Logs, press `o` | Inspect | Container picker is an **inline dropdown** anchored under the button — NOT a full-screen modal; logs keep streaming behind it (see LG-01/LG-03) | **[W3] PASS** — `o` (and clicking `[Container ▾]`, MS-19) opens an **inline** dropdown (`● nginx ✓`) anchored under the button, over the streaming logs — NOT a full-screen modal. (Single-container pod here, so one entry; the picker form is inline.) |
| RG-04 | / in Logs not leaking to global | Logs tab focused | `/`, type a query | Search stays **within the logs**; the global pod/list filter is untouched (verify list unchanged on returning to it) (see LG-15) | **[W3] PASS** — on the Logs tab, `/` + `docker` kept the command bar in `[·]` (NOT `[/]` global filter); the search stayed within the logs context, the global list was not filtered. |
| RG-05 | wheel not scrolling list while detail focused | Detail open and **focused** | Wheel over the **detail** region | The detail scrolls; the list does **not** scroll (geometry-routed) (see MS-08/MS-09) | **[W3] PASS** — with detail focused (YAML), wheel-down over the detail scrolled the YAML body (line 11→20); the list selection was untouched. Geometry-routed correctly (also see MS-08/09). |
| RG-06 | arrows not scrolling list while detail focused | Detail open and focused | `Up`/`Down` | The **detail content** scrolls; the list selection does **not** move (arrows act within the focused region) | **[W3] PASS** — with detail focused, `Down` x10 scrolled the YAML body (to line 11); after closing detail the list selection was still the original pod (web-6jqtx, unmoved). Arrows act within the focused detail, not the list. |
| RG-07 | help title not clipped | Open `?` | Inspect top of overlay | Title **"Keyboard Reference"** renders in full, not truncated (see HP-01) | **[W3] PASS** — `?` opens the overlay with the full title "Keyboard Reference" (not clipped); `?` again closes it. |
| RG-08 | no Button render-loop **[NO-CLUSTER ok]** | Interact with any measured `<Button>`/`<DropdownButton>` (open/close dropdowns, click buttons repeatedly) | After each, `grep "Maximum update depth" /tmp/p9r-err.txt` | **No** `Maximum update depth` errors in stderr at any point | **[W3] PASS** — across the entire wave (container/line-limit dropdowns opened+closed repeatedly, toolbar/confirm/header buttons clicked, 8 rapid resizes, drag-resizes, tab switches), `grep "Maximum update depth"` = **0** at every checkpoint; stderr never exceeded 1 line (shell echo). No render loop. |

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
| RG-09 | refresh `r` | List focused, normal mode **[CLUSTER]** | `r` | The resource list refreshes/re-fetches (no error; loadState cycles) | **[W3] PASS** — with the list focused, `r` re-fetched the resource list; the list reloaded and stayed populated, no error/stderr. |
| KB-RS1 | resize split `+` | Detail open **[CLUSTER]** | `+` several times | The list/detail vertical split grows the detail side; geometry recomputes | **[W3] PASS** — with detail open, `+` grows the detail side (the horizontal split moved up ~2 rows per press: 21→19→17→15); geometry recomputes cleanly. |
| KB-RS2 | resize split `-` | After KB-RS1 | `-` several times | The split shrinks the detail side back | **[W3] PASS** — `-` shrinks the detail side back symmetrically (15→17→19→21). |
| KB-RS3 | resize split Alt+↑/↓ | Detail open | `Alt+Up`, `Alt+Down` (`tmux send-keys -t p9r M-Up` / `M-Down`) | Equivalent to `+`/`-`; split resizes | **[W3] PASS** — `M-Up` grows the detail (split 21→15) and `M-Down` shrinks it (15→21), identical to `+`/`-`. |
| KB-G1 | overlay g (top) in detail | Long detail tab focused | `g` | Scrolls content to top (pairs with DSC-04) | **[W3] PASS** — on the YAML tab, `G` jumped to the bottom (line ~206) and `g` jumped back to the top (line 1 `kind: Pod`). |

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

Wave 4 (final verification) — corrected section verdicts after the 12 fixes:
1  Launch & first-run            12 / 13  (LR-07/08/09 quit-hang now PASS; N/A: LR-10)
4  List / table                 16 / 16  (LT-16 now PASS)
5  Command bar                  10 / 10  (CB-07/08 now PASS)
6  Detail (all tabs)            17 / 17  (DT-07 now PASS; DSC-07 still partial-by-fixture)
7  Logs tab                     PASS: LG-01,02,03,04,10,11,13,14,15,16,17 (LG-02/03/04 fixed via demo/multi); NOT RUN: LG-05,06,18 (un-stageable fixtures)
8  YAML tab                     PASS: YA-01..08,10; REMAINING FAIL: YA-09 discard via Enter/click (y/n accelerator works)
9  List-row actions             9 / 9    (AC-05 deleted-row reconcile now PASS)
10 Exec & port-forward          6 / 6    (EX-06 now PASS; EX-01 PASS via demo/multi)
11 Context switching            12 / 13  (CX-05,06,08,09,10,11,12 now PASS; CX-13 NOT RUN — un-stageable)
13 Metrics                      PASS: MT-01,02,03,04 (MT-03 now PASS); N/A: MT-05,06 (cluster has metrics+Prom)
16 Mouse interactions           PASS incl. MS-06,15,16,24 (off-by-one fixed; banner-button clicks fixed)
18 Regression (Bugs fixed)      8 / 8    ✅ re-verified
NEW remaining bugs: YA-09 discard click/Enter; PF-manager bottom-row [Close]/[+ New Forward] clicks (both low-severity, click-activation family)

Wave 2 executor: sections 9–15 + YA-02/06/07/08/10
8  YAML tab (YA-* W2)            PASS: YA-02 reveal, YA-06 diff, YA-10 409-reload; FAIL: YA-07 apply (always 409s); PARTIAL: YA-08 ($EDITOR runs+mouse-restore ok, content-reload broken); YA-09 now PASS via y-accelerator
9  List-row actions             9 / 9    (AC-05 action PASS but list keeps stale deleted row; rest PASS)
10 Exec & port-forward          4 / 6    (PASS: EX-02,03,04,05; FAIL: EX-06 stop forward; EX-01 N/A no multi-container)
11 Context switching            5 / 13   (PASS: CX-01,02,03,04,07; FAIL: CX-12 ns/kind memory lost on restart; CANNOT RUN: CX-05,06,08,09,10,11,13 — only one context)
12 Namespace dropdown           5 / 5    ✅
13 Metrics                      3 / 6    (PASS: MT-01,02,04; PARTIAL FAIL: MT-03 `[` decrease is no-op; N/A: MT-05,06 — cluster has metrics+Prometheus)
14 Agent                        3 / 4    (PASS: AG-01,02; AG-04 fast-path PASS; AG-03 inconclusive — small-model drift, no tool-call line)
15 Help overlay                10 / 10   ✅

Wave 3 executor: sections 16 (Mouse), 17 (Resize), 18 (Regression), 19 (keymap extras)
16 Mouse interactions          24 / 27   (PASS: MS-01,02,03,04,05*,07,08,09,10,11,12,13,14,16,17,18,19,20,21,22,23,25,26,27; FAIL: MS-06 + MS-15 — vertical off-by-one in row-select & tab-strip click hit-test; CANNOT RUN: MS-24 — single context. *MS-05 N/A: header not focusable.)
17 Resize                       8 / 8    ✅  (RS-05 minor cosmetic: command bar wraps below the frame at sub-min 70×20)
18 Regression (Bugs fixed)      8 / 8    ✅  (RG-01..RG-08 all PASS — every README "Bugs fixed" item verified)
19 Keymap extras                5 / 5    ✅  (RG-09 refresh, KB-RS1/2 +/-, KB-RS3 Alt+↑↓, KB-G1 g/G all PASS)
```

### Wave 4 — final verification pass (re-verify all prior FAILs + N/A environmental tests)

Driver: live app under tmux 170×50, branch
`claude/keyboard-navigation-improvements-xmjgek` (12 fixes landed). Throwaway
HOME (`/tmp/p9r-final-home`) for restart-memory, throwaway kubeconfig
(`/tmp/p9r-final-kube` with `dd-copy`/`dd-broken`) for multi-context, `demo/multi`
(nginx+busybox) for multi-container. Cluster + fixtures restored after.

**Previously-FAILED tests — every one now PASSES:**

```
LR-07/08/09  quit-hang ............ PASS (EXITED=0, prometheus tunnel torn down, all procs gone)
CB-07/08     !q / !quit hang ...... PASS (clean exit)
LT-16        / scoping ............ PASS (detail-focused / is a no-op; list-context / filters)
DT-07/MS-15  detail tab click ..... PASS (clicks at visible row map to correct tab)
MS-06        list row click ....... PASS (selects row AT cursor Y, no off-by-one)
MS-16        click ✕ close ........ PASS (visible row, no off-by-one)
LG-02        logs toolbar ......... PASS (toolbar + status on separate readable rows w/ logs present)
YA-07        YAML apply ........... PASS (applies w/o 409; label confirmed via kubectl; rv advanced)
YA-08        $EDITOR pop-out ...... PASS (returns to LIVE editor with external edit reflected)
AC-05        deleted row .......... PASS (row leaves via watch; respawn appears; r matches kubectl)
            delete confirm ....... PASS (Enter AND click both fire [Delete]/[Cancel])
CX-12        restart memory ....... PASS (layout.json contexts populated; ns/kind restored on relaunch)
MT-03        metrics range [/] .... PASS (both directions cycle + clamp)
EX-06        stop port-forward .... PASS (x key AND [✕] click both tear down; kubectl child dies)
```

**Part 2 — environmental N/A tests (now executed):**

```
CX-05  navigate+select reachable ... PASS (switcher lists all 3; dd-copy selected, header switches)
CX-06  connected clears status ...... PASS (dd-copy connects, Overview/list populate)
CX-08  error banner ................. PASS (dd-broken → ✗ Could not connect … ECONNREFUSED [Retry][Switch context])
CX-09  Retry ........................ PASS (r key AND click re-fire)
CX-10  Switch context ............... PASS (click reopens switcher)
CX-11  per-context ns+kind memory ... PASS (dd-copy=demo/Pods, docker-desktop=kube-system/Deployments, each independent)
MS-24  click banner buttons ......... PASS (Retry + Switch context fire on click)
EX-01  exec container picker ........ PASS (demo/multi → picker lists busybox + nginx)
LG-03  container dropdown via o ..... PASS (inline, lists both containers over streaming logs)
LG-04  pick container ............... PASS (Enter switches stream busybox→nginx, dropdown closes)
LG-05  auto-open no-default ......... NOT RUN (no all-terminated-container pod stageable; negative case OK)
LG-06  no-containers hint ........... NOT RUN (no zero-container pod stageable)
```

**Part 3 — regression + new observations:**

```
RG-01  list wrap-by-one ............. PASS (clamps top & bottom, no wrap)
RG-02  metrics no-wrap .............. PASS (MT-02; lines fit Rect)
RG-03  logs picker inline ........... PASS (LG-03; not full-screen)
RG-04  / in Logs not leaking ........ PASS (LG-15; stays [·])
RG-05  wheel scrolls detail not list  PASS (wheel over detail scrolls YAML; list untouched)
RG-06  arrows scroll detail not list  PASS (8 Down scroll YAML; list selection unchanged after close)
RG-07  help title not clipped ....... PASS ("Keyboard Reference" full)
RG-08  no Maximum update depth ...... PASS (stderr = 0 errors across the entire run)
Core sweep (sidebar nav, list sel, detail tabs+scroll, ns dropdown, help) .. PASS, no regressions
```

**PF bottom-row button clicks — flagged follow-up: FAIL (remaining bug).**
In the Port-Forward manager, clicking `[Close]` (does not close the manager)
and `[+ New Forward]` (does not open the new-forward dialog) **do not register**
— while the per-row `[✕]` and the `x` key DO work (EX-06). Escape closes the
manager and `p` creates forwards, so this is low-severity. Tracks the same
non-default-button click-activation family.

### Wave 4 — remaining bugs (after the 12 fixes)

1. **FUNCTIONAL (minor) — YAML discard confirm (YA-09) not activatable by
   Enter or click.** The `2615996` "confirm dialog accepts Enter/click" fix
   covered the **delete** confirm (verified working) but NOT the YAML
   `Discard changes? [Yes] [No]` confirm: `Enter` and clicking `[Yes]` are both
   no-ops; only the `y`/`n` accelerators work. Smallest repro: edit a pod's
   YAML, type a char, `Escape` → dialog → `Enter` (stays open) / click `[Yes]`
   (stays open) / `y` (discards). Low severity (keyboard accelerator path works).
2. **FUNCTIONAL (minor) — PF manager bottom-row buttons (`[Close]`,
   `[+ New Forward]`) don't respond to clicks.** Per-row `[✕]` and the `x` key
   work; only the two bottom-row buttons miss. Escape / `p` provide working
   alternatives. Low severity. Same non-default-button click-activation family
   as YA-09.

Neither is a regression of a fixed bug; both are pre-existing residual
click-activation gaps in the confirm/button family that the `2615996` fix only
partially addressed.

### Wave 3 — headline findings (sections 16–19)

1. **FUNCTIONAL (mouse) — vertical off-by-one in click hit-test (MS-06, MS-15,
   tracks DT-07).** Clicking a **list row** selects the row *one below* the
   cursor (Y=5/crasher→web-6jqtx, Y=6→web-grgld, …, last row clamps); clicking a
   **detail tab label** at its visible row is a no-op — you must click *one row
   above* the label for it to register (at which point the *column* maps to the
   correct tab). The ✕ close control (MS-16) has the same one-row offset. So the
   column hit-test is correct but row Y is consistently off by one for the
   list/detail content regions. (The header chip/ns-dropdown and the Logs
   toolbar/dropdowns do NOT exhibit the offset — clicks there land at the visible
   row.) Severity: FUNCTIONAL.

### Wave 3 — fixes confirmed / good news

- **Confirm-dialog button clicks now work (MS-23).** The Wave-1/2 "non-default
  confirm buttons unclickable" defect appears resolved for the delete confirm:
  clicking the **interior** of `[Cancel]` (3/3 reliably) and `[Delete]` (fired
  the delete) both work. Caveat: the click must land inside the button, not on
  the `[`/`]` bracket edge.
- **All Logs toolbar buttons + dropdowns are clickable (MS-19..22).**
  `[Container ▾]`, `[NNN lines ▾]`, Timestamps, Wrap, Download, and pause all
  fire on click at their visible row; dropdown items select on click. Mirrors
  the accelerators (MS-21).
- **Quit clean + mouse modes restored (MS-25).** `q` exits cleanly (shell prompt
  returns — W1 quit-hang stays fixed) with **0** stray mouse escape sequences
  leaked; any-motion (1003h) suppressed (MS-27).
- **Resize is solid (RS-01..08).** Grid recomputes across 70×20…200×60, columns
  degrade gracefully with pinned status+Name, focus accent survives, detail
  reflows within its Rect, and 8 rapid resizes produced **0** `Maximum update
  depth`. Only nit: at the sub-minimum 70×20 the command bar wraps a line below
  the frame (cosmetic).
- **All section-18 regression items PASS (RG-01..RG-08).** Every README "Bugs
  fixed" item re-verified: list wrap-by-one clamps, metrics no-wrap, logs picker
  inline (not full-screen), `/` doesn't leak from Logs, wheel+arrows scroll the
  focused detail (not the list), help title not clipped, and **no** `Maximum
  update depth` anywhere.

### Wave 3 — could-not-execute

- **MS-24** (context-banner buttons) — needs an unreachable context to raise the
  error banner; only `docker-desktop` is configured (same constraint as
  CX-08/09/10).

### Wave 2 — fixes confirmed (Wave-1 failures now resolved)

- **Quit-hang FIXED** — `q` now exits cleanly even with the Prometheus tunnel +
  user port-forwards active; an active forward prompts `N port-forward active.
  Quit anyway? [Quit] [Cancel]` and `[Quit]`+Enter tears down ALL kubectl
  children and exits the bun process (verified `pgrep` empty after quit).
- **Logs toolbar overlap (LG-02) FIXED** — with log lines streaming, the toolbar
  and the `Timestamps/Wrap` status render on separate, readable lines.
- **YA-09 discard confirm** — now actionable via the `y` accelerator (was a
  total dead-end). Enter/Tab/click still don't activate it, only `y`/`n`.
- **Logs container-dropdown spurious auto-open** — does NOT reproduce: opening
  Logs on a single-container pod streams immediately without auto-opening the
  dropdown (correct per spec chunk 06).

### Wave 2 headline failures (sections 9–15 + YA-*)

1. **FUNCTIONAL — YAML apply always 409s (YA-07).** `Ctrl+S`→diff→`Enter` fires
   the apply but it **consistently returns `Conflict — resource was modified`**,
   even on a pod with a provably stable resourceVersion and even <1s after a
   fresh `[Reload & re-edit]`. The identical label edit succeeds via `kubectl`.
   So YAML edits can never be saved to the cluster from the UI. (Silver lining:
   this made YA-10's 409-reload path easy to verify — and that path works.)
2. **FUNCTIONAL — button/confirm activation defect persists broadly.** Same
   family as Wave-1 DT-07/YA-09/MS-23: EX-06 (PF manager `[✕]` stop) can't be
   triggered by click or any key; YA-06/09 dialogs only respond to a default-
   focused button (`[Apply]`/delete `[Delete]` work via Enter because they're
   bold-default; `[Yes]`/`[Cancel]`/`[✕]` non-default buttons don't).
3. **FUNCTIONAL — deleted list row lingers (AC-05).** After a confirmed delete
   (which succeeds server-side + respawns), the deleted pod's row stays in the
   list even after a manual `r` refresh (new pod appears, old one doesn't leave).
4. **FUNCTIONAL — per-context ns/kind memory lost on restart (CX-12).**
   `layout.json`'s `contexts` map stays `{}`; ns+kind set before quit are NOT
   restored on relaunch (app returns to all-ns / Overview). `tabByKind` DOES
   persist, so the seam is specifically the per-context ns/kind write.
5. **FUNCTIONAL — Metrics time-range `[` (decrease) is a no-op (MT-03).** `]`
   cycles the range forward fine; `[` never moves it back.
6. **FUNCTIONAL — YA-08 $EDITOR content round-trip (partial).** The pop-out
   suspends, runs `$EDITOR`, resumes, and restores mouse modes correctly
   (verified) — but on return the editor doesn't reload the externally-edited
   content and drops to a frozen read view with a stuck `[EDIT]` indicator.

### Wave 2 minor / visual notes

- Port-forward "Forwarding…" toast is **optimistic** — shown before the local
  listen actually succeeds (a privileged-port forward showed success but the PF
  manager then correctly reported `unable to listen…`). The PF port field also
  appeared non-editable (stuck on the default ports).
- Exec handover (EX-02) leaves the old Ink grid drawn above the live in-pod
  shell prompt (shell works fine; cosmetic).
- Overview inconsistency: the best-practices panel says "No Prometheus found in
  cluster" while the Overview METRICS section and the detail Metrics tab both
  show Prometheus **connected** (and serve full history).
- YA-02: a stray `[YAML]`/`l]` tab-strip artifact bleeds into the Secret YAML's
  first/mid content lines (cosmetic); `v` reveals values but re-redact toggle-
  back wasn't confirmed.
- AG-03/AG-04: the small Qwen3-0.6B model drifts on tool-call syntax and is
  handled gracefully (`I couldn't understand…`); could not elicit a clean
  tool-call line, and could not force a true no-agent launch (shared model
  cache).

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

---

### Final confirmation run — 2026-06-17 (branch `claude/keyboard-navigation-improvements-xmjgek`, commit `0fea256`)

Independent clean-run re-verification of the two just-claimed fixes (YAML discard
confirm; PF Close/New button clicks) plus a regression sanity sweep, driven under
tmux @170×50 against `docker-desktop` / `demo` fixtures. Each item run from a
fresh state.

**1. YA-09 discard confirm — FAIL (item requires all sub-paths to hold).**
  - (a) `Enter` discards — PASS (reproducible, returns to read mode).
  - (b) **click `[Yes]` discards — FAIL** (click is treated as click-on-editor =
    cancel; returns to EDITING with changes intact).
  - (c) **click `[No]` cancels — FAIL** (no-op; leaves the dialog open).
  - (d) `Esc` cancels — PASS (returns to EDITING with changes).
  - (e) `y` discards / `n` cancels — PASS.
  - The `3cb1d5d` fix added **Enter** support but did NOT wire the `[Yes]`/`[No]`
    mouse-clicks. Keyboard paths (Enter, `y`, `n`, Esc) all work; only click
    activation of the discard confirm is broken (same DT-07/MS-23 family).
    Severity FUNCTIONAL-minor.

**2. PF Close / New clicks — PARTIAL FAIL.**
  - `[Close]` click — PASS (closes the manager).
  - per-row `[✕]` click — PASS (stops the forward; kubectl child dies, curl→000).
  - **`[+ New Forward]` click — FAIL** (closes the manager instead of opening the
    new-forward flow). Root cause (read-only): `LiveApp.tsx`
    `onNewForward={controller.closePfManager}` — wired to the close handler. The
    `0fea256` fix made both buttons clickable but mis-routed New Forward.
    Severity FUNCTIONAL.

**3. Regression sanity sweep — ALL PASS.**
  - `q` quits, process tree torn down (bun + an auto-restored prometheus
    port-forward child both gone), pane returns to the wrapper `sleep`; no
    leftover `bin/p9r`/`port-forward` procs. PASS.
  - Click list row Y → selects the pod AT row Y (row 5→crasher, row 7→web-klb7z,
    via reverse-video). No off-by-one. PASS.
  - Detail: click each tab at its visible (multibyte-corrected) display column →
    switches to THAT tab (Overview/YAML/Events/Logs/Metrics); click `✕` (col 92)
    → closes detail. PASS. (An apparent "off-by-one-tab" during testing was a
    measurement artifact — active-tab styling shifts the strip; using true
    display columns, every tab maps correctly.)
  - YAML apply WITHOUT 409: applied a benign `conftest: ok` label to the
    `demo/app-config` ConfigMap (stable RV) — diff → `Enter` → "applied", cluster
    label confirmed, reverted. PASS. (NOTE: the same edit on a live `demo/web`
    **pod** hit genuine 409s because that pod's resourceVersion drifts under
    kubelet status writes; the conflict-reload path (`r`) correctly re-synced RV —
    YA-10 behaviour, not a regression. Verdict run on the stable ConfigMap.)
  - Help `?` → title "Keyboard Reference" full; PageDown scrolls; Esc closes. PASS.
  - Scroll each detail tab (Overview/Logs/Events/Metrics) with ↑/↓ & PageDown —
    content scrolls, nothing clipped (Overview/Logs/Metrics scroll exercised under
    a deliberately shrunken pane to force overflow; Events shows 0 events, scroll
    keys safe). PASS.
  - `Maximum update depth` over the WHOLE session stderr = **0** (also 0
    TypeError / `at Object` / `Error:`). PASS.

**BOTTOM LINE: NOT CLEAN.** Two remaining FAILs, both in the
confirm/manager click-activation family, both FUNCTIONAL (keyboard/other paths
work):
  1. YA-09 — clicking `[Yes]`/`[No]` on the YAML "Discard changes?" confirm does
     not discard/cancel (only `Enter`, `y`/`n`, `Esc` work). Repro: edit a YAML,
     type a char, `Esc`, click `[Yes]` → stays in editor with changes.
  2. EX-04 — clicking `[+ New Forward]` in the PF manager closes the manager
     instead of opening the new-forward flow (`onNewForward` mis-wired to
     `closePfManager` in `LiveApp.tsx`). Repro: `F`, click `[+ New Forward]` →
     manager closes, no new-forward prompt.

Cluster restored (ConfigMap/pod labels reverted; no leftover forwards); tmux
sessions killed. No source code modified.
