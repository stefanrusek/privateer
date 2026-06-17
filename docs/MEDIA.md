# Regenerating the README media

This documents exactly how the three image artifacts in this repo were made,
so they can be reproduced or refreshed:

| Artifact                  | What it is                              | Embedded where                          |
| ------------------------- | --------------------------------------- | --------------------------------------- |
| `docs/frames/*.ansi`      | Raw terminal captures (8 screens)       | Source for the animation + social card  |
| `docs/demo.png`           | Animated APNG walkthrough (1500×1000)   | README header (`![p9r demo](...)`)      |
| `docs/social-preview.png` | GitHub social card (1280×640)           | Repo Settings → Social preview (manual) |

Everything downstream is regenerated from the committed `.ansi` captures, so a
cluster is only needed to refresh the captures themselves (step 1).

## Tools

```sh
# freeze — renders ANSI/terminal output to an image. Install the Charm tap
# build, NOT `brew install --cask freeze` (that cask is Amazon Glacier).
brew install charmbracelet/tap/freeze

# ImageMagick — frame normalization + APNG assembly + social-card compositing.
brew install imagemagick
```

Versions used: freeze v0.2.2, ImageMagick 7.1.1 (the `magick` command).

---

## 1. Screenshots — the `.ansi` captures

Each frame is a `tmux capture-pane` of the **live** app, driven by `send-keys`,
saved with colors intact. The key flag is `-e`, which preserves the SGR color
escape sequences (without it you get plain monochrome text); `-p` prints the
pane to stdout.

```sh
tmux capture-pane -t p9r -e -p > docs/frames/02-dashboard.ansi
```

There are two session setups because the first frame needs different state
than the rest.

### Frames 02–08 (live cluster walkthrough)

Bring the cluster fixtures up first (`bun run fixtures:up`) so the dashboard,
pod tables, and metrics sparklines have real content. Metrics need a minute to
land — the captures use `sleep`s before grabbing frames that show sparklines /
Prometheus charts.

```sh
tmux new-session -d -s p9r -x 170 -y 50 \
  'export PATH="$HOME/.bun/bin:$PATH"; bun run start 2>/tmp/p9r-err.txt; sleep 600'
sleep 9
```

**These sequences are for the overhauled (navigation-overhaul / B10) keyboard
model**, where `Tab`/`Shift+Tab` cycle regions and arrows act *within* the
focused region. Key reminders:

- Use the key name `Space` (not `' '`); `Right`/`Left`/`Up`/`Down`/`Tab`/
  `Escape`/`Enter` are tmux key names.
- `Space` opens the **command bar** (agent prompt); `!` opens it in command
  mode; type a kind name (`pods`) + `Enter` to switch the active kind.
- `/` filters the **focused** region (the global pod filter only when the
  **list** is focused).
- The list **action keys** (`l` logs, `e` edit-yaml, `d` delete, …) act on the
  selected row and require the **list** region to be focused — `Tab` to it
  first (the footer's `⌖ <region>` chip tells you where focus is).
- After driving, check `/tmp/p9r-err.txt` has **no** `Maximum update depth
  exceeded` flood.

> **Known render quirk — logs toolbar:** the very first render of the Logs tab
> can momentarily collide the toolbar line (`[Container ▾] … Download`) with the
> state-hint line below it (`Timestamps: on  Wrap: off`). It is a stale-redraw
> artifact, not a bug: **any** subsequent re-render clears it. Nudge it once
> (e.g. press the container dropdown `o`, or any toggle) and the toolbar lands on
> its own line — verify with `capture-pane` before saving `04-logs.ansi`.

```sh
# 02 — health dashboard (the default Overview screen). Refresh + wait so the
# Prometheus "● connected" badge and the metrics sparklines have landed.
tmux send-keys -t p9r r && sleep 50
tmux capture-pane -t p9r -e -p > docs/frames/02-dashboard.ansi

# 03 — pods with sparkline columns (Space → command bar → type pods → Enter;
# the kind switch focuses the list, so j/k/g/G move the row selection).
tmux send-keys -t p9r Space && sleep 0.6 && tmux send-keys -t p9r 'pods' \
  && sleep 0.6 && tmux send-keys -t p9r Enter && sleep 2.5 \
  && tmux send-keys -t p9r g && sleep 0.2 && tmux send-keys -t p9r g && sleep 0.5
tmux capture-pane -t p9r -e -p > docs/frames/03-pods.ansi

# 08 — list horizontally scrolled (list focused → Right scrolls columns; status
# + Name stay pinned, a ‹ marker shows scrolled-off-left columns, revealing the
# Memory sparkline). Scroll back with Left ×3 afterwards.
tmux send-keys -t p9r Right && sleep 0.3 && tmux send-keys -t p9r Right \
  && sleep 0.3 && tmux send-keys -t p9r Right && sleep 0.6
tmux capture-pane -t p9r -e -p > docs/frames/08-hscroll.ansi
tmux send-keys -t p9r Left  && sleep 0.2 && tmux send-keys -t p9r Left \
  && sleep 0.2 && tmux send-keys -t p9r Left && sleep 0.4

# 06 — agent tool call. Space opens the command bar in agent mode; type a
# question + Enter. The agent answers in the detail pane and a "↳ Navigated to
# …" line shows the tool call. Qwen3-0.6B takes ~30-60s; wait before capturing.
tmux send-keys -t p9r Space && sleep 0.8 \
  && tmux send-keys -t p9r -l 'how many pods are running in the demo namespace?' \
  && sleep 0.5 && tmux send-keys -t p9r Enter && sleep 50
tmux capture-pane -t p9r -e -p > docs/frames/06-agent-tools.ansi

# 04 — logs on a running web pod. Filter the (focused) list to web, select a
# row, press l to open logs (a list action key), then nudge once (o) so the
# toolbar lays out cleanly. Tab to the list first if focus drifted to detail.
tmux send-keys -t p9r '/' && sleep 0.5 && tmux send-keys -t p9r 'web' \
  && sleep 0.6 && tmux send-keys -t p9r Enter && sleep 1 \
  && tmux send-keys -t p9r 'l' && sleep 3.5 \
  && tmux send-keys -t p9r 'o' && sleep 1.5
tmux capture-pane -t p9r -e -p > docs/frames/04-logs.ansi

# 05 — metrics tab (the Prometheus charts). From the detail pane press 5 (jump
# to the Metrics tab). Prometheus auto-discovers via a port-forward tunnel —
# wait a few seconds for the CPU/Memory/Network charts to render. If they never
# come, the Overview's METRICS OVERVIEW sparklines are the documented fallback.
tmux send-keys -t p9r '5' && sleep 5
tmux capture-pane -t p9r -e -p > docs/frames/05-metrics.ansi

# 07 — YAML editor (edit mode). Esc out of the metrics tab, Tab to the list,
# select a web pod, press e to open the YAML editor, then e again to enter EDIT
# mode (the "╔══ EDITING — Ctrl+S … Ctrl+E … Escape" banner + [EDIT] footer).
tmux send-keys -t p9r Escape && sleep 0.6 && tmux send-keys -t p9r Tab \
  && sleep 0.4 && tmux send-keys -t p9r Tab && sleep 0.4 \
  && tmux send-keys -t p9r 'e' && sleep 2.5 \
  && tmux send-keys -t p9r 'e' && sleep 1.5
tmux capture-pane -t p9r -e -p > docs/frames/07-yaml.ansi
```

> The exact `Tab` counts above assume focus is on the list/detail; if a step
> lands somewhere else, watch the footer `⌖ <region>` chip and `Tab` until the
> list (or detail) is focused before sending the action key. **Always strip SGR
> and eyeball each capture** (`sed 's/\x1b\[[0-9;]*m//g'`) to confirm it shows
> the intended, fully-rendered screen before saving the `.ansi`.

### Frame 01 (the first-run model chooser)

The chooser only appears when no agent has been picked yet, so this needs a
**clean config home**. Run the app with `HOME` pointed at a throwaway dir whose
`.config` has been wiped, in a smaller window:

```sh
mkdir -p /tmp/p9r-home && rm -rf /tmp/p9r-home/.config
tmux new-session -d -s chooser -x 100 -y 32 \
  'export PATH="$HOME/.bun/bin:$PATH"; HOME=/tmp/p9r-home KUBECONFIG=$HOME/.kube/config bun run start; sleep 60'
sleep 8
tmux capture-pane -t chooser -e -p > docs/frames/01-chooser.ansi
```

The eight captures are committed so the animation and social card can be
rebuilt without a cluster.

---

## 2. The animated demo — `docs/demo.png`

A three-step pipeline: render each capture to a PNG, normalize them onto one
canvas, then assemble an APNG.

### Step A — render each `.ansi` to a PNG

`freeze` reads the ANSI from stdin; `--window` draws the macOS traffic-light
window chrome. Output is hi-DPI (~4000px wide).

```sh
for f in docs/frames/*.ansi; do
  n=$(basename "$f" .ansi)
  cat "$f" | freeze --window --padding 16 --background "#16161e" -o "docs/frames/$n.png"
done
```

### Step B — normalize to a uniform 1500×1000 canvas

Each render is a different height, so resize to a common width and pad/crop to
a single canvas size; otherwise the animation jumps around.

```sh
mkdir -p /tmp/demo-frames
for p in docs/frames/*.png; do
  n=$(basename "$p")
  magick "$p" -resize 1500x -background "#16161e" \
    -gravity northwest -extent 1500x1000 "/tmp/demo-frames/$n"
done
```

### Step C — assemble the APNG

`-delay 280` holds each frame 2.8 s; `-loop 0` loops forever. **The frame order
is the story order, which is not the filename order** — the demo **leads with the
dashboard** (so the poster/first frame shows the overhauled UI even where APNG
isn't animated), the horizontal-scroll showcase (08) follows the pods list, then
the agent tool call (06) precedes logs/metrics/yaml, and the first-run model
chooser (01) is the closing frame:

```sh
magick -delay 280 -loop 0 \
  /tmp/demo-frames/02-dashboard.png \
  /tmp/demo-frames/03-pods.png \
  /tmp/demo-frames/08-hscroll.png \
  /tmp/demo-frames/06-agent-tools.png \
  /tmp/demo-frames/04-logs.png \
  /tmp/demo-frames/05-metrics.png \
  /tmp/demo-frames/07-yaml.png \
  /tmp/demo-frames/01-chooser.png \
  APNG:docs/demo.png
```

Result: a 1500×1000, ~3 MB APNG. (ImageMagick's APNG coder expands it into
~740 tiny internal sub-frames — that's just its encoding, not 740 distinct
images; visually it's the 8 screens above. Confirm it animated with
`python3 -c "print(open('docs/demo.png','rb').read().count(b'fcTL'))"` — a
non-zero count means the `acTL`/`fcTL` animation chunks are present.) GitHub
animates it inline because
an APNG is a valid PNG, so the README embeds it as a plain image:

```markdown
![p9r demo](docs/demo.png)
```

---

## 3. The GitHub social card — `docs/social-preview.png`

A 1280×640 card (GitHub's social-preview size) composited from the block-letter
logo, a dashboard screenshot, and annotated text. Built at 2× (2560×1280) then
downscaled for crisp text.

> **Font:** the `magick` command below hardcodes the **macOS** mono font
> `/System/Library/Fonts/Menlo.ttc`. On a Linux host (e.g. the cloud sandbox)
> that path does not exist — substitute an available mono font such as
> `/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf` (list candidates with
> `magick -list font | grep -i mono`).

```sh
# Logo: print the block-letter P9R with its cyan→magenta SGR ramp, render it.
printf '\x1b[96m██████╗   █████╗  ██████╗\x1b[0m\n\x1b[36m██╔══██╗ ██╔══██╗ ██╔══██╗\x1b[0m\n\x1b[94m██████╔╝ ╚██████║ ██████╔╝\x1b[0m\n\x1b[34m██╔═══╝   ╚═══██║ ██╔══██╗\x1b[0m\n\x1b[95m██║       █████╔╝ ██║  ██║\x1b[0m\n\x1b[35m╚═╝       ╚════╝  ╚═╝  ╚═╝\x1b[0m\n' > /tmp/logo.ansi
freeze /tmp/logo.ansi --background "#16161e" --padding 8 -o /tmp/logo.png

# Dashboard shot (reuse the committed dashboard capture).
freeze docs/frames/02-dashboard.ansi --window --padding 10 --background "#16161e" -o /tmp/shot.png

# Compose card: canvas + logo (top-left) + shot (top-right) + title + tagline.
magick -size 2560x1280 "xc:#16161e" \
  \( /tmp/logo.png -resize 1050x \) -gravity northwest -geometry +120+200 -composite \
  \( /tmp/shot.png -resize 1150x \) -gravity northeast -geometry +60+120 -composite \
  -font /System/Library/Fonts/Menlo.ttc -pointsize 64 -fill "#8a8fa3" \
  -gravity northwest -annotate +130+840 "P R I V A T E E R" \
  -pointsize 44 -fill "#c5c8d6" \
  -annotate +130+940 "The agentic Kubernetes TUI — a single binary\nwith a fully local LLM agent. Nothing leaves\nyour machine." \
  -resize 1280x640 docs/social-preview.png
```

**Uploading it is a manual step** — GitHub has no API for the social preview.
Upload `docs/social-preview.png` via the repo's **Settings → Social preview**.
The committed file is the source of truth; re-upload it there after any change.
