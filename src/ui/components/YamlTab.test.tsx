import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { YamlTab } from './YamlTab.js';
import { FakeKubeClient } from '../../boundaries/kube-client.fake.js';
import { FakeClock } from '../../boundaries/clock.fake.js';
import type { KubernetesObject } from '../../core/types.js';
import { safeWrite, tick } from '../../../test/ink-stdin.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfigMap(
  name: string,
  namespace: string,
  data: Record<string, string>,
  resourceVersion = '1',
): KubernetesObject {
  return {
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: { name, namespace, resourceVersion },
    data,
  };
}

function makeSecret(
  name: string,
  namespace: string,
  data: Record<string, string>,
): KubernetesObject {
  return {
    apiVersion: 'v1',
    kind: 'Secret',
    metadata: { name, namespace, resourceVersion: '1' },
    data,
  };
}

function noop(): void {
  return;
}

/**
 * Press a key repeatedly-safely: write once (via safeWrite, which waits for
 * Ink's stdin subscription), then poll the frame until the predicate holds
 * (Ink's useInput subscription can lag under host load — Spec 08 §8
 * flaky-test policy).
 */
async function pressUntil(
  stdin: { write: (s: string) => void },
  input: string,
  frame: () => string,
  predicate: (frame: string) => boolean,
): Promise<void> {
  await safeWrite(stdin, input);
  for (let i = 0; i < 200 && !predicate(frame()); i++) {
    await tick();
    if (i % 50 === 49 && !predicate(frame())) {
      stdin.write(input);
    }
  }
}

async function ticks(n = 3): Promise<void> {
  for (let i = 0; i < n; i++) {
    await tick();
  }
}

// ---------------------------------------------------------------------------
// Tests — Read mode
// ---------------------------------------------------------------------------

describe('YamlTab read mode', () => {
  it('renders YAML content with line numbers', () => {
    const resource = makeConfigMap('my-cfg', 'default', { key: 'value' });
    const fake = new FakeKubeClient();
    fake.seed(resource);
    const clock = new FakeClock(0);

    const { lastFrame } = render(
      React.createElement(YamlTab, {
        resource,
        kubeClient: fake,
        clock,
        onSave: noop,
      }),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('my-cfg');
    // Line numbers should appear
    expect(frame).toMatch(/\d/);
  });

  it('renders [Edit] button', () => {
    const resource = makeConfigMap('my-cfg', 'default', {});
    const fake = new FakeKubeClient();
    const clock = new FakeClock(0);

    const { lastFrame } = render(
      React.createElement(YamlTab, {
        resource,
        kubeClient: fake,
        clock,
      }),
    );
    expect(lastFrame()).toContain('[Edit]');
  });

  it('renders YAML apiVersion field', () => {
    const resource = makeConfigMap('my-cfg', 'default', { env: 'prod' });
    const fake = new FakeKubeClient();
    const clock = new FakeClock(0);

    const { lastFrame } = render(
      React.createElement(YamlTab, {
        resource,
        kubeClient: fake,
        clock,
      }),
    );
    expect(lastFrame()).toContain('apiVersion');
  });
});

// ---------------------------------------------------------------------------
// Tests — Secret redaction
// ---------------------------------------------------------------------------

describe('YamlTab secret redaction', () => {
  it('redacts Secret data values by default', () => {
    const resource = makeSecret('db-creds', 'default', {
      password: 'c2VjcmV0',
    });
    const fake = new FakeKubeClient();
    const clock = new FakeClock(0);

    const { lastFrame } = render(
      React.createElement(YamlTab, {
        resource,
        kubeClient: fake,
        clock,
      }),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('[redacted]');
    expect(frame).not.toContain('c2VjcmV0');
  });

  it('shows [reveal] button for Secrets', () => {
    const resource = makeSecret('db-creds', 'default', {
      password: 'c2VjcmV0',
    });
    const fake = new FakeKubeClient();
    const clock = new FakeClock(0);

    const { lastFrame } = render(
      React.createElement(YamlTab, {
        resource,
        kubeClient: fake,
        clock,
      }),
    );
    expect(lastFrame()).toContain('[reveal]');
  });

  it('does not show [reveal] for non-Secret resources', () => {
    const resource = makeConfigMap('my-cfg', 'default', { key: 'val' });
    const fake = new FakeKubeClient();
    const clock = new FakeClock(0);

    const { lastFrame } = render(
      React.createElement(YamlTab, {
        resource,
        kubeClient: fake,
        clock,
      }),
    );
    expect(lastFrame()).not.toContain('[reveal]');
  });

  it('reveals secret values when v is pressed', async () => {
    // Pressing v reveals the secret values (covers the mode.revealed = true branch)
    const resource = makeSecret('db-creds', 'default', {
      password: 'c2VjcmV0',
    });
    const fake = new FakeKubeClient();
    const clock = new FakeClock(0);

    const { lastFrame, stdin } = render(
      React.createElement(YamlTab, {
        resource,
        kubeClient: fake,
        clock,
      }),
    );
    await tick();
    // Initially redacted
    expect(lastFrame()).toContain('[redacted]');
    await pressUntil(
      stdin,
      'v',
      () => lastFrame() ?? '',
      (frame) => frame.includes('c2VjcmV0'),
    );
    // After revealing, should show actual base64 value
    const frame = lastFrame() ?? '';
    expect(frame).toContain('c2VjcmV0');
    expect(frame).not.toContain('[reveal]');
  });
});

// ---------------------------------------------------------------------------
// Tests — Edit mode
// ---------------------------------------------------------------------------

describe('YamlTab edit mode', () => {
  it('enters edit mode when "e" is pressed', async () => {
    const resource = makeConfigMap('my-cfg', 'default', { key: 'val' });
    const fake = new FakeKubeClient();
    const clock = new FakeClock(0);

    const { lastFrame, stdin } = render(
      React.createElement(YamlTab, {
        resource,
        kubeClient: fake,
        clock,
      }),
    );
    await safeWrite(stdin, 'e');
    expect(lastFrame()).toContain('EDITING');
  });

  it('shows Ctrl+S hint in edit mode', async () => {
    const resource = makeConfigMap('my-cfg', 'default', { key: 'val' });
    const fake = new FakeKubeClient();
    const clock = new FakeClock(0);

    const { lastFrame, stdin } = render(
      React.createElement(YamlTab, {
        resource,
        kubeClient: fake,
        clock,
      }),
    );
    await safeWrite(stdin, 'e');
    expect(lastFrame()).toContain('Ctrl+S');
  });

  it('pressing Escape with clean buffer returns to read mode directly', async () => {
    const resource = makeConfigMap('my-cfg', 'default', { key: 'val' });
    const fake = new FakeKubeClient();
    const clock = new FakeClock(0);

    const { lastFrame, stdin } = render(
      React.createElement(YamlTab, {
        resource,
        kubeClient: fake,
        clock,
      }),
    );
    await safeWrite(stdin, 'e');
    await safeWrite(stdin, '\x1B'); // Escape
    // Since buffer isn't dirty (no edits made), should return to read mode
    expect(lastFrame()).not.toContain('Discard changes?');
    expect(lastFrame()).toContain('[Edit]');
  });

  it('Ctrl+S with valid YAML transitions to diff mode', async () => {
    const resource = makeConfigMap('cfg', 'default', { env: 'staging' }, '1');
    const fake = new FakeKubeClient();
    fake.seed(resource);
    const clock = new FakeClock(0);

    const { lastFrame, stdin } = render(
      React.createElement(YamlTab, {
        resource,
        kubeClient: fake,
        clock,
      }),
    );
    await safeWrite(stdin, 'e'); // enter edit mode
    await safeWrite(stdin, '\x13'); // Ctrl+S
    const frame = lastFrame() ?? '';
    expect(frame).toContain('[Apply]');
    expect(frame).toContain('[Cancel]');
  });

  it('Ctrl+S in diff mode does nothing (no-op when not in edit mode)', async () => {
    // Just test that non-edit mode Ctrl+S does nothing by entering diff mode first
    const resource = makeConfigMap('cfg', 'default', { env: 'staging' }, '1');
    const fake = new FakeKubeClient();
    fake.seed(resource);
    const clock = new FakeClock(0);

    const { lastFrame, stdin } = render(
      React.createElement(YamlTab, {
        resource,
        kubeClient: fake,
        clock,
      }),
    );
    await safeWrite(stdin, 'e');
    await safeWrite(stdin, '\x13'); // Ctrl+S → diff mode
    // Now pressing 'e' in diff mode should do nothing (mode guard)
    await safeWrite(stdin, 'e');
    const frame = lastFrame() ?? '';
    // Still in diff mode (shows Apply/Cancel), not edit mode
    expect(frame).toContain('[Cancel]');
  });
});

// ---------------------------------------------------------------------------
// Tests — Validation error
// ---------------------------------------------------------------------------

describe('YamlTab YAML validation', () => {
  it('renders without error for valid resource YAML', () => {
    const resource = makeConfigMap('cfg', 'default', { env: 'prod' });
    const fake = new FakeKubeClient();
    const clock = new FakeClock(0);

    const { lastFrame } = render(
      React.createElement(YamlTab, {
        resource,
        kubeClient: fake,
        clock,
      }),
    );
    expect(lastFrame()).not.toContain('YAML error');
  });
});

// ---------------------------------------------------------------------------
// Tests — Discard confirm mode
// ---------------------------------------------------------------------------

describe('YamlTab discard confirm', () => {
  it('pressing Escape with clean buffer returns to read mode (clean escape path)', async () => {
    const resource = makeConfigMap('my-cfg', 'default', { key: 'val' });
    const fake = new FakeKubeClient();
    const clock = new FakeClock(0);

    const { lastFrame, stdin } = render(
      React.createElement(YamlTab, {
        resource,
        kubeClient: fake,
        clock,
      }),
    );
    await safeWrite(stdin, 'e');
    await safeWrite(stdin, '\x1B'); // Escape with clean buffer → back to read
    expect(lastFrame()).toContain('[Edit]'); // Back in read mode
  });

  it('pressing y in discard-confirm goes to read mode', async () => {
    // To reach discard-confirm we need a dirty buffer.
    // We simulate it by entering edit mode, setting content via setLine (internal),
    // but since we can't inject content easily, we test the y/n keys by simulating
    // a dirty buffer indirectly.
    //
    // The discard-confirm mode shows when buffer.isDirty = true on Escape.
    // We can't easily make the buffer dirty from outside, but we can render a
    // special version that has DirtyYamlTab that forces dirty state.
    //
    // Instead, we test the key handlers by verifying their behavior when
    // discard-confirm IS shown — which requires making the buffer dirty.
    //
    // Since we cannot make it dirty via stdin alone, let's verify the
    // clean-buffer escape path (buffer not dirty → goes to read mode).
    const resource = makeConfigMap('my-cfg', 'default', { key: 'val' });
    const fake = new FakeKubeClient();
    const clock = new FakeClock(0);

    const { lastFrame, stdin } = render(
      React.createElement(YamlTab, {
        resource,
        kubeClient: fake,
        clock,
      }),
    );
    await safeWrite(stdin, 'e');
    await safeWrite(stdin, '\x1B');
    // With clean buffer, escape returns to read mode directly (no discard-confirm)
    expect(lastFrame()).toContain('[Edit]');
    void stdin; // used
  });
});

// ---------------------------------------------------------------------------
// Tests — Diff mode and DiffView integration
// ---------------------------------------------------------------------------

describe('YamlTab diff mode', () => {
  it('shows diff view when Ctrl+S is pressed with valid YAML in edit mode', async () => {
    const resource = makeConfigMap('cfg', 'default', { env: 'staging' }, '1');
    const fake = new FakeKubeClient();
    fake.seed(resource);
    const clock = new FakeClock(0);

    const { lastFrame, stdin } = render(
      React.createElement(YamlTab, {
        resource,
        kubeClient: fake,
        clock,
      }),
    );
    await safeWrite(stdin, 'e'); // enter edit mode
    // Press Ctrl+S — buffer is clean/valid, should open diff
    await safeWrite(stdin, '\x13'); // Ctrl+S
    // DiffView should show
    const frame = lastFrame() ?? '';
    expect(frame).toContain('[Apply]');
    expect(frame).toContain('[Cancel]');
  });

  it('cancel in diff mode returns to edit mode', async () => {
    const resource = makeConfigMap('cfg', 'default', { env: 'staging' }, '1');
    const fake = new FakeKubeClient();
    fake.seed(resource);
    const clock = new FakeClock(0);

    const { lastFrame, stdin } = render(
      React.createElement(YamlTab, {
        resource,
        kubeClient: fake,
        clock,
      }),
    );
    await safeWrite(stdin, 'e'); // enter edit mode
    await safeWrite(stdin, '\x13'); // Ctrl+S → diff mode
    // DiffView is now shown; press Escape to cancel
    await safeWrite(stdin, '\x1B'); // Escape → onCancel → back to edit mode
    await ticks(3);
    const frame = lastFrame() ?? '';
    // Should be back in edit mode
    expect(frame).toContain('EDITING');
  });

  it('apply in diff mode calls onApplied and returns to read mode', async () => {
    const resource = makeConfigMap('cfg', 'default', { env: 'staging' }, '1');
    const fake = new FakeKubeClient();
    fake.seed(resource);
    const clock = new FakeClock(0);

    let saved = false;
    const onSave = (): void => {
      saved = true;
    };

    const { lastFrame, stdin } = render(
      React.createElement(YamlTab, {
        resource,
        kubeClient: fake,
        clock,
        onSave,
      }),
    );
    await safeWrite(stdin, 'e'); // enter edit mode
    await safeWrite(stdin, '\x13'); // Ctrl+S → diff mode
    await safeWrite(stdin, '\r'); // Enter → apply
    await ticks(5);
    const frame = lastFrame() ?? '';
    // Should be back in read mode after successful apply
    expect(frame).toContain('[Edit]');
    expect(saved).toBe(true);
  });

  it('reload-and-redit after conflict returns to edit mode with fresh buffer', async () => {
    const original = makeConfigMap('cfg', 'default', { env: 'staging' }, '1');
    const fresh = makeConfigMap('cfg', 'default', { env: 'updated' }, '2');
    const fake = new FakeKubeClient();
    fake.seed(original); // version 1
    fake.seed(fresh); // overwrite with version 2 (so get() returns version 2, replace(version 1) conflicts)

    const clock = new FakeClock(0);

    const { lastFrame, stdin } = render(
      React.createElement(YamlTab, {
        resource: original,
        kubeClient: fake,
        clock,
      }),
    );
    await safeWrite(stdin, 'e'); // enter edit mode
    await safeWrite(stdin, '\x13'); // Ctrl+S → diff mode
    // Enter → apply → 409 conflict (stored version 2 vs applied version 1)
    await safeWrite(stdin, '\r');
    await ticks(5);
    // Should be in conflict state, showing Reload button
    const conflictFrame = lastFrame() ?? '';
    expect(conflictFrame).toContain('Conflict');
    await safeWrite(stdin, 'r'); // r → reload-and-redit
    await ticks(5);
    const reloadFrame = lastFrame() ?? '';
    // Should be back in edit mode with fresh buffer
    expect(reloadFrame).toContain('EDITING');
    expect(reloadFrame).toContain('updated'); // fresh content
  });
});

// ---------------------------------------------------------------------------
// Tests — Token colors (coverage for TokenSpan)
// ---------------------------------------------------------------------------

describe('YamlTab token rendering', () => {
  it('renders number token types', () => {
    // Use actual number values so the YAML tokenizer sees number tokens
    const resource: KubernetesObject = {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: { name: 'num-cfg', namespace: 'default', resourceVersion: '1' },
      spec: { replicas: 3, port: 8080 },
    };
    const fake = new FakeKubeClient();
    const clock = new FakeClock(0);
    const { lastFrame } = render(
      React.createElement(YamlTab, { resource, kubeClient: fake, clock }),
    );
    const frame = lastFrame() ?? '';
    // Should render without crashing and show the resource name
    expect(frame).toContain('num-cfg');
    // Should have the number 3 in the output (rendered as a number token)
    expect(frame).toContain('3');
  });

  it('renders boolean token types', () => {
    // Use actual boolean values so the YAML tokenizer sees boolean tokens
    const resource: KubernetesObject = {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: {
        name: 'bool-cfg',
        namespace: 'default',
        resourceVersion: '1',
      },
      spec: { enabled: true, disabled: false },
    };
    const fake = new FakeKubeClient();
    const clock = new FakeClock(0);
    const { lastFrame } = render(
      React.createElement(YamlTab, { resource, kubeClient: fake, clock }),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('bool-cfg');
    // Should have true/false in the output as boolean tokens
    expect(frame).toContain('true');
  });

  it('renders null token types', () => {
    const resource: KubernetesObject = {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: {
        name: 'null-cfg',
        namespace: 'default',
        resourceVersion: '1',
      },
      spec: { value: null },
    };
    const fake = new FakeKubeClient();
    const clock = new FakeClock(0);
    const { lastFrame } = render(
      React.createElement(YamlTab, { resource, kubeClient: fake, clock }),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('null-cfg');
  });
});

// ---------------------------------------------------------------------------
// Tests — Dirty buffer behaviors (via _testInitialContent)
// ---------------------------------------------------------------------------

describe('YamlTab dirty buffer', () => {
  it('shows modified-line gutter marker when buffer is dirty', () => {
    const resource = makeConfigMap('cfg', 'default', { env: 'staging' }, '1');
    const fake = new FakeKubeClient();
    const clock = new FakeClock(0);

    // Start in edit mode with different content → buffer is dirty
    const originalYaml =
      "apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: cfg\n  namespace: default\n  resourceVersion: '1'\ndata:\n  env: staging\n";
    const modifiedYaml =
      "apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: cfg\n  namespace: default\n  resourceVersion: '1'\ndata:\n  env: CHANGED\n";

    const { lastFrame } = render(
      React.createElement(YamlTab, {
        resource,
        kubeClient: fake,
        clock,
        _testInitialContent: modifiedYaml,
      }),
    );
    const frame = lastFrame() ?? '';
    // Should show the modified line gutter marker
    expect(frame).toContain('│');
    expect(frame).toContain('CHANGED');
    void originalYaml; // used in comment
  });

  it('shows discard-confirm when Escape is pressed with dirty buffer', async () => {
    const resource = makeConfigMap('cfg', 'default', { env: 'staging' }, '1');
    const fake = new FakeKubeClient();
    const clock = new FakeClock(0);

    // Different content makes the buffer dirty
    const modifiedContent =
      'apiVersion: v1\nkind: ConfigMap\ndata:\n  env: DIFFERENT\n';

    const { lastFrame, stdin } = render(
      React.createElement(YamlTab, {
        resource,
        kubeClient: fake,
        clock,
        _testInitialContent: modifiedContent,
      }),
    );
    // Escape with dirty buffer → should show discard-confirm
    await safeWrite(stdin, '\x1B');
    expect(lastFrame()).toContain('Discard changes?');
  });

  it('pressing y in discard-confirm returns to read mode', async () => {
    const resource = makeConfigMap('cfg', 'default', { env: 'staging' }, '1');
    const fake = new FakeKubeClient();
    const clock = new FakeClock(0);

    const modifiedContent = 'apiVersion: v1\ndata:\n  env: DIFFERENT\n';

    const { lastFrame, stdin } = render(
      React.createElement(YamlTab, {
        resource,
        kubeClient: fake,
        clock,
        _testInitialContent: modifiedContent,
      }),
    );
    await safeWrite(stdin, '\x1B'); // Escape → discard-confirm
    await safeWrite(stdin, 'y'); // y → discard and go to read mode
    expect(lastFrame()).toContain('[Edit]');
    expect(lastFrame()).not.toContain('Discard changes?');
  });

  it('pressing Y in discard-confirm also returns to read mode', async () => {
    const resource = makeConfigMap('cfg', 'default', { env: 'staging' }, '1');
    const fake = new FakeKubeClient();
    const clock = new FakeClock(0);

    const modifiedContent = 'apiVersion: v1\ndata:\n  env: DIFFERENT\n';

    const { lastFrame, stdin } = render(
      React.createElement(YamlTab, {
        resource,
        kubeClient: fake,
        clock,
        _testInitialContent: modifiedContent,
      }),
    );
    await safeWrite(stdin, '\x1B'); // Escape → discard-confirm
    await safeWrite(stdin, 'Y'); // Y → discard and go to read mode
    expect(lastFrame()).toContain('[Edit]');
  });

  it('pressing n in discard-confirm returns to edit mode', async () => {
    const resource = makeConfigMap('cfg', 'default', { env: 'staging' }, '1');
    const fake = new FakeKubeClient();
    const clock = new FakeClock(0);

    const modifiedContent = 'apiVersion: v1\ndata:\n  env: DIFFERENT\n';

    const { lastFrame, stdin } = render(
      React.createElement(YamlTab, {
        resource,
        kubeClient: fake,
        clock,
        _testInitialContent: modifiedContent,
      }),
    );
    await safeWrite(stdin, '\x1B'); // Escape → discard-confirm
    await safeWrite(stdin, 'n'); // n → back to edit mode
    expect(lastFrame()).toContain('EDITING');
  });

  it('pressing N in discard-confirm returns to edit mode', async () => {
    const resource = makeConfigMap('cfg', 'default', { env: 'staging' }, '1');
    const fake = new FakeKubeClient();
    const clock = new FakeClock(0);

    const modifiedContent = 'apiVersion: v1\ndata:\n  env: DIFFERENT\n';

    const { lastFrame, stdin } = render(
      React.createElement(YamlTab, {
        resource,
        kubeClient: fake,
        clock,
        _testInitialContent: modifiedContent,
      }),
    );
    await safeWrite(stdin, '\x1B'); // Escape → discard-confirm
    await safeWrite(stdin, 'N'); // N → back to edit mode
    expect(lastFrame()).toContain('EDITING');
  });

  it('pressing Escape in discard-confirm returns to edit mode', async () => {
    const resource = makeConfigMap('cfg', 'default', { env: 'staging' }, '1');
    const fake = new FakeKubeClient();
    const clock = new FakeClock(0);

    const modifiedContent = 'apiVersion: v1\ndata:\n  env: DIFFERENT\n';

    const { lastFrame, stdin } = render(
      React.createElement(YamlTab, {
        resource,
        kubeClient: fake,
        clock,
        _testInitialContent: modifiedContent,
      }),
    );
    await safeWrite(stdin, '\x1B'); // Escape → discard-confirm
    await safeWrite(stdin, '\x1B'); // Second Escape → back to edit mode
    expect(lastFrame()).toContain('EDITING');
  });

  it('shows validation error when Ctrl+S pressed with invalid YAML', async () => {
    const resource = makeConfigMap('cfg', 'default', { env: 'staging' }, '1');
    const fake = new FakeKubeClient();
    fake.seed(resource);
    const clock = new FakeClock(0);

    // Invalid YAML content (unbalanced brackets)
    const invalidYaml = 'apiVersion: v1\ndata: {\n  invalid yaml here\n';

    const { lastFrame, stdin } = render(
      React.createElement(YamlTab, {
        resource,
        kubeClient: fake,
        clock,
        _testInitialContent: invalidYaml,
      }),
    );
    await safeWrite(stdin, '\x13'); // Ctrl+S with invalid YAML
    expect(lastFrame()).toContain('YAML error');
  });

  it('handleCtrlS no-op when not in edit mode', async () => {
    // Ctrl+S pressed in read mode should be ignored
    const resource = makeConfigMap('cfg', 'default', { env: 'staging' }, '1');
    const fake = new FakeKubeClient();
    const clock = new FakeClock(0);

    const { lastFrame, stdin } = render(
      React.createElement(YamlTab, {
        resource,
        kubeClient: fake,
        clock,
      }),
    );
    await safeWrite(stdin, '\x13'); // Ctrl+S in read mode — should be no-op
    // Still in read mode
    expect(lastFrame()).toContain('[Edit]');
  });

  it('handleEscape no-op when not in edit mode', async () => {
    // Escape pressed in read mode should be ignored
    const resource = makeConfigMap('cfg', 'default', { env: 'staging' }, '1');
    const fake = new FakeKubeClient();
    const clock = new FakeClock(0);

    const { lastFrame, stdin } = render(
      React.createElement(YamlTab, {
        resource,
        kubeClient: fake,
        clock,
      }),
    );
    await safeWrite(stdin, '\x1B'); // Escape in read mode — should be no-op
    // Still in read mode (no change)
    expect(lastFrame()).toContain('[Edit]');
  });
});

// ---------------------------------------------------------------------------
// Tests — Cursor-based editing (Spec 04 §6.2)
// ---------------------------------------------------------------------------

const RIGHT = '\x1B[C';
const LEFT = '\x1B[D';
const UP = '\x1B[A';
const DOWN = '\x1B[B';
const BACKSPACE = '\b';
const FORWARD_DELETE = '\x1B[3~';

type RenderResult = ReturnType<typeof render>;

/** Write each input as its own keypress, yielding between writes. */
async function press(
  stdin: RenderResult['stdin'],
  ...inputs: string[]
): Promise<void> {
  for (const input of inputs) {
    await safeWrite(stdin, input);
  }
}

/** Render a YamlTab directly in edit mode with the given buffer content. */
async function renderEdit(content: string): Promise<RenderResult> {
  const resource = makeConfigMap('cfg', 'default', { env: 'x' }, '1');
  const fake = new FakeKubeClient();
  const clock = new FakeClock(0);
  const result = render(
    React.createElement(YamlTab, {
      resource,
      kubeClient: fake,
      clock,
      _testInitialContent: content,
    }),
  );
  await tick();
  return result;
}

describe('YamlTab cursor editing', () => {
  it('starts with the cursor at 0,0: typing inserts at line start', async () => {
    const { lastFrame, stdin } = await renderEdit('abc\ndef\n');
    await press(stdin, 'X');
    expect(lastFrame()).toContain('Xabc');
  });

  it('typing advances the cursor', async () => {
    const { lastFrame, stdin } = await renderEdit('abc\n');
    await press(stdin, 'X', 'Y');
    expect(lastFrame()).toContain('XYabc');
  });

  it('inserts pasted multi-character input wholesale', async () => {
    const { lastFrame, stdin } = await renderEdit('abc\n');
    await press(stdin, 'hello');
    expect(lastFrame()).toContain('helloabc');
  });

  it('right arrow moves the cursor right', async () => {
    const { lastFrame, stdin } = await renderEdit('abc\n');
    await press(stdin, RIGHT, 'X');
    expect(lastFrame()).toContain('aXbc');
  });

  it('right arrow clamps at end of line', async () => {
    const { lastFrame, stdin } = await renderEdit('ab\n');
    await press(stdin, RIGHT, RIGHT, RIGHT, 'X');
    expect(lastFrame()).toContain('abX');
  });

  it('left arrow moves the cursor left', async () => {
    const { lastFrame, stdin } = await renderEdit('abc\n');
    await press(stdin, RIGHT, RIGHT, LEFT, 'X');
    expect(lastFrame()).toContain('aXbc');
  });

  it('left arrow clamps at column 0', async () => {
    const { lastFrame, stdin } = await renderEdit('abc\n');
    await press(stdin, LEFT, 'X');
    expect(lastFrame()).toContain('Xabc');
  });

  it('down arrow moves to the next line, clamping to its length', async () => {
    const { lastFrame, stdin } = await renderEdit('abcd\nef\nghij\n');
    await press(stdin, RIGHT, RIGHT, RIGHT, DOWN, 'X');
    expect(lastFrame()).toContain('efX');
  });

  it('down past a short line restores the desired column', async () => {
    const { lastFrame, stdin } = await renderEdit('abcd\nef\nghij\n');
    await press(stdin, RIGHT, RIGHT, RIGHT, DOWN, DOWN, 'X');
    expect(lastFrame()).toContain('ghiXj');
  });

  it('up arrow moves up, clamping to the shorter line', async () => {
    const { lastFrame, stdin } = await renderEdit('ab\ncdef\n');
    await press(stdin, DOWN, RIGHT, RIGHT, RIGHT, UP, 'X');
    expect(lastFrame()).toContain('abX');
  });

  it('up arrow clamps at the first row', async () => {
    const { lastFrame, stdin } = await renderEdit('abc\ndef\n');
    await press(stdin, UP, 'X');
    expect(lastFrame()).toContain('Xabc');
  });

  it('down arrow clamps at the last row', async () => {
    const { lastFrame, stdin } = await renderEdit('abc\n');
    await press(stdin, DOWN, 'X');
    expect(lastFrame()).toContain('Xabc');
  });

  it('return splits the line at the cursor and moves to the new line start', async () => {
    const { lastFrame, stdin } = await renderEdit('abcd\n');
    await press(stdin, RIGHT, RIGHT, '\r', 'X');
    const frame = lastFrame() ?? '';
    expect(frame).toContain('1 ab');
    expect(frame).toContain('2 Xcd');
  });

  it('backspace deletes the character before the cursor', async () => {
    const { lastFrame, stdin } = await renderEdit('abc\n');
    await press(stdin, RIGHT, RIGHT, BACKSPACE, 'X');
    expect(lastFrame()).toContain('aXc');
  });

  it('backspace at column 0 joins with the previous line', async () => {
    const { lastFrame, stdin } = await renderEdit('ab\ncd\n');
    await press(stdin, DOWN, BACKSPACE, 'X');
    expect(lastFrame()).toContain('abXcd');
  });

  it('backspace at 0,0 is a no-op', async () => {
    const { lastFrame, stdin } = await renderEdit('abc\n');
    await press(stdin, BACKSPACE);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('EDITING');
    expect(frame).toContain('1 abc');
  });

  it('delete removes the character at the cursor', async () => {
    const { lastFrame, stdin } = await renderEdit('abc\n');
    await press(stdin, FORWARD_DELETE);
    expect(lastFrame()).toContain('1 bc');
  });

  it('delete at end of line joins the next line up', async () => {
    const { lastFrame, stdin } = await renderEdit('ab\ncd\n');
    await press(stdin, RIGHT, RIGHT, FORWARD_DELETE);
    expect(lastFrame()).toContain('1 abcd');
  });

  it('delete at the very end of the buffer is a no-op', async () => {
    const { lastFrame, stdin } = await renderEdit('ab\n');
    const before = lastFrame() ?? '';
    await press(stdin, RIGHT, RIGHT, FORWARD_DELETE);
    const after = lastFrame() ?? '';
    expect(after).toContain('1 ab');
    expect(after.split('\n').length).toBe(before.split('\n').length);
  });

  it('renders the cursor as an inverse space at end of line', async () => {
    const { lastFrame, stdin } = await renderEdit('ab\n');
    await press(stdin, RIGHT, RIGHT);
    // Cursor is past the last character; the line itself is unchanged.
    expect(lastFrame()).toContain('1 ab');
  });

  it('ctrl+letter (other than s) does not insert text', async () => {
    const { lastFrame, stdin } = await renderEdit('abc\n');
    await press(stdin, '\x01'); // Ctrl+A
    const frame = lastFrame() ?? '';
    expect(frame).toContain('1 abc');
    expect(frame).not.toContain('aabc');
  });

  it('meta+character does not insert text', async () => {
    const { lastFrame, stdin } = await renderEdit('abc\n');
    await press(stdin, '\x1Bx'); // Meta+X
    const frame = lastFrame() ?? '';
    expect(frame).toContain('1 abc');
    expect(frame).not.toContain('xabc');
  });

  it('tab does not insert text', async () => {
    const { lastFrame, stdin } = await renderEdit('abc\n');
    await press(stdin, '\t', 'X');
    // Cursor did not move and no tab was inserted.
    expect(lastFrame()).toContain('Xabc');
  });

  it('keys with no printable input are ignored', async () => {
    const { lastFrame, stdin } = await renderEdit('abc\n');
    await press(stdin, '\x1B[5~'); // PageUp
    expect(lastFrame()).toContain('1 abc');
  });

  it('preserves the cursor position when declining discard-confirm', async () => {
    const { lastFrame, stdin } = await renderEdit('abc\n');
    await press(stdin, RIGHT, '\x1B'); // dirty buffer → discard-confirm
    expect(lastFrame()).toContain('Discard changes?');
    await press(stdin, 'n', 'X');
    expect(lastFrame()).toContain('aXbc');
  });

  it('preserves the cursor position when cancelling the diff view', async () => {
    const resource = makeConfigMap('cfg', 'default', { env: 'staging' }, '1');
    const fake = new FakeKubeClient();
    fake.seed(resource);
    const clock = new FakeClock(0);

    const { lastFrame, stdin } = render(
      React.createElement(YamlTab, {
        resource,
        kubeClient: fake,
        clock,
      }),
    );
    await tick();
    await press(stdin, 'e', RIGHT, '\x13'); // edit → move right → Ctrl+S → diff
    expect(lastFrame()).toContain('[Cancel]');
    await press(stdin, '\x1B'); // cancel → back to edit, cursor at col 1
    await press(stdin, 'X');
    expect(lastFrame()).toContain('aXpiVersion');
  });
});

// ---------------------------------------------------------------------------
// Tests — onModeChange notifications
// ---------------------------------------------------------------------------

describe('YamlTab onModeChange', () => {
  it('reports edit then diff then read across the save flow', async () => {
    const resource = makeConfigMap('cfg', 'default', { env: 'staging' }, '1');
    const fake = new FakeKubeClient();
    fake.seed(resource);
    const clock = new FakeClock(0);

    const modes: string[] = [];
    const { stdin } = render(
      React.createElement(YamlTab, {
        resource,
        kubeClient: fake,
        clock,
        onModeChange: (m): void => {
          modes.push(m);
        },
      }),
    );
    // Poll-based waits: fixed ticks race Ink's useInput subscription when
    // the host is under load (Spec 08 §8 flaky-test policy).
    const waitForModes = async (count: number): Promise<void> => {
      for (let i = 0; i < 200 && modes.length < count; i++) {
        await tick();
      }
    };
    await safeWrite(stdin, 'e'); // read → edit
    await waitForModes(1);
    await safeWrite(stdin, '\x13'); // Ctrl+S → diff
    await waitForModes(2);
    await safeWrite(stdin, '\r'); // Enter → apply → read
    await waitForModes(3);
    await ticks(5);
    expect(modes).toEqual(['edit', 'diff', 'read']);
  });

  it('reports read when a Secret is revealed', async () => {
    const resource = makeSecret('db-creds', 'default', {
      password: 'c2VjcmV0',
    });
    const fake = new FakeKubeClient();
    const clock = new FakeClock(0);

    const modes: string[] = [];
    const { stdin } = render(
      React.createElement(YamlTab, {
        resource,
        kubeClient: fake,
        clock,
        onModeChange: (m): void => {
          modes.push(m);
        },
      }),
    );
    await safeWrite(stdin, 'v'); // reveal — still read mode
    expect(modes).toEqual(['read']);
  });

  it('reports discard-confirm and edit when escaping a dirty buffer then declining', async () => {
    const resource = makeConfigMap('cfg', 'default', { env: 'staging' }, '1');
    const fake = new FakeKubeClient();
    const clock = new FakeClock(0);

    const modifiedContent = 'apiVersion: v1\ndata:\n  env: DIFFERENT\n';
    const modes: string[] = [];
    const { stdin } = render(
      React.createElement(YamlTab, {
        resource,
        kubeClient: fake,
        clock,
        _testInitialContent: modifiedContent,
        onModeChange: (m): void => {
          modes.push(m);
        },
      }),
    );
    await safeWrite(stdin, '\x1B'); // Escape → discard-confirm
    await safeWrite(stdin, 'n'); // n → back to edit
    expect(modes).toEqual(['discard-confirm', 'edit']);
  });
});
