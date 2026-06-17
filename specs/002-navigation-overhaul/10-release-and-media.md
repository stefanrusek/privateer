# Chunk 10 — Version bump, screenshots, README animation & social preview

**Status:** DRAFT
**Depends on:** 01–09 (the finished UI is what gets captured)
**Implements / amends:** `CLAUDE.md` "Releases" + "README media" runbooks;
`docs/MEDIA.md` (the canonical media-regeneration procedure); README.

> This is the **release-and-media** chunk: it ships the overhaul under a new
> version and refreshes everything a visitor sees — the captured screens, the
> animated demo, the README keymap, and the GitHub social card. It runs **last**
> because every artifact depicts the new bordered/focus/dropdown/editor UI built
> in 01–09. **Follow `docs/MEDIA.md` exactly** for the media steps; this chunk
> only says *what* to regenerate and *that the captures must show the overhaul*.

## 1. Version bump + release

Per `CLAUDE.md`, the version lives in these locations and all move together:

- `package.json` `"version"`
- `src/version.ts` `VERSION` (what `p9r version` prints)
- `features/00-scaffold/version.feature` (asserts `p9r <ver>`)
- `features/01-architecture/cli.feature` (asserts `p9r <ver>`)

Target: **`0.2.0` → `0.3.0`** (a feature minor; pre-1.0).

Then run the full `CLAUDE.md` release runbook (in scope, not carved out):

1. Bump all four files; `bun run gate`; commit; push to `main`.
2. `git tag v0.3.0 && git push origin v0.3.0` — triggers
   `.github/workflows/release.yml` (cross-compiles every target, publishes the
   release).
3. **Verify:** download an artifact and confirm `p9r version` reports `0.3.0`.

> Execution-time note: pushing to `main` and tagging are consequential, outward
> actions. Whoever/whatever executes this chunk follows the runbook as written;
> if operating under a feature-branch restriction, that gets lifted before steps
> 1–2 rather than skipped. **The spec scope includes the release.**

## 2. Refresh the terminal captures (`docs/frames/*.ansi`)

The media is rebuilt from **committed `.ansi` captures**, so a cluster is needed
only to refresh them (`docs/MEDIA.md` §1). Re-capture the seven existing frames
**against the overhauled UI** — because they're live `tmux capture-pane -e -p`
grabs, they automatically pick up the new bordered/collapsed grid, focus
highlight, header context/namespace chips, etc.:

`01-chooser` · `02-dashboard` · `03-pods` · `04-logs` · `05-metrics` ·
`06-agent-tools` · `07-yaml`

**Add frames that showcase the overhaul** (and update `docs/MEDIA.md` §1's
capture steps **and** §2C's APNG assembly order to include them):

- focus/region navigation — a non-default region focused (double-line accent
  border) to show the `Tab` model;
- an open **`DropdownButton`** (namespace filter or Logs `[Co̲ntainer ▾]`);
- the **list horizontally scrolled** (pinned status+Name, `‹`/`›` markers);
- the **YAML editor** in edit mode and/or the **diff** review;
- the **`?` help overlay** (grouped, accurate).

Setup, sizes (`-x 170 -y 50`), `sleep`s for metrics, the clean-`HOME` trick for
the chooser, and the exact `capture-pane` flags are all in `docs/MEDIA.md` — use
them verbatim. Capture against `bun run fixtures:up` content so frames are
deterministic and free of real cluster names/secrets.

## 3. Regenerate the animated demo (`docs/demo.png`, APNG)

Run `docs/MEDIA.md` §2 unchanged in mechanism:

- §2A `freeze --window` renders each `.ansi` → PNG;
- §2B ImageMagick normalizes every frame onto the uniform **1500×1000** canvas;
- §2C assembles the **APNG** (`magick -delay 280 -loop 0 … APNG:docs/demo.png`)
  in **story order** (not filename order) — update that ordered list to weave in
  any new frames from §2.

The README already embeds it as `![p9r demo](docs/demo.png)` (an APNG is a valid
PNG, so GitHub animates it inline) — no README image-tag change needed, just the
regenerated artifact.

## 4. README copy refresh

The README keymap and feature list must match the **implemented** keys:

- Keyboard table: `Tab`/`Shift+Tab` regions; arrows within a region; list `←/→`
  horizontal scroll; detail `←/→` tabs, `↑/↓` scroll; `c` context; `n` namespace;
  Logs `o`/`l` dropdowns; YAML `e`/`Ctrl+S`/`Ctrl+E`.
- **Source the keymap from chunk 09's `KEYMAP` registry** — chunk 09's drift test
  asserts the README keymap equals `KEYMAP`, so update both together (or generate
  the README section from it).
- Update the feature bullets to mention region focus + drag-resize, the YAML
  editor + `$EDITOR` pop-out, inline Logs dropdowns, per-context memory, and
  mouse support. Fix the stale `!` examples (e.g. `!ns demo`) if the commands
  changed.

## 5. Regenerate the social card (`docs/social-preview.png`)

Run `docs/MEDIA.md` §3 unchanged (logo + a refreshed dashboard shot + title/
tagline composited at 2× then downscaled to **1280×640**). The committed file is
the source of truth.

**Upload is manual** — GitHub exposes no API for the social preview. Re-upload
`docs/social-preview.png` via **Settings → Social preview** after regenerating,
as `docs/MEDIA.md` §3 documents.

**Environment caveats (verified):** `freeze` and ImageMagick (`magick`) are **not
installed** in the default sandbox (`tmux` is), and the captures need a cluster
(`scripts/claude-cluster-up.sh` + `fixtures:up`) — install the tools first.
`docs/MEDIA.md` §3's social-card command hardcodes a **macOS** font
(`/System/Library/Fonts/Menlo.ttc`); on a Linux host substitute an available
mono font (e.g. DejaVu Sans Mono) — update `docs/MEDIA.md` with the fallback.

## Acceptance criteria (given-when-then)

```gherkin
Feature: Release version

  Scenario: p9r reports the new version
    When I run p9r with arguments "version"
    Then the output contains "p9r 0.3.0"

  Scenario: All version locations agree and the release is cut
    Then package.json, src/version.ts, and both version BDD features all say 0.3.0
    And bun run gate is green
    And the v0.3.0 tag is pushed and a published artifact reports "p9r 0.3.0"
```

```gherkin
Feature: Media reflects the overhaul

  Scenario: Captures show the new UI
    Then docs/frames/*.ansi are re-captured and show the bordered/focus UI
    And docs/MEDIA.md's capture steps and APNG assembly order match the frame set

  Scenario: The animated demo is regenerated
    Then docs/demo.png is a regenerated 1500x1000 APNG referenced by the README
    And it is built from the committed .ansi frames per docs/MEDIA.md

  Scenario: The social card is regenerated
    Then docs/social-preview.png exists at 1280x640
    And docs/MEDIA.md's manual GitHub upload step is followed/documented

  Scenario: README keymap matches the app
    Then the README keymap equals chunk 09's KEYMAP registry
```

## Out of scope
- Changing the media pipeline itself — `docs/MEDIA.md` owns the procedure; this
  chunk regenerates artifacts through it (extending the frame list/order when new
  frames are added).
- Uploading the social preview to GitHub settings (manual; **no API exists**).

## Done when
- The version is `0.3.0` in all four locations; `p9r version` prints it; the
  release is cut per the `CLAUDE.md` runbook (pushed, tagged `v0.3.0`, workflow
  published, a downloaded artifact reports it); the gate is green.
- `docs/frames/*.ansi` are re-captured showing the overhauled UI (with added
  frames for the new navigation features), and `docs/MEDIA.md` is updated to
  match the new frame set + assembly order.
- `docs/demo.png` (APNG) and `docs/social-preview.png` are regenerated via
  `docs/MEDIA.md`; the README keymap/features match the shipped behavior and
  chunk 09's `KEYMAP`.
- `bun run gate` is green.
