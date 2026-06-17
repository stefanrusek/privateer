# Driving the p9r TUI under tmux

The mechanics for black-box driving the real app. Get these right before you
start a pass — a wrong key code or a miscomputed click column produces *false*
failures that waste a whole loop chasing a bug that isn't there.

Always `export PATH="/opt/homebrew/bin:$HOME/go/bin:$HOME/.bun/bin:$PATH"` first
(Bun isn't on the PATH in non-login shells).

## Launch

Always redirect stderr to a file so you can watch for crashes and render loops —
the app never writes diagnostics to the terminal (that belongs to Ink):

```sh
tmux new-session -d -s p9r -x 170 -y 50 \
  'export PATH="$HOME/.bun/bin:$PATH"; bun run start 2>/tmp/p9r-err.txt; sleep 1200'
sleep 8   # let the first watches + render settle
```

The trailing `sleep 1200` keeps the pane alive after the app exits so you can
still inspect it (and confirm a clean quit). Use a fresh session per wave; kill
it when done (`tmux kill-session -t p9r`). Run **one app session at a time** —
parallel TUIs and a concurrent `bun run gate` will wedge an 8-core host.

The cluster must be up (docker-desktop, with the `demo`/`staging`/`monitoring`
fixtures). If sparse, `bun run fixtures:up`. Metrics sparklines take ~1 min to
land — `sleep` before grabbing a metrics frame.

## Capture

```sh
# colour-stripped, for reading text and computing columns:
tmux capture-pane -t p9r -p > /tmp/cap.txt
# with SGR colour preserved, for checking focus accents / dim states:
tmux capture-pane -t p9r -e -p | sed 's/\x1b\[[0-9;]*m//g'   # strip to read
```

After every meaningful interaction, check the error log — a flood or a stack
trace is a FAIL even when the screen looks fine:

```sh
grep -c "Maximum update depth\|Error\|TypeError\|at Object" /tmp/p9r-err.txt
```

## Keys

Send by NAME, never as a raw space: `tmux send-keys -t p9r Space` (a literal
`' '` arg gets swallowed). Other names: `Enter`, `Escape`, `BSpace`, `Tab`,
`Up`/`Down`/`Left`/`Right`, `C-s` (Ctrl+S), `C-e`. For literal text use `-l`:
`tmux send-keys -t p9r -l 'pods'`. Terminals deliver rapid keys as one chunk —
that's realistic; the app is built to split them.

## SGR mouse injection

The app parses SGR mouse reports straight off stdin. Inject them with `-l`:

```sh
# click at column X, row Y (BOTH 1-based, as the terminal reports):
tmux send-keys -t p9r -l $'\e[<0;X;YM'   # button-1 press
tmux send-keys -t p9r -l $'\e[<0;X;Ym'   # button-1 release  (lowercase m)
# wheel:   up  \e[<64;X;YM     down \e[<65;X;YM
# drag:    motion with button held  \e[<32;X;YM
```

A click is press **then** release at the same cell. A drag is press, several
`<32;…M` motion reports moving by a known delta, then release — use it to test
the resize handles (and check the split moved by the delta with no "slip").

### Computing a click column — the multibyte-glyph trap

To click a labelled control (`[Yes]`, `[+ New Forward]`, a tab name) you must
compute its column from a capture. **The terminal renders box-drawing glyphs
(`║ │ ┌ ┐ ├ ┼ …`) as ONE column each, but they are multiple BYTES in UTF-8.** A
byte-offset (naive `awk`/`cut`/`sed` column math) will be wrong by the number of
box chars to the left, and you'll click the wrong control and report a false
failure. This burned a whole verification loop once.

Compute the column by Unicode **character** index instead:

```sh
python3 - "[Yes]" 15 <<'PY'   # label, 1-based row
import sys
label, row = sys.argv[1], int(sys.argv[2])
line = open('/tmp/cap.txt', encoding='utf-8').read().split('\n')[row-1]
i = line.index(label)      # character index (0-based) — 1 col per glyph
print(i + 2)               # +1 to land INSIDE the bracket, +1 for 1-based
PY
```

Re-capture and recompute coordinates right before each click — layouts shift
(an opened dropdown, a measured button that re-measured when its row moved).
After clicking, re-capture and diff to confirm the *specific* expected effect.

## The first-run model chooser

The chooser only appears with a clean config home. To test it without touching
the user's real `~/.config/p9r`, point `HOME` at a throwaway dir and keep the
real kubeconfig:

```sh
mkdir -p /tmp/p9r-home/.config
# copy ~/.config/p9r/{models,config.yaml} in if you want to skip the download
HOME=/tmp/p9r-home KUBECONFIG=$HOME/.kube/config bun run start
```

## Extra fixtures for environment-dependent tests

Some tests need state a single-context, single-container cluster can't provide.
Stage it, then clean up:

- **Second / broken context** (context switcher, error banner): copy
  `~/.kube/config` to `/tmp/p9r-kube`, add a `dd-copy` context (same cluster,
  new name) and a `dd-broken` one (`server: https://127.0.0.1:1`); launch with
  `KUBECONFIG=/tmp/p9r-kube`.
- **Multi-container pod** (container dropdown, exec picker): `kubectl apply` a
  2-container pod into `demo` (e.g. nginx + busybox `sleep`); `kubectl delete`
  it after.

## Safety

Mutating tests (delete, YAML apply, port-forward) must use **redeployable**
fixtures only — `demo`/`staging` pods that respawn. Never touch kube-system or
anything you can't restore; revert label edits; leave no orphaned port-forwards.
If a mutation feels irreversible, record `SKIPPED — reason` instead of risking
the cluster.
