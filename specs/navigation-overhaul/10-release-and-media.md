# Chunk 10 — Version bump, screenshots, README animation & social preview

**Status:** DRAFT
**Depends on:** 01–09 (the finished UI is what gets captured)
**Implements / amends:** `CLAUDE.md` "Releases" runbook (version locations);
README; repo media assets.

> This is the **release-and-media** chunk: it ships the overhaul under a new
> version and refreshes everything a visitor sees — screenshots, an animated
> demo, the README keymap, and the GitHub social preview. It runs **last**
> because every artifact depicts the new bordered/focus/dropdown/editor UI built
> in 01–09.

## 1. Version bump

Per `CLAUDE.md`, the version lives in the locations below and all must move
together:

- `package.json` `"version"`
- `src/version.ts` `VERSION` (what `p9r version` prints)
- `features/00-scaffold/version.feature` (asserts `p9r <ver>`)
- `features/01-architecture/cli.feature` (asserts `p9r <ver>`)

Target: **`0.2.0` → `0.3.0`** (a feature minor; pre-1.0). After bumping,
`bun run gate` must be green (the two feature files assert the exact string).

### Cut the release (the `CLAUDE.md` runbook, in scope)

This chunk runs the full release per `CLAUDE.md`, not just the bump:

1. Bump all four files; `bun run gate`; commit; push to `main`.
2. `git tag v0.3.0 && git push origin v0.3.0` — the tag triggers
   `.github/workflows/release.yml`, which cross-compiles every target and
   publishes the GitHub release.
3. **Verify:** download an artifact and confirm `p9r version` reports `0.3.0`.

> Execution-time note (not a spec carve-out): pushing to `main` and tagging are
> consequential, outward actions. Whoever/whatever executes this chunk follows
> the runbook as written; if the executor operates under a feature-branch
> restriction, it gets that gate lifted before steps 1–2 rather than skipping
> them. The **spec scope includes the release**.

## 2. Screenshots

Refresh `docs/demo.png` and add a small set that shows the overhaul, captured
the way `CLAUDE.md` drives the TUI for testing:

- Bring up the sandbox cluster + workloads: `bash scripts/claude-cluster-up.sh`
  then `bun run fixtures:up` (needs `registry.k8s.io` + `*.pkg.dev` allowed for
  metrics/kube-state — see `CLAUDE.md`).
- Run under tmux at a **fixed size** (e.g. `tmux new-session -d -s p9r -x 160
  -y 44 'bun run start'`), drive with `send-keys`, capture with
  `capture-pane -p` (text) or a terminal screenshot.

Shots to produce (committed under `docs/`):

1. `docs/demo.png` — the connected bordered grid with a focused region
   (replaces the current screenshot).
2. The **namespace `DropdownButton`** open (filterable) and a Logs
   **`[Co̲ntainer ▾]`** dropdown open.
3. The **YAML editor** in edit mode + the **diff** review.
4. The **list horizontally scrolled** (pinned status+Name, `‹`/`›` markers).
5. The **`?` help overlay** (chunk 09).

> Keep filenames stable and committed so the README/marketing reference fixed
> paths. Capture against the fixtures so content is deterministic and
> screenshot-safe (no real cluster names/secrets).

## 3. README animated demo

There is **no** animation tooling today — add a **reproducible** one.

- **Tool:** VHS (`charmbracelet/vhs`) driving a checked-in tape
  `docs/demo.tape` → `docs/demo.gif`. VHS scripts the keystrokes, so the GIF is
  regenerable and reviewable as text. (Fallback if VHS can't be installed in the
  environment: `asciinema rec` → `agg` cast→gif; same committed-tape principle —
  commit the `.cast`.)
- `docs/demo.tape` sets a fixed `Set Width/Height/FontSize/Theme` and walks a
  short tour: open a resource → Tab between regions (focus highlight) → open the
  detail pane → switch tabs with `←/→` → open the Logs container dropdown →
  edit YAML and show the diff → `?` help. Keep it < ~20s.
- The demo runs against the sandbox cluster + fixtures (section 2 prereqs).
- README embeds `docs/demo.gif` (the static `docs/demo.png` may remain as a
  fallback/poster).

## 4. README copy refresh

The README keymap and feature list must match the **implemented** keys, not the
old ones:

- Keyboard table: `Tab`/`Shift+Tab` = regions; arrows within a region; list
  `←/→` = horizontal scroll; detail `←/→` = tabs, `↑/↓` = scroll; `c` = context;
  `n` = namespace; Logs `o`/`l` dropdowns; YAML `e`/`Ctrl+S`/`Ctrl+E`.
- Source the keymap from the **same place chunk 09's help overlay reads** (the
  accelerator/keymap registry) wherever practical, so README and the in-app help
  cannot drift.
- Update the feature bullets to mention region focus, drag-resize, the YAML
  editor + `$EDITOR` pop-out, inline Logs dropdowns, and mouse support.

## 5. GitHub social preview

- Produce **`docs/social-preview.png`** at **1280×640** — the project name +
  tagline composited over a representative screenshot (from section 2). Commit
  it.
- **Manual step (cannot be automated):** GitHub's social preview is set in
  **Settings → General → Social preview** (UI upload); there is no API/committed
  file that activates it. Document the upload step in the README/release notes
  and surface it as a reminder when this chunk completes.

## Acceptance criteria (given-when-then)

```gherkin
Feature: Release version

  Scenario: p9r reports the new version
    When I run p9r with arguments "version"
    Then the output contains "p9r 0.3.0"

  Scenario: All version locations agree
    Then package.json, src/version.ts, and both version BDD features all say 0.3.0
    And bun run gate is green
```

```gherkin
Feature: Media assets

  Scenario: README shows the new demo and screenshots
    Then docs/demo.gif exists and is referenced by the README
    And docs/demo.tape (or a committed .cast) reproduces it
    And the refreshed screenshots referenced by the README exist under docs/

  Scenario: Social preview image is ready
    Then docs/social-preview.png exists and is 1280x640
    And the README documents the manual GitHub upload step

  Scenario: README keymap matches the app
    Then every key shown in the README keymap is a real binding from chunks 01–09
```

## Out of scope
- Uploading the social preview to GitHub settings (manual; **no API exists** for
  it — this is the one genuinely human step, and only because GitHub provides no
  programmatic path).
- Recording infrastructure in CI — the demo is produced in a session with the
  sandbox cluster, and the resulting assets are committed.

## Done when
- The version is `0.3.0` in all four locations; `p9r version` prints it; the gate
  is green.
- The release is cut per the `CLAUDE.md` runbook: pushed to `main`, tagged
  `v0.3.0`, the release workflow has published artifacts, and a downloaded
  artifact reports `p9r 0.3.0`.
- `docs/demo.gif` (+ its committed tape/cast) and the refreshed screenshots are
  committed and referenced by the README; the README keymap/features match the
  shipped behavior.
- `docs/social-preview.png` (1280×640) is committed and the manual upload step is
  documented.
- `bun run gate` is green.
