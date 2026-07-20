import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import jsYaml from 'js-yaml';
import {
  YamlTab,
  discardConfirmKeyAction,
  type YamlTabProps,
  type YamlReplaceResult,
  type YamlReloadResult,
} from './YamlTab.js';
import { Text } from 'ink';
import type { Key as InkKey } from 'ink';
import type { ConfirmSelection } from './ConfirmDialog.js';
import type { KubernetesObject } from '../../core/types.js';
import { safeWrite, tick } from '../../../test/ink-stdin.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dump(obj: KubernetesObject): string {
  return jsYaml.dump(obj, { lineWidth: -1, indent: 2 });
}

function makeConfigMap(
  data: Record<string, string>,
  name = 'my-cfg',
): KubernetesObject {
  return {
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: { name, namespace: 'default', resourceVersion: '1' },
    data,
  };
}

function makeSecret(data: Record<string, string>): KubernetesObject {
  return {
    apiVersion: 'v1',
    kind: 'Secret',
    metadata: { name: 'db-creds', namespace: 'default', resourceVersion: '1' },
    data,
  };
}

const okReplace = (): Promise<YamlReplaceResult> =>
  Promise.resolve({ ok: true });
const okReload = (): Promise<YamlReloadResult> =>
  Promise.resolve({ ok: true, yaml: 'kind: X\n' });
const identityEditor = (s: string): Promise<string> => Promise.resolve(s);

function makeProps(
  resource: KubernetesObject,
  overrides: Partial<YamlTabProps> = {},
): YamlTabProps {
  const kind = resource.kind ?? '';
  return {
    yaml: dump(resource),
    kind,
    title: `${kind}/default/${resource.metadata?.name ?? ''}`,
    onReplace: okReplace,
    onReload: okReload,
    onOpenInEditor: identityEditor,
    ...overrides,
  };
}

function renderTab(
  resource: KubernetesObject,
  overrides: Partial<YamlTabProps> = {},
): ReturnType<typeof render> {
  return render(React.createElement(YamlTab, makeProps(resource, overrides)));
}

async function ticks(n = 5): Promise<void> {
  for (let i = 0; i < n; i++) {
    await tick();
  }
}

// ---------------------------------------------------------------------------
// Read mode
// ---------------------------------------------------------------------------

describe('YamlTab read mode', () => {
  it('renders YAML content with line numbers and apiVersion', () => {
    const { lastFrame } = renderTab(makeConfigMap({ key: 'value' }));
    const frame = lastFrame() ?? '';
    expect(frame).toContain('my-cfg');
    expect(frame).toContain('apiVersion');
    expect(frame).toMatch(/\d/);
  });

  it('renders [Edit] button', () => {
    expect(renderTab(makeConfigMap({})).lastFrame()).toContain('[Edit]');
  });

  it('renders number / boolean / null token types', () => {
    const resource: KubernetesObject = {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: { name: 'typed', namespace: 'default', resourceVersion: '1' },
      spec: { replicas: 3, enabled: true, value: null },
    };
    const frame = renderTab(resource).lastFrame() ?? '';
    expect(frame).toContain('3');
    expect(frame).toContain('true');
    expect(frame).toContain('null');
  });
});

describe('YamlTab secret redaction', () => {
  it('masks Secret data by default (fixed-width mask) and shows [reveal]', () => {
    const { lastFrame } = renderTab(makeSecret({ password: 'c2VjcmV0' }));
    const frame = lastFrame() ?? '';
    expect(frame).toContain('••••••••');
    expect(frame).not.toContain('c2VjcmV0');
    expect(frame).toContain('[reveal]');
  });

  it('does not show [reveal] for non-Secret resources', () => {
    expect(renderTab(makeConfigMap({ key: 'v' })).lastFrame()).not.toContain(
      '[reveal]',
    );
  });

  it('reveals decoded secret plaintext when v is pressed (accelerator = v)', async () => {
    const { lastFrame, stdin } = renderTab(
      makeSecret({ password: 'c2VjcmV0' }),
    );
    await tick();
    expect(lastFrame()).toContain('••••••••');
    await safeWrite(stdin, 'v');
    await ticks();
    const frame = lastFrame() ?? '';
    // c2VjcmV0 base64-decodes to "secret" — reveal shows the plaintext, not
    // the raw base64.
    expect(frame).toContain('secret');
    expect(frame).not.toContain('c2VjcmV0');
    expect(frame).not.toContain('[reveal]');
    expect(frame).toContain('[hide]');
  });

  it('re-masks when v is pressed again', async () => {
    const { lastFrame, stdin } = renderTab(
      makeSecret({ password: 'c2VjcmV0' }),
    );
    await tick();
    await safeWrite(stdin, 'v');
    await ticks();
    expect(lastFrame()).toContain('secret');
    await safeWrite(stdin, 'v');
    await ticks();
    const frame = lastFrame() ?? '';
    expect(frame).toContain('••••••••');
    expect(frame).not.toContain('secret');
    expect(frame).toContain('[reveal]');
  });

  it('edit-mode buffer contains the real base64 even while masked', async () => {
    const { lastFrame, stdin } = renderTab(
      makeSecret({ password: 'c2VjcmV0' }),
    );
    await tick();
    expect(lastFrame()).toContain('••••••••');
    await safeWrite(stdin, 'e');
    await ticks();
    const frame = lastFrame() ?? '';
    expect(frame).toContain('c2VjcmV0');
    expect(frame).not.toContain('••••••••');
  });
});

describe('YamlTab managedFields toggle (P9R-0016)', () => {
  function makeConfigMapWithManagedFields(): KubernetesObject {
    return {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: {
        name: 'my-cfg',
        namespace: 'default',
        resourceVersion: '1',
        managedFields: [{ manager: 'kubectl', operation: 'Update' }],
      },
      data: { key: 'value' },
    };
  }

  it('hides managedFields by default, shows a [managed] chip, and calls onToggleManagedFields on m', async () => {
    const onToggleManagedFields = vi.fn();
    const { lastFrame, stdin } = renderTab(makeConfigMapWithManagedFields(), {
      onToggleManagedFields,
    });
    const frame = lastFrame() ?? '';
    expect(frame).toContain('[managed]');
    expect(frame).not.toContain('managedFields');
    await safeWrite(stdin, 'm');
    expect(onToggleManagedFields).toHaveBeenCalledOnce();
  });

  it('shows managedFields and a [hide managed] chip when managedVisible is true', () => {
    const { lastFrame } = renderTab(makeConfigMapWithManagedFields(), {
      managedVisible: true,
    });
    const frame = lastFrame() ?? '';
    expect(frame).toContain('[hide managed]');
    expect(frame).toContain('managedFields');
  });

  it('m with no onToggleManagedFields wired is a harmless no-op', async () => {
    const { lastFrame, stdin } = renderTab(makeConfigMapWithManagedFields());
    await safeWrite(stdin, 'm');
    expect(lastFrame()).toContain('[managed]');
  });

  it('does not show a [managed] chip or respond to m for resources without managedFields', async () => {
    const onToggleManagedFields = vi.fn();
    const { lastFrame, stdin } = renderTab(makeConfigMap({ key: 'v' }), {
      onToggleManagedFields,
    });
    expect(lastFrame()).not.toContain('[managed]');
    await safeWrite(stdin, 'm');
    expect(onToggleManagedFields).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Edit mode entry / exit
// ---------------------------------------------------------------------------

describe('YamlTab edit mode', () => {
  it('enters edit mode on "e" and shows Ctrl+S / Ctrl+E hints', async () => {
    const { lastFrame, stdin } = renderTab(makeConfigMap({ key: 'v' }));
    await safeWrite(stdin, 'e');
    const frame = lastFrame() ?? '';
    expect(frame).toContain('EDITING');
    expect(frame).toContain('Ctrl+S');
    expect(frame).toContain('Ctrl+E');
  });

  it('Escape with a clean buffer returns to read mode', async () => {
    const { lastFrame, stdin } = renderTab(makeConfigMap({ key: 'v' }));
    await safeWrite(stdin, 'e');
    await safeWrite(stdin, '\x1B');
    expect(lastFrame()).not.toContain('Discard changes?');
    expect(lastFrame()).toContain('[Edit]');
  });

  it('Ctrl+S with valid YAML opens the diff', async () => {
    const { lastFrame, stdin } = renderTab(makeConfigMap({ env: 'staging' }));
    await safeWrite(stdin, 'e');
    await safeWrite(stdin, 'x'); // dirty the buffer — a no-op save skips the diff
    await safeWrite(stdin, '\x13');
    const frame = lastFrame() ?? '';
    expect(frame).toContain('[Apply]');
    expect(frame).toContain('[Cancel]');
  });

  it('Ctrl+S with an unmodified buffer is a no-op (P9R-0016)', async () => {
    const onNoChanges = vi.fn();
    const { lastFrame, stdin } = renderTab(makeConfigMap({ env: 'staging' }), {
      onNoChanges,
    });
    await safeWrite(stdin, 'e');
    await safeWrite(stdin, '\x13');
    expect(onNoChanges).toHaveBeenCalledOnce();
    expect(lastFrame()).toContain('EDITING');
    expect(lastFrame()).not.toContain('[Apply]');
  });

  it('Ctrl+S / Escape in read mode are no-ops', async () => {
    const { lastFrame, stdin } = renderTab(makeConfigMap({ env: 'staging' }));
    await safeWrite(stdin, '\x13');
    expect(lastFrame()).toContain('[Edit]');
    await safeWrite(stdin, '\x1B');
    expect(lastFrame()).toContain('[Edit]');
  });
});

// ---------------------------------------------------------------------------
// Diff / apply / conflict / reload
// ---------------------------------------------------------------------------

describe('YamlTab diff + apply flow', () => {
  it('apply success returns to read mode and calls onSave', async () => {
    const onSave = vi.fn();
    const { lastFrame, stdin } = renderTab(makeConfigMap({ env: 'staging' }), {
      onSave,
    });
    await safeWrite(stdin, 'e');
    await safeWrite(stdin, 'x'); // dirty the buffer — a no-op save skips the diff
    await safeWrite(stdin, '\x13'); // → diff
    await safeWrite(stdin, '\r'); // → apply
    await ticks();
    expect(lastFrame()).toContain('[Edit]');
    expect(onSave).toHaveBeenCalledOnce();
  });

  it('cancel in diff returns to edit mode', async () => {
    const { lastFrame, stdin } = renderTab(makeConfigMap({ env: 'staging' }));
    await safeWrite(stdin, 'e');
    await safeWrite(stdin, 'x'); // dirty the buffer — a no-op save skips the diff
    await safeWrite(stdin, '\x13'); // → diff
    await safeWrite(stdin, '\x1B'); // cancel → edit
    await ticks();
    expect(lastFrame()).toContain('EDITING');
  });

  it('apply conflict shows the conflict bar, then reload-&-re-edit re-opens the editor', async () => {
    const onReplace = vi
      .fn<(y: string) => Promise<YamlReplaceResult>>()
      .mockResolvedValue({ ok: false, conflict: true });
    const onReload = vi
      .fn<() => Promise<YamlReloadResult>>()
      .mockResolvedValue({
        ok: true,
        yaml: 'kind: ConfigMap\ndata:\n  env: fresh\n',
      });
    const { lastFrame, stdin } = renderTab(makeConfigMap({ env: 'staging' }), {
      onReplace,
      onReload,
    });
    await safeWrite(stdin, 'e');
    await safeWrite(stdin, 'x'); // dirty the buffer — a no-op save skips the diff
    await safeWrite(stdin, '\x13'); // → diff
    await safeWrite(stdin, '\r'); // → apply → 409
    await ticks();
    expect(lastFrame()).toContain('Conflict');
    await safeWrite(stdin, 'r'); // reload-&-re-edit
    await ticks();
    const frame = lastFrame() ?? '';
    expect(frame).toContain('EDITING');
    expect(frame).toContain('fresh');
  });

  it('apply error keeps the diff and shows the message', async () => {
    const onReplace = vi
      .fn<(y: string) => Promise<YamlReplaceResult>>()
      .mockResolvedValue({ ok: false, conflict: false, message: 'forbidden' });
    const { lastFrame, stdin } = renderTab(makeConfigMap({ env: 'staging' }), {
      onReplace,
    });
    await safeWrite(stdin, 'e');
    await safeWrite(stdin, 'x'); // dirty the buffer — a no-op save skips the diff
    await safeWrite(stdin, '\x13');
    await safeWrite(stdin, '\r');
    await ticks();
    expect(lastFrame()).toContain('forbidden');
  });

  it('reload failure shows the error in the diff', async () => {
    const onReplace = vi
      .fn<(y: string) => Promise<YamlReplaceResult>>()
      .mockResolvedValue({ ok: false, conflict: true });
    const onReload = vi
      .fn<() => Promise<YamlReloadResult>>()
      .mockResolvedValue({ ok: false, message: 'gone' });
    const { lastFrame, stdin } = renderTab(makeConfigMap({ env: 'staging' }), {
      onReplace,
      onReload,
    });
    await safeWrite(stdin, 'e');
    await safeWrite(stdin, 'x'); // dirty the buffer — a no-op save skips the diff
    await safeWrite(stdin, '\x13');
    await safeWrite(stdin, '\r');
    await ticks();
    await safeWrite(stdin, 'r');
    await ticks();
    expect(lastFrame()).toContain('gone');
  });

  it('discard from a conflict returns to read mode', async () => {
    const onReplace = vi
      .fn<(y: string) => Promise<YamlReplaceResult>>()
      .mockResolvedValue({ ok: false, conflict: true });
    const { lastFrame, stdin } = renderTab(makeConfigMap({ env: 'staging' }), {
      onReplace,
    });
    await safeWrite(stdin, 'e');
    await safeWrite(stdin, 'x'); // dirty the buffer — a no-op save skips the diff
    await safeWrite(stdin, '\x13');
    await safeWrite(stdin, '\r');
    await ticks();
    expect(lastFrame()).toContain('Conflict');
    await safeWrite(stdin, '\x1B'); // discard
    await ticks();
    expect(lastFrame()).toContain('[Edit]');
  });
});

// ---------------------------------------------------------------------------
// $EDITOR pop-out (Ctrl+E)
// ---------------------------------------------------------------------------

describe('YamlTab $EDITOR pop-out', () => {
  it('Ctrl+E calls onOpenInEditor and loads the returned content', async () => {
    const onOpenInEditor = vi
      .fn<(y: string) => Promise<string>>()
      .mockResolvedValue('kind: ConfigMap\ndata:\n  env: external\n');
    const { lastFrame, stdin } = renderTab(makeConfigMap({ env: 'staging' }), {
      onOpenInEditor,
    });
    await safeWrite(stdin, 'e');
    await safeWrite(stdin, '\x05'); // Ctrl+E
    await ticks();
    expect(onOpenInEditor).toHaveBeenCalledOnce();
    const frame = lastFrame() ?? '';
    expect(frame).toContain('EDITING');
    expect(frame).toContain('external');
  });

  it('a returned invalid document surfaces the inline validation error', async () => {
    const onOpenInEditor = vi
      .fn<(y: string) => Promise<string>>()
      .mockResolvedValue('key: {unclosed');
    const { lastFrame, stdin } = renderTab(makeConfigMap({ env: 'staging' }), {
      onOpenInEditor,
    });
    await safeWrite(stdin, 'e');
    await safeWrite(stdin, '\x05');
    await ticks();
    expect(lastFrame()).toContain('YAML error');
  });
});

// ---------------------------------------------------------------------------
// $EDITOR reentry seed (B2): the suspend round-trip remounts the tab; the
// controller hands the externally-edited content back via reentryContent so the
// editor reopens on it (in edit mode) instead of a frozen read view.
// ---------------------------------------------------------------------------

describe('YamlTab $EDITOR reentry seed', () => {
  it('boots into edit mode on the reentry content and consumes the seed', async () => {
    const onReentryConsumed = vi.fn();
    const modes: string[] = [];
    const { lastFrame } = renderTab(makeConfigMap({ env: 'staging' }), {
      reentryContent: 'kind: ConfigMap\ndata:\n  env: reentered\n',
      onReentryConsumed,
      onModeChange: (m) => modes.push(m),
    });
    await ticks();
    const frame = lastFrame() ?? '';
    expect(frame).toContain('EDITING');
    expect(frame).toContain('reentered');
    // The seed is consumed once and edit mode is re-asserted on mount.
    expect(onReentryConsumed).toHaveBeenCalledOnce();
    expect(modes).toEqual(['edit']);
  });

  it('surfaces a validation error when the reentry content is invalid', async () => {
    const { lastFrame } = renderTab(makeConfigMap({ env: 'staging' }), {
      reentryContent: 'key: {unclosed',
      onReentryConsumed: vi.fn(),
    });
    await ticks();
    const frame = lastFrame() ?? '';
    expect(frame).toContain('EDITING');
    expect(frame).toContain('YAML error');
  });

  it('does not fire the reentry effect without a seed (read mode)', async () => {
    const onReentryConsumed = vi.fn();
    const { lastFrame } = renderTab(makeConfigMap({ env: 'staging' }), {
      onReentryConsumed,
    });
    await ticks();
    expect(lastFrame()).toContain('[Edit]');
    expect(onReentryConsumed).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Dirty-boot seam + discard-confirm + cursor editing
// ---------------------------------------------------------------------------

const DIRTY = 'apiVersion: v1\nkind: ConfigMap\ndata:\n  env: DIFFERENT\n';

describe('YamlTab dirty buffer (test seam)', () => {
  it('shows the modified-line gutter marker when booted dirty', () => {
    const { lastFrame } = renderTab(makeConfigMap({ env: 'staging' }), {
      _testInitialContent: DIRTY,
    });
    const frame = lastFrame() ?? '';
    expect(frame).toContain('│');
    expect(frame).toContain('DIFFERENT');
  });

  it('Escape with a dirty buffer asks to discard', async () => {
    const { lastFrame, stdin } = renderTab(makeConfigMap({ env: 'staging' }), {
      _testInitialContent: DIRTY,
    });
    await safeWrite(stdin, '\x1B');
    expect(lastFrame()).toContain('Discard changes?');
  });

  it('y / Y discards and returns to read mode', async () => {
    for (const key of ['y', 'Y']) {
      const { lastFrame, stdin } = renderTab(
        makeConfigMap({ env: 'staging' }),
        {
          _testInitialContent: DIRTY,
        },
      );
      await safeWrite(stdin, '\x1B');
      await safeWrite(stdin, key);
      expect(lastFrame()).toContain('[Edit]');
      expect(lastFrame()).not.toContain('Discard changes?');
    }
  });

  it('n / N / Escape keeps editing', async () => {
    for (const key of ['n', 'N', '\x1B']) {
      const { lastFrame, stdin } = renderTab(
        makeConfigMap({ env: 'staging' }),
        {
          _testInitialContent: DIRTY,
        },
      );
      await safeWrite(stdin, '\x1B'); // → discard-confirm
      await safeWrite(stdin, key); // decline
      expect(lastFrame()).toContain('EDITING');
    }
  });

  it('Ctrl+S with invalid YAML shows the inline validation error', async () => {
    const { lastFrame, stdin } = renderTab(makeConfigMap({ env: 'staging' }), {
      _testInitialContent: 'data: {\n  invalid here\n',
    });
    await safeWrite(stdin, '\x13');
    expect(lastFrame()).toContain('YAML error');
  });

  it('ignores leaked SGR mouse bytes in the edit buffer', async () => {
    const { lastFrame, stdin } = renderTab(makeConfigMap({ env: 'staging' }), {
      _testInitialContent: 'kind: Pod\n',
    });
    // A leaked SGR report would otherwise type its digits into the buffer.
    await safeWrite(stdin, '[<0;74;15M');
    expect(lastFrame()).not.toContain('74;15');
    expect(lastFrame()).toContain('kind: Pod');
  });

  it('an unrelated key leaves the discard prompt up', async () => {
    const { lastFrame, stdin } = renderTab(makeConfigMap({ env: 'staging' }), {
      _testInitialContent: DIRTY,
    });
    await safeWrite(stdin, '\x1B'); // → discard-confirm
    await safeWrite(stdin, 'z'); // not y/n/arrow/Enter/Esc → no-op
    expect(lastFrame()).toContain('Discard changes?');
  });

  it('Enter confirms the discard (default selection is Yes)', async () => {
    const { lastFrame, stdin } = renderTab(makeConfigMap({ env: 'staging' }), {
      _testInitialContent: DIRTY,
    });
    await safeWrite(stdin, '\x1B'); // → discard-confirm
    await safeWrite(stdin, '\r'); // Enter activates highlighted [Yes]
    expect(lastFrame()).toContain('[Edit]');
    expect(lastFrame()).not.toContain('Discard changes?');
  });

  it('arrow toggles to No so Enter keeps editing', async () => {
    const { lastFrame, stdin } = renderTab(makeConfigMap({ env: 'staging' }), {
      _testInitialContent: DIRTY,
    });
    await safeWrite(stdin, '\x1B'); // → discard-confirm
    await safeWrite(stdin, '\x1B[C'); // right → select No
    await safeWrite(stdin, '\r'); // Enter on No keeps editing
    expect(lastFrame()).toContain('EDITING');
  });

  it('renderDiscardButton receives selection + a working onClick for [Yes]', async () => {
    const clicks = new Map<ConfirmSelection, () => void>();
    const seen: { which: ConfirmSelection; selected: boolean }[] = [];
    const { lastFrame, stdin } = renderTab(makeConfigMap({ env: 'staging' }), {
      _testInitialContent: DIRTY,
      renderDiscardButton: ({ which, label, selected, onClick }) => {
        clicks.set(which, onClick);
        seen.push({ which, selected });
        return <Text key={which}>{`[${label}${selected ? '*' : ''}]`}</Text>;
      },
    });
    await safeWrite(stdin, '\x1B'); // → discard-confirm; renderDiscardButton runs
    // Default selection highlights [Yes].
    expect(seen).toContainEqual({ which: 'confirm', selected: true });
    expect(seen).toContainEqual({ which: 'cancel', selected: false });
    // Invoking the [Yes] click handler discards (mirrors a mouse click).
    clicks.get('confirm')?.();
    await tick();
    expect(lastFrame()).toContain('[Edit]');
    expect(lastFrame()).not.toContain('Discard changes?');
  });

  it('clicking [No] keeps editing (renderDiscardButton onClick)', async () => {
    const clicks = new Map<ConfirmSelection, () => void>();
    const { lastFrame, stdin } = renderTab(makeConfigMap({ env: 'staging' }), {
      _testInitialContent: DIRTY,
      renderDiscardButton: ({ which, onClick }) => {
        clicks.set(which, onClick);
        return <Text key={which}>{which}</Text>;
      },
    });
    await safeWrite(stdin, '\x1B'); // → discard-confirm
    clicks.get('cancel')?.();
    await tick();
    expect(lastFrame()).toContain('EDITING');
  });
});

describe('discardConfirmKeyAction', () => {
  const key = (over: Partial<InkKey> = {}): InkKey => {
    const base: InkKey = {
      upArrow: false,
      downArrow: false,
      leftArrow: false,
      rightArrow: false,
      pageDown: false,
      pageUp: false,
      return: false,
      escape: false,
      ctrl: false,
      shift: false,
      tab: false,
      backspace: false,
      delete: false,
      meta: false,
    };
    return { ...base, ...over };
  };

  it('y / Y always discards regardless of selection', () => {
    expect(discardConfirmKeyAction('y', key(), 'cancel')).toEqual({
      kind: 'discard',
    });
    expect(discardConfirmKeyAction('Y', key(), 'cancel')).toEqual({
      kind: 'discard',
    });
  });

  it('n / N always keeps editing regardless of selection', () => {
    expect(discardConfirmKeyAction('n', key(), 'confirm')).toEqual({
      kind: 'keep',
    });
    expect(discardConfirmKeyAction('N', key(), 'confirm')).toEqual({
      kind: 'keep',
    });
  });

  it('Escape cancels (keep editing)', () => {
    expect(
      discardConfirmKeyAction('', key({ escape: true }), 'confirm'),
    ).toEqual({ kind: 'keep' });
  });

  it('Enter activates the highlighted choice', () => {
    expect(
      discardConfirmKeyAction('', key({ return: true }), 'confirm'),
    ).toEqual({ kind: 'discard' });
    expect(
      discardConfirmKeyAction('', key({ return: true }), 'cancel'),
    ).toEqual({
      kind: 'keep',
    });
  });

  it('arrows / Tab toggle the selection', () => {
    expect(
      discardConfirmKeyAction('', key({ rightArrow: true }), 'confirm'),
    ).toEqual({ kind: 'select', selection: 'cancel' });
    expect(
      discardConfirmKeyAction('', key({ leftArrow: true }), 'cancel'),
    ).toEqual({ kind: 'select', selection: 'confirm' });
    expect(discardConfirmKeyAction('\t', key(), 'confirm')).toEqual({
      kind: 'select',
      selection: 'cancel',
    });
  });

  it('an unrelated key is a no-op', () => {
    expect(discardConfirmKeyAction('z', key(), 'confirm')).toEqual({
      kind: 'none',
    });
  });
});

const RIGHT = '\x1B[C';
const LEFT = '\x1B[D';
const UP = '\x1B[A';
const DOWN = '\x1B[B';
const BACKSPACE = '\b';
const FORWARD_DELETE = '\x1B[3~';

async function press(
  stdin: ReturnType<typeof render>['stdin'],
  ...inputs: string[]
): Promise<void> {
  for (const input of inputs) {
    await safeWrite(stdin, input);
  }
}

function renderEdit(content: string): ReturnType<typeof render> {
  return renderTab(makeConfigMap({ env: 'x' }), {
    _testInitialContent: content,
  });
}

describe('YamlTab cursor editing', () => {
  it('typing inserts at the cursor and advances it', async () => {
    const { lastFrame, stdin } = renderEdit('abc\ndef\n');
    await press(stdin, 'X', 'Y');
    expect(lastFrame()).toContain('XYabc');
  });

  it('pastes multi-character input wholesale', async () => {
    const { lastFrame, stdin } = renderEdit('abc\n');
    await press(stdin, 'hello');
    expect(lastFrame()).toContain('helloabc');
  });

  it('arrows move the cursor (right/left clamp)', async () => {
    const { lastFrame, stdin } = renderEdit('ab\n');
    await press(stdin, RIGHT, RIGHT, RIGHT, LEFT, 'X');
    expect(lastFrame()).toContain('aXb');
  });

  it('down restores the desired column past a short line', async () => {
    const { lastFrame, stdin } = renderEdit('abcd\nef\nghij\n');
    await press(stdin, RIGHT, RIGHT, RIGHT, DOWN, DOWN, 'X');
    expect(lastFrame()).toContain('ghiXj');
  });

  it('up clamps to the shorter line', async () => {
    const { lastFrame, stdin } = renderEdit('ab\ncdef\n');
    await press(stdin, DOWN, RIGHT, RIGHT, RIGHT, UP, 'X');
    expect(lastFrame()).toContain('abX');
  });

  it('return splits the line at the cursor', async () => {
    const { lastFrame, stdin } = renderEdit('abcd\n');
    await press(stdin, RIGHT, RIGHT, '\r', 'X');
    const frame = lastFrame() ?? '';
    expect(frame).toContain('1 ab');
    expect(frame).toContain('2 Xcd');
  });

  it('backspace deletes before the cursor / joins lines', async () => {
    const r1 = renderEdit('abc\n');
    await press(r1.stdin, RIGHT, RIGHT, BACKSPACE, 'X');
    expect(r1.lastFrame()).toContain('aXc');

    const r2 = renderEdit('ab\ncd\n');
    await press(r2.stdin, DOWN, BACKSPACE, 'X');
    expect(r2.lastFrame()).toContain('abXcd');
  });

  it('forward-delete removes at the cursor / joins the next line', async () => {
    const r1 = renderEdit('abc\n');
    await press(r1.stdin, FORWARD_DELETE);
    expect(r1.lastFrame()).toContain('1 bc');

    const r2 = renderEdit('ab\ncd\n');
    await press(r2.stdin, RIGHT, RIGHT, FORWARD_DELETE);
    expect(r2.lastFrame()).toContain('1 abcd');
  });

  it('ctrl+letter (not s/e), meta, tab and unhandled keys do not insert', async () => {
    const { lastFrame, stdin } = renderEdit('abc\n');
    await press(stdin, '\x01'); // Ctrl+A
    await press(stdin, '\x1Bz'); // Meta+z
    await press(stdin, '\t'); // Tab
    await press(stdin, '\x1B[5~'); // PageUp
    await press(stdin, 'X');
    expect(lastFrame()).toContain('Xabc');
  });

  it('preserves the cursor when declining discard-confirm', async () => {
    const { lastFrame, stdin } = renderEdit('abc\n');
    await press(stdin, RIGHT, '\x1B');
    expect(lastFrame()).toContain('Discard changes?');
    await press(stdin, 'n', 'X');
    expect(lastFrame()).toContain('aXbc');
  });

  it('preserves the cursor when cancelling the diff', async () => {
    const { lastFrame, stdin } = renderTab(makeConfigMap({ env: 'staging' }));
    await tick();
    // Dirty a different line (so line 0 stays untouched for the assertions
    // below) then move back to line 0, col 1, before Ctrl+S — an unmodified
    // buffer is now a no-op save (P9R-0016) and never reaches the diff.
    await press(stdin, 'e', DOWN, 'Z', UP, LEFT, RIGHT, '\x13');
    expect(lastFrame()).toContain('[Cancel]');
    await press(stdin, '\x1B'); // cancel → edit, cursor at col 1
    await press(stdin, 'X');
    expect(lastFrame()).toContain('aXpiVersion');
  });
});

// ---------------------------------------------------------------------------
// onModeChange
// ---------------------------------------------------------------------------

describe('YamlTab onModeChange', () => {
  it('reports edit → diff → read across the save flow', async () => {
    const modes: string[] = [];
    const { stdin } = renderTab(makeConfigMap({ env: 'staging' }), {
      onModeChange: (m) => modes.push(m),
    });
    const waitFor = async (n: number): Promise<void> => {
      for (let i = 0; i < 200 && modes.length < n; i++) {
        await tick();
      }
    };
    await safeWrite(stdin, 'e');
    await waitFor(1);
    await safeWrite(stdin, 'x'); // dirty the buffer — a no-op save skips the diff
    await safeWrite(stdin, '\x13');
    await waitFor(2);
    await safeWrite(stdin, '\r');
    await waitFor(3);
    await ticks();
    expect(modes).toEqual(['edit', 'diff', 'read']);
  });

  it('reports read when a Secret is revealed', async () => {
    const modes: string[] = [];
    const { stdin } = renderTab(makeSecret({ password: 'c2VjcmV0' }), {
      onModeChange: (m) => modes.push(m),
    });
    await safeWrite(stdin, 'v');
    expect(modes).toEqual(['read']);
  });

  it('reports discard-confirm then edit when declining a dirty escape', async () => {
    const modes: string[] = [];
    const { stdin } = renderTab(makeConfigMap({ env: 'staging' }), {
      _testInitialContent: DIRTY,
      onModeChange: (m) => modes.push(m),
    });
    await safeWrite(stdin, '\x1B');
    await safeWrite(stdin, 'n');
    expect(modes).toEqual(['discard-confirm', 'edit']);
  });
});

describe('YamlTab scroll viewport (chunk 03 / 07)', () => {
  it('read mode windows tall YAML and clips to width', () => {
    const big: Record<string, string> = {};
    for (let i = 0; i < 40; i++) {
      big[`key${String(i)}`] = `value-${String(i)}`;
    }
    const top = renderTab(makeConfigMap(big), {
      width: 40,
      offset: 0,
      viewportHeight: 5,
    });
    const topOut = top.lastFrame() ?? '';
    expect(topOut).toContain('[Edit]');
    expect(topOut).not.toContain('key39');

    const scrolled = renderTab(makeConfigMap(big), {
      width: 40,
      offset: 1000,
      viewportHeight: 5,
    });
    // clamped to bottom — the last keys are reachable, nothing clipped beyond it
    expect(scrolled.lastFrame()).toContain('key39');
  });

  it('edit mode follows the cursor: moving below the window scrolls it into view', async () => {
    const lines = Array.from(
      { length: 30 },
      (_, i) => `line${String(i)}: v`,
    ).join('\n');
    const { lastFrame, stdin } = render(
      React.createElement(
        YamlTab,
        makeProps(makeConfigMap({}), {
          _testInitialContent: lines,
          width: 60,
          offset: 0,
          viewportHeight: 6,
        }),
      ),
    );
    await ticks();
    // top of the buffer is shown, the tail is below the fold
    expect(lastFrame()).toContain('line0:');
    expect(lastFrame()).not.toContain('line20:');
    // push the cursor far down; the cursor-following scroll reveals later lines
    for (let i = 0; i < 20; i++) {
      await safeWrite(stdin, '\x1B[B'); // down arrow
    }
    await ticks();
    const frame = lastFrame() ?? '';
    expect(frame).toContain('line20:');
    expect(frame).not.toContain('line0:');
  });

  it('edit mode pans horizontally when the cursor moves past the width', async () => {
    const longLine = 'k: ' + 'abcdefghij'.repeat(8); // 83 chars
    const { lastFrame, stdin } = render(
      React.createElement(
        YamlTab,
        makeProps(makeConfigMap({}), {
          _testInitialContent: `${longLine}\nshort: v`,
          width: 20,
          offset: 0,
          viewportHeight: 6,
        }),
      ),
    );
    await ticks();
    for (let i = 0; i < 40; i++) {
      await safeWrite(stdin, '\x1B[C'); // right arrow
    }
    await ticks();
    // the start of the long line has scrolled out of view (left pan applied):
    // the line no longer begins with its `k: ` prefix.
    expect(lastFrame()).not.toContain('1 k: ');
  });
});
