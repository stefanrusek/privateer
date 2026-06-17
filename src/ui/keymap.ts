/**
 * keymap.ts — the SINGLE grouped registry of every keyboard/accelerator binding
 * (navigation-overhaul chunk 09 / B09).
 *
 * Spec: `specs/navigation-overhaul/09-help-overlay-revamp.md` and the canonical
 * `spec/spec-02-navigation-layout.md` §8/§11.
 *
 * Every surface that *documents* keys reads from {@link KEYMAP}:
 *  - the `?` help overlay (this chunk) renders it grouped, current-region-first,
 *    with accelerator letters underlined to match the measured buttons;
 *  - the README keymap (chunk 10 / B10) is generated from / checked against
 *    {@link renderKeymapMarkdown} so the docs can never drift from the bindings;
 *  - chunk 04's `<Button>`/`<DropdownButton>` accelerators are the `accelerator`
 *    fields here, and {@link acceleratorSet} is asserted against the real button
 *    sources by the drift test — so the underlined-letter buttons and the help
 *    text cannot disagree.
 *
 * This module is pure and **100% covered**; the help overlay is thin glue that
 * renders what these helpers return. Nothing here changes a binding — it only
 * declares the keymap the owning chunks (01–08, plus the inherited canonical
 * keys) already implement. If a key is wrong, fix it in the owning handler, not
 * here (the drift test will catch a button whose accelerator is missing here).
 */

/** A documented scope: a region, a detail tab, the command bar, or overlays. */
export type Scope =
  | 'global'
  | 'sidebar'
  | 'list'
  | 'detail'
  | 'detail.logs'
  | 'detail.yaml'
  | 'detail.metrics'
  | 'commandBar'
  | 'overlay';

/** One documented binding: the key(s), what it does, and any accelerator letter. */
export interface KeyBinding {
  /** Human-readable key spec, e.g. `"Tab / Shift+Tab"` or `"g g"`. */
  readonly keys: string;
  /** What the binding does. */
  readonly description: string;
  /**
   * The single accelerator letter this binding shares with a measured
   * `<Button>`/`<DropdownButton>` (chunk 04), when one exists. Must be a
   * character present (case-insensitively) in {@link keys}.
   */
  readonly accelerator?: string;
}

/** A titled group of bindings for one {@link Scope}. */
export interface KeyGroup {
  /** The scope this group documents. */
  readonly scope: Scope;
  /** Heading shown in the overlay / README. */
  readonly title: string;
  /** The bindings, in display order. */
  readonly bindings: readonly KeyBinding[];
}

/**
 * THE keymap. One {@link KeyGroup} per documented {@link Scope}, in canonical
 * order. The content is the keymap chunks 01–08 define plus the inherited
 * canonical keys (`r`/`F`/`+`/`-`, the list action keys, …); verified against
 * the live handlers in the controller and the measured widgets.
 */
export const KEYMAP: readonly KeyGroup[] = [
  {
    scope: 'global',
    title: 'Global',
    bindings: [
      { keys: 'Tab / Shift+Tab', description: 'Cycle focus between regions' },
      { keys: 'q', description: 'Quit' },
      { keys: 'Ctrl+C', description: 'Quit (any mode)' },
      { keys: 'Esc', description: 'Close the detail pane / cancel input' },
      { keys: '?', description: 'Toggle this help overlay' },
      { keys: '/', description: 'Search the resource list' },
      { keys: 'n', description: 'Open the namespace picker' },
      { keys: 'Space', description: 'Focus the command bar (agent input)' },
      { keys: '!', description: 'Focus the command bar (command input)' },
      { keys: 'c', description: 'Open the context switcher', accelerator: 'c' },
      {
        keys: 'r',
        description: 'Refresh the resource list (or retry a failed switch)',
        accelerator: 'r',
      },
      { keys: 'F', description: 'Port-forward manager' },
      { keys: '+ / -  (Alt+↑/↓)', description: 'Resize the list/detail split' },
      { keys: 'wheel', description: 'Scroll the region under the cursor' },
      { keys: 'drag border', description: 'Drag a border line to resize' },
      { keys: 'click', description: 'Focus / select under the cursor' },
    ],
  },
  {
    scope: 'sidebar',
    title: 'Sidebar',
    bindings: [
      { keys: '↑ / ↓  (k / j)', description: 'Move up / down' },
      { keys: '←', description: 'Collapse category / go to parent' },
      { keys: '→ / Enter', description: 'Expand category / select resource' },
      { keys: 'h', description: 'Collapse all categories' },
      { keys: 'l', description: 'Expand all categories' },
    ],
  },
  {
    scope: 'list',
    title: 'List',
    bindings: [
      { keys: '↑ / ↓  (k / j)', description: 'Move selection up / down' },
      { keys: '← / →', description: 'Scroll columns horizontally' },
      { keys: 'g g', description: 'Jump to top' },
      { keys: 'G', description: 'Jump to bottom' },
      { keys: 'Ctrl+F / Ctrl+B', description: 'Page down / up' },
      { keys: 'Enter', description: 'Open the detail pane' },
      { keys: 'e', description: 'Open the YAML editor' },
      { keys: 'y', description: 'Copy resource name to clipboard' },
      { keys: 'd', description: 'Delete the resource (confirm)' },
      { keys: 'l', description: 'View logs (pods)' },
      { keys: 'x', description: 'Exec a shell (pods)' },
      { keys: 'p', description: 'Port-forward (pods)' },
    ],
  },
  {
    scope: 'detail',
    title: 'Detail (all tabs)',
    bindings: [
      { keys: '← / →', description: 'Previous / next tab' },
      { keys: '↑ / ↓', description: 'Scroll the tab content' },
      { keys: '1 – 6', description: 'Jump to a tab' },
      { keys: 'Esc', description: 'Close the detail pane' },
    ],
  },
  {
    scope: 'detail.logs',
    title: 'Detail · Logs',
    bindings: [
      {
        keys: '↑ / ↓',
        description: 'Scroll (pauses live tail off the bottom)',
      },
      { keys: 'PageUp / PageDown', description: 'Page up / down' },
      { keys: 'g / G', description: 'Top / bottom' },
      { keys: '/', description: 'Search the logs' },
      { keys: 'n / N', description: 'Next / previous search match' },
      { keys: 'o', description: 'Container dropdown', accelerator: 'o' },
      { keys: 'l', description: 'Line-limit dropdown', accelerator: 'l' },
      { keys: 'p', description: 'Pause / resume live tail', accelerator: 'p' },
      { keys: 't', description: 'Toggle timestamps', accelerator: 't' },
      { keys: 'w', description: 'Toggle wrap', accelerator: 'w' },
      { keys: 'P', description: 'Previous-instance logs' },
      { keys: 'd', description: 'Download the logs', accelerator: 'd' },
    ],
  },
  {
    scope: 'detail.yaml',
    title: 'Detail · YAML',
    bindings: [
      { keys: 'e', description: 'Edit the YAML' },
      { keys: 'v', description: 'Reveal (Secrets)' },
      { keys: 'Ctrl+S', description: 'Save — review the diff (editing)' },
      { keys: 'Ctrl+E', description: 'Open in $EDITOR (editing)' },
      { keys: 'Esc', description: 'Cancel the edit (editing)' },
    ],
  },
  {
    scope: 'detail.metrics',
    title: 'Detail · Metrics',
    bindings: [{ keys: '[ / ]', description: 'Change the time range' }],
  },
  {
    scope: 'commandBar',
    title: 'Command bar',
    bindings: [
      { keys: 'type', description: 'Enter a command / agent prompt' },
      { keys: 'Enter', description: 'Run' },
      { keys: 'Esc', description: 'Cancel' },
    ],
  },
  {
    scope: 'overlay',
    title: 'Overlays (switcher / pickers / dropdowns)',
    bindings: [
      { keys: '↑ / ↓  (k / j)', description: 'Move the highlight' },
      { keys: 'Enter', description: 'Select' },
      { keys: 'Esc', description: 'Close' },
      { keys: 'type', description: 'Filter (where filterable)' },
    ],
  },
];

/**
 * Map a focused region (+ optional detail tab) to the {@link Scope} whose group
 * the help overlay should lead with. `detail` resolves to the tab-specific scope
 * when one exists (`detail.logs`/`detail.yaml`/`detail.metrics`), else the
 * generic `detail`. Unknown inputs fall back to `global`.
 */
export function scopeForFocus(
  focus: string | null | undefined,
  tab?: string | null,
): Scope {
  if (focus === 'sidebar') {
    return 'sidebar';
  }
  if (focus === 'list') {
    return 'list';
  }
  if (focus === 'commandbar') {
    return 'commandBar';
  }
  if (focus === 'detail') {
    if (tab === 'logs') {
      return 'detail.logs';
    }
    if (tab === 'yaml') {
      return 'detail.yaml';
    }
    if (tab === 'metrics') {
      return 'detail.metrics';
    }
    return 'detail';
  }
  return 'global';
}

/**
 * Order the groups for the help overlay: the `current` scope's group first, then
 * `global` (unless it is already the current one), then the rest in canonical
 * order. So help leads with where the user is and always shows the globals.
 */
export function groupsFor(current: Scope): readonly KeyGroup[] {
  const byScope = new Map(KEYMAP.map((group) => [group.scope, group]));
  const ordered: KeyGroup[] = [];
  const seen = new Set<Scope>();
  const push = (scope: Scope): void => {
    if (seen.has(scope)) {
      return;
    }
    const group = byScope.get(scope);
    if (group !== undefined) {
      ordered.push(group);
      seen.add(scope);
    }
  };
  push(current);
  push('global');
  for (const group of KEYMAP) {
    push(group.scope);
  }
  return ordered;
}

/**
 * Every accelerator declared anywhere in {@link KEYMAP}, lower-cased, as a set —
 * the documented-accelerator side of the drift guard (see
 * `keymap.test.ts`: every measured-button accelerator must be in here).
 */
export function acceleratorSet(): ReadonlySet<string> {
  const set = new Set<string>();
  for (const group of KEYMAP) {
    for (const binding of group.bindings) {
      if (binding.accelerator !== undefined) {
        set.add(binding.accelerator.toLowerCase());
      }
    }
  }
  return set;
}

/** A registry-consistency problem found by {@link keymapIssues}. */
export interface KeymapIssue {
  /** The scope the problem was found in. */
  readonly scope: Scope;
  /** Human-readable description. */
  readonly message: string;
}

/**
 * Validate the registry's internal consistency. Returns one
 * {@link KeymapIssue} per problem (empty when clean):
 *  - every `accelerator` is a single character;
 *  - every `accelerator` is present (case-insensitively) in its binding's
 *    `keys`;
 *  - no accelerator collides within a scope;
 *  - no two bindings in a scope share the same `keys` spec.
 */
export function keymapIssues(
  groups: readonly KeyGroup[] = KEYMAP,
): readonly KeymapIssue[] {
  const issues: KeymapIssue[] = [];
  for (const group of groups) {
    const accelerators = new Set<string>();
    const keySpecs = new Set<string>();
    for (const binding of group.bindings) {
      if (keySpecs.has(binding.keys)) {
        issues.push({
          scope: group.scope,
          message: `duplicate keys spec "${binding.keys}"`,
        });
      }
      keySpecs.add(binding.keys);
      const accel = binding.accelerator;
      if (accel === undefined) {
        continue;
      }
      if (accel.length !== 1) {
        issues.push({
          scope: group.scope,
          message: `accelerator "${accel}" is not a single character`,
        });
      }
      if (!binding.keys.toLowerCase().includes(accel.toLowerCase())) {
        issues.push({
          scope: group.scope,
          message: `accelerator "${accel}" is not present in keys "${binding.keys}"`,
        });
      }
      const lower = accel.toLowerCase();
      if (accelerators.has(lower)) {
        issues.push({
          scope: group.scope,
          message: `accelerator "${accel}" collides within scope`,
        });
      }
      accelerators.add(lower);
    }
  }
  return issues;
}

/** One rendered line of the help overlay, flattened from {@link groupsFor}. */
export type HelpLine =
  | { readonly kind: 'heading'; readonly text: string }
  | { readonly kind: 'binding'; readonly binding: KeyBinding }
  | { readonly kind: 'blank' };

/**
 * Flatten the current-region-first groups into a single ordered list of lines
 * for the scrollable help overlay: a heading, its bindings, then a blank spacer
 * between groups (no trailing blank). The overlay windows this list through the
 * shared scroll-viewport seam, so the component stays thin.
 */
export function helpLines(current: Scope): readonly HelpLine[] {
  const lines: HelpLine[] = [];
  const groups = groupsFor(current);
  groups.forEach((group, index) => {
    if (index > 0) {
      lines.push({ kind: 'blank' });
    }
    lines.push({ kind: 'heading', text: group.title });
    for (const binding of group.bindings) {
      lines.push({ kind: 'binding', binding });
    }
  });
  return lines;
}

/**
 * Render the keymap as Markdown — the single generator the README keymap (chunk
 * 10 / B10) is produced from / checked against. One `### <title>` heading per
 * group, then a two-column `| Key | Action |` table. Pure and deterministic so
 * B10 can assert the committed README block equals this output.
 */
export function renderKeymapMarkdown(): string {
  const sections = KEYMAP.map((group) => {
    const rows = group.bindings
      .map((b) => `| \`${b.keys}\` | ${b.description} |`)
      .join('\n');
    return `### ${group.title}\n\n| Key | Action |\n| --- | --- |\n${rows}`;
  });
  return sections.join('\n\n');
}
