import { describe, it, expect } from 'vitest';
import {
  KEYMAP,
  type Scope,
  groupsFor,
  scopeForFocus,
  acceleratorSet,
  keymapIssues,
  renderKeymapMarkdown,
  helpLines,
} from './keymap.js';
import { LOGS_TOOLBAR_ACCELERATORS } from './logs-toolbar.js';

const ALL_SCOPES: readonly Scope[] = [
  'global',
  'sidebar',
  'list',
  'detail',
  'detail.logs',
  'detail.yaml',
  'detail.metrics',
  'commandBar',
  'overlay',
];

describe('KEYMAP registry shape', () => {
  it('declares exactly one group per scope, in canonical order', () => {
    expect(KEYMAP.map((g) => g.scope)).toEqual(ALL_SCOPES);
  });

  it('every group has a non-empty title and at least one binding', () => {
    for (const group of KEYMAP) {
      expect(group.title.length).toBeGreaterThan(0);
      expect(group.bindings.length).toBeGreaterThan(0);
    }
  });

  it('every binding is well-formed (non-empty keys + description)', () => {
    for (const group of KEYMAP) {
      for (const binding of group.bindings) {
        expect(binding.keys.length).toBeGreaterThan(0);
        expect(binding.description.length).toBeGreaterThan(0);
      }
    }
  });

  it('documents the inherited list action keys e/y/d/l/x/p', () => {
    const list = KEYMAP.find((g) => g.scope === 'list');
    const keys = (list?.bindings ?? []).map((b) => b.keys);
    for (const k of ['e', 'y', 'd', 'l', 'x', 'p']) {
      expect(keys).toContain(k);
    }
  });

  it('documents the YAML `v` reveal', () => {
    const yaml = KEYMAP.find((g) => g.scope === 'detail.yaml');
    expect((yaml?.bindings ?? []).map((b) => b.keys)).toContain('v');
  });
});

describe('drift guard: registry is internally consistent', () => {
  it('reports no consistency issues', () => {
    expect(keymapIssues()).toEqual([]);
  });

  it('flags a duplicate keys spec within a scope', () => {
    const issues = keymapIssues([
      {
        scope: 'list',
        title: 'X',
        bindings: [
          { keys: 'a', description: 'one' },
          { keys: 'a', description: 'two' },
        ],
      },
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toContain('duplicate keys');
  });

  it('flags a multi-character accelerator', () => {
    const issues = keymapIssues([
      {
        scope: 'list',
        title: 'X',
        bindings: [{ keys: 'ab', description: 'd', accelerator: 'ab' }],
      },
    ]);
    expect(issues.some((i) => i.message.includes('single character'))).toBe(
      true,
    );
  });

  it('flags an accelerator absent from its keys', () => {
    const issues = keymapIssues([
      {
        scope: 'list',
        title: 'X',
        bindings: [{ keys: 'abc', description: 'd', accelerator: 'z' }],
      },
    ]);
    expect(issues.some((i) => i.message.includes('not present in keys'))).toBe(
      true,
    );
  });

  it('flags an accelerator collision within a scope', () => {
    const issues = keymapIssues([
      {
        scope: 'list',
        title: 'X',
        bindings: [
          { keys: 'one', description: 'a', accelerator: 'o' },
          { keys: 'two', description: 'b', accelerator: 'o' },
        ],
      },
    ]);
    expect(issues.some((i) => i.message.includes('collides'))).toBe(true);
  });
});

describe('drift guard: every button accelerator is in KEYMAP', () => {
  // The single list of every accelerator declared by a measured
  // `<Button>`/`<DropdownButton>` in the app. Sourced from the real button
  // definitions so adding a button accelerator without a KEYMAP entry fails
  // this test. (`header.namespace`/`header.search` declare no accelerator.)
  const BUTTON_ACCELERATORS: readonly string[] = [
    ...Object.values(LOGS_TOOLBAR_ACCELERATORS),
    'c', // header.context button
    'r', // context.retry banner button
    'c', // context.switch banner button
  ];

  it('contains every measured-button accelerator', () => {
    const documented = acceleratorSet();
    for (const accel of BUTTON_ACCELERATORS) {
      expect(documented.has(accel.toLowerCase())).toBe(true);
    }
  });

  it('fails loudly when a button accelerator is undocumented', () => {
    // Sentinel: an accelerator the registry does not declare must NOT pass the
    // membership check — proves the guard above can actually fail.
    expect(acceleratorSet().has('z')).toBe(false);
  });
});

describe('groupsFor — current-region-first ordering', () => {
  it('leads with the current scope, then global, then the rest', () => {
    const ordered = groupsFor('list').map((g) => g.scope);
    expect(ordered[0]).toBe('list');
    expect(ordered[1]).toBe('global');
    expect(new Set(ordered)).toEqual(new Set(ALL_SCOPES));
  });

  it('does not duplicate global when global is the current scope', () => {
    const ordered = groupsFor('global').map((g) => g.scope);
    expect(ordered[0]).toBe('global');
    expect(ordered.filter((s) => s === 'global')).toHaveLength(1);
    expect(new Set(ordered)).toEqual(new Set(ALL_SCOPES));
  });

  it('preserves canonical order for the trailing groups', () => {
    const ordered = groupsFor('detail.logs').map((g) => g.scope);
    expect(ordered[0]).toBe('detail.logs');
    expect(ordered[1]).toBe('global');
    // Every scope appears exactly once.
    for (const scope of ALL_SCOPES) {
      expect(ordered.filter((s) => s === scope)).toHaveLength(1);
    }
  });
});

describe('scopeForFocus', () => {
  it('maps regions to their scopes', () => {
    expect(scopeForFocus('sidebar')).toBe('sidebar');
    expect(scopeForFocus('list')).toBe('list');
    expect(scopeForFocus('commandbar')).toBe('commandBar');
    expect(scopeForFocus('detail')).toBe('detail');
  });

  it('resolves the detail tab to a tab-specific scope', () => {
    expect(scopeForFocus('detail', 'logs')).toBe('detail.logs');
    expect(scopeForFocus('detail', 'yaml')).toBe('detail.yaml');
    expect(scopeForFocus('detail', 'metrics')).toBe('detail.metrics');
    expect(scopeForFocus('detail', 'overview')).toBe('detail');
  });

  it('falls back to global for unknown / missing focus', () => {
    expect(scopeForFocus(null)).toBe('global');
    expect(scopeForFocus(undefined)).toBe('global');
    expect(scopeForFocus('bogus')).toBe('global');
    expect(scopeForFocus('detail', null)).toBe('detail');
  });
});

describe('acceleratorSet', () => {
  it('collects the documented accelerators, lower-cased', () => {
    const set = acceleratorSet();
    expect(set.has('o')).toBe(true);
    expect(set.has('c')).toBe(true);
    expect(set.has('d')).toBe(true);
  });
});

describe('helpLines (flattened overlay rows)', () => {
  it('leads with the current scope heading then a blank before the next group', () => {
    const lines = helpLines('list');
    expect(lines[0]).toEqual({ kind: 'heading', text: 'List' });
    // The first binding of the List group follows the heading.
    expect(lines[1]).toMatchObject({ kind: 'binding' });
    // A blank spacer separates groups; there is at least one.
    expect(lines.some((l) => l.kind === 'blank')).toBe(true);
  });

  it('starts with a heading, not a blank (no leading spacer)', () => {
    expect(helpLines('global')[0]).toMatchObject({ kind: 'heading' });
  });

  it('emits one binding line per binding across all groups', () => {
    const lines = helpLines('global');
    const bindingCount = lines.filter((l) => l.kind === 'binding').length;
    const total = KEYMAP.reduce((n, g) => n + g.bindings.length, 0);
    expect(bindingCount).toBe(total);
  });
});

describe('renderKeymapMarkdown (README generator for B10)', () => {
  it('renders a heading + table per group', () => {
    const md = renderKeymapMarkdown();
    for (const group of KEYMAP) {
      expect(md).toContain(`### ${group.title}`);
    }
    expect(md).toContain('| Key | Action |');
  });

  it('renders every binding as a table row', () => {
    const md = renderKeymapMarkdown();
    for (const group of KEYMAP) {
      for (const binding of group.bindings) {
        expect(md).toContain(
          `| \`${binding.keys}\` | ${binding.description} |`,
        );
      }
    }
  });

  it('is deterministic', () => {
    expect(renderKeymapMarkdown()).toEqual(renderKeymapMarkdown());
  });
});
