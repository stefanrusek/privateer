# Regenerating the README media

This documents exactly how the three image artifacts in this repo were made,
so they can be reproduced or refreshed:

| Artifact                  | What it is                              | Embedded where                          |
| ------------------------- | --------------------------------------- | --------------------------------------- |
| `docs/frames/*.ansi`      | Raw terminal captures (7 screens)       | Source for the animation + social card  |
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

### Frames 02–07 (live cluster walkthrough)

Bring the cluster fixtures up first (`bun run fixtures:up`) so the dashboard,
pod tables, and metrics sparklines have real content. Metrics need a minute to
land — the captures use `sleep`s before grabbing frames that show sparklines.

```sh
tmux new-session -d -s p9r -x 170 -y 50 \
  'export PATH="$HOME/.bun/bin:$PATH"; bun run start 2>/tmp/p9r-err.txt; sleep 600'
sleep 7
```

Then navigate with `send-keys` and capture each screen. The actual key
sequences used (note: use the key name `Space`, not `' '`):

```sh
# 06 — agent tool call (Space opens the agent bar, type a question, Enter)
tmux capture-pane -t p9r -e -p > docs/frames/06-agent-tools.ansi

# 02 — health dashboard (the default Overview screen)
sleep 8   # let metrics sparklines land
tmux capture-pane -t p9r -e -p > docs/frames/02-dashboard.ansi

# 03 — pods with sparkline columns
tmux send-keys -t p9r Space && sleep 0.6 && tmux send-keys -t p9r 'pods' \
  && sleep 0.6 && tmux send-keys -t p9r Enter && sleep 2 \
  && tmux send-keys -t p9r 'j' && sleep 1
tmux capture-pane -t p9r -e -p > docs/frames/03-pods.ansi

# 04 — logs on a running web pod (/ search → web → Enter → l)
tmux send-keys -t p9r '/' && sleep 0.4 && tmux send-keys -t p9r 'web' \
  && sleep 0.4 && tmux send-keys -t p9r Enter && sleep 1 \
  && tmux send-keys -t p9r 'l' && sleep 3
tmux capture-pane -t p9r -e -p > docs/frames/04-logs.ansi

# 05 — metrics tab (the Prometheus charts; press 5)
tmux send-keys -t p9r '5' && sleep 4
tmux capture-pane -t p9r -e -p > docs/frames/05-metrics.ansi

# 07 — YAML view (search a web pod → e to edit/view yaml)
tmux send-keys -t p9r '/' && sleep 0.4 && tmux send-keys -t p9r 'web' \
  && sleep 0.4 && tmux send-keys -t p9r Enter && sleep 0.6 \
  && tmux send-keys -t p9r 'e' && sleep 2.5
tmux capture-pane -t p9r -e -p > docs/frames/07-yaml.ansi
```

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

The seven captures are committed so the animation and social card can be
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
is the story order, which is not the filename order** — the agent tool call
(06) comes right after the dashboard, before logs/metrics:

```sh
magick -delay 280 -loop 0 \
  /tmp/demo-frames/01-chooser.png \
  /tmp/demo-frames/02-dashboard.png \
  /tmp/demo-frames/03-pods.png \
  /tmp/demo-frames/06-agent-tools.png \
  /tmp/demo-frames/04-logs.png \
  /tmp/demo-frames/05-metrics.png \
  /tmp/demo-frames/07-yaml.png \
  APNG:docs/demo.png
```

Result: a 1500×1000, ~3.4 MB APNG. (ImageMagick's APNG coder expands it into
~650 tiny internal sub-frames — that's just its encoding, not 650 distinct
images; visually it's the 7 screens above.) GitHub animates it inline because
an APNG is a valid PNG, so the README embeds it as a plain image:

```markdown
![p9r demo](docs/demo.png)
```

---

## 3. The GitHub social card — `docs/social-preview.png`

A 1280×640 card (GitHub's social-preview size) composited from the block-letter
logo, a dashboard screenshot, and annotated text. Built at 2× (2560×1280) then
downscaled for crisp text.

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
