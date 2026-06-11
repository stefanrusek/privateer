import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { DiffView } from './DiffView.js';
import { FakeKubeClient } from '../../boundaries/kube-client.fake.js';
import type { KubernetesObject } from '../../core/types.js';

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

/** Make a cluster-scoped resource (no namespace). */
function makeClusterResource(
  kind: string,
  name: string,
  resourceVersion = '1',
): KubernetesObject {
  return {
    apiVersion: 'v1',
    kind,
    metadata: { name, resourceVersion },
  };
}

function noop(): void {
  return;
}

// ---------------------------------------------------------------------------
// Tests — Rendering
// ---------------------------------------------------------------------------

describe('DiffView rendering', () => {
  it('renders the resource name in the header', () => {
    const original = makeConfigMap('my-cfg', 'default', { key: 'old' });
    const modified = makeConfigMap('my-cfg', 'default', { key: 'new' });
    const fake = new FakeKubeClient();
    fake.seed(original);

    const { lastFrame } = render(
      React.createElement(DiffView, {
        original,
        modified,
        editedYaml: '',
        kubeClient: fake,
        onApplied: noop,
        onCancel: noop,
        onReloadAndRedit: noop,
      }),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('my-cfg');
  });

  it('renders cluster-scoped resource (no namespace) in header', () => {
    const original = makeClusterResource('Node', 'node-1');
    const modified = makeClusterResource('Node', 'node-1');
    const fake = new FakeKubeClient();
    fake.seed(original);

    const { lastFrame } = render(
      React.createElement(DiffView, {
        original,
        modified,
        editedYaml: '',
        kubeClient: fake,
        onApplied: noop,
        onCancel: noop,
        onReloadAndRedit: noop,
      }),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('node-1');
  });

  it('renders resource with no kind (covers ?? fallbacks)', () => {
    // Resource with no kind and no metadata (covers the ?? '' fallbacks)
    const original: KubernetesObject = { apiVersion: 'v1' };
    const modified: KubernetesObject = {
      apiVersion: 'v1',
      data: { added: 'value' },
    };
    const fake = new FakeKubeClient();

    const { lastFrame } = render(
      React.createElement(DiffView, {
        original,
        modified,
        editedYaml: '',
        kubeClient: fake,
        onApplied: noop,
        onCancel: noop,
        onReloadAndRedit: noop,
      }),
    );
    // Should render without crashing
    const frame = lastFrame() ?? '';
    expect(frame).toContain('[Apply]');
  });

  it('renders [Apply] and [Cancel] buttons in ready state', () => {
    const original = makeConfigMap('my-cfg', 'default', { key: 'old' });
    const modified = makeConfigMap('my-cfg', 'default', { key: 'new' });
    const fake = new FakeKubeClient();
    fake.seed(original);

    const { lastFrame } = render(
      React.createElement(DiffView, {
        original,
        modified,
        editedYaml: '',
        kubeClient: fake,
        onApplied: noop,
        onCancel: noop,
        onReloadAndRedit: noop,
      }),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('[Apply]');
    expect(frame).toContain('[Cancel]');
  });

  it('shows diff with added lines for new fields', () => {
    const original = makeConfigMap('cfg', 'default', {});
    const modified = makeConfigMap('cfg', 'default', { newKey: 'newValue' });
    const fake = new FakeKubeClient();
    fake.seed(original);

    const { lastFrame } = render(
      React.createElement(DiffView, {
        original,
        modified,
        editedYaml: '',
        kubeClient: fake,
        onApplied: noop,
        onCancel: noop,
        onReloadAndRedit: noop,
      }),
    );
    const frame = lastFrame() ?? '';
    // Should show a '+' line for the added content
    expect(frame).toContain('+');
  });

  it('renders collapsed unchanged lines correctly', () => {
    // Create a large diff with many unchanged lines
    const baseData: Record<string, string> = {};
    for (let i = 0; i < 20; i++) {
      baseData[`key${String(i)}`] = `value${String(i)}`;
    }
    const original = makeConfigMap('big-cfg', 'default', baseData);
    const modifiedData = { ...baseData, key10: 'CHANGED' };
    const modified = makeConfigMap('big-cfg', 'default', modifiedData);
    const fake = new FakeKubeClient();
    fake.seed(original);

    const { lastFrame } = render(
      React.createElement(DiffView, {
        original,
        modified,
        editedYaml: '',
        kubeClient: fake,
        onApplied: noop,
        onCancel: noop,
        onReloadAndRedit: noop,
      }),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('unchanged lines');
  });
});

// ---------------------------------------------------------------------------
// Tests — Apply flow (keyboard Enter)
// ---------------------------------------------------------------------------

describe('DiffView apply flow', () => {
  it('calls onApplied after successful replace via Enter key', async () => {
    const original = makeConfigMap('cfg', 'default', { env: 'staging' }, '1');
    const modified = makeConfigMap('cfg', 'default', { env: 'prod' }, '1');
    const fake = new FakeKubeClient();
    fake.seed(original);

    let applied = false;
    const onApplied = (): void => {
      applied = true;
    };

    const { stdin } = render(
      React.createElement(DiffView, {
        original,
        modified,
        editedYaml: '',
        kubeClient: fake,
        onApplied,
        onCancel: noop,
        onReloadAndRedit: noop,
      }),
    );

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    stdin.write('\r'); // Enter key
    // Wait for async apply to complete
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });
    expect(applied).toBe(true);
  });

  it('shows [Applying…] while apply is in progress', async () => {
    // Use a client that hangs forever so we can observe the applying state
    type ReplaceResult = Awaited<ReturnType<FakeKubeClient['replace']>>;
    let resolveReplace: ((v: ReplaceResult) => void) | undefined;

    class HangingKubeClient extends FakeKubeClient {
      override replace(
        _object: Parameters<FakeKubeClient['replace']>[0],
      ): Promise<ReplaceResult> {
        return new Promise((res) => {
          resolveReplace = res;
        });
      }
    }

    const customClient = new HangingKubeClient();

    const original = makeConfigMap('cfg', 'default', { env: 'staging' }, '1');
    const modified = makeConfigMap('cfg', 'default', { env: 'prod' }, '1');

    const { lastFrame, stdin } = render(
      React.createElement(DiffView, {
        original,
        modified,
        editedYaml: '',
        kubeClient: customClient,
        onApplied: noop,
        onCancel: noop,
        onReloadAndRedit: noop,
      }),
    );

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    stdin.write('\r'); // Enter to apply
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(lastFrame()).toContain('[Applying');
    // Press a key while applying — should be ignored (applying guard)
    stdin.write('\x1B'); // Escape while applying — should be ignored
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    // Still in applying state (key was ignored)
    expect(lastFrame()).toContain('[Applying');
    // Resolve to clean up
    if (resolveReplace !== undefined) {
      resolveReplace({
        ok: false,
        error: { kind: 'notFound', message: 'gone', statusCode: 404 },
      });
    }
  });

  it('shows conflict state after 409', async () => {
    const original = makeConfigMap('cfg', 'default', { env: 'staging' }, '1');
    const staleModified = makeConfigMap('cfg', 'default', { env: 'prod' }, '1');

    const fake = new FakeKubeClient();
    fake.seed(original);

    // Advance the server version so a conflict occurs
    const serverUpdated = makeConfigMap(
      'cfg',
      'default',
      { env: 'updated' },
      '1',
    );
    await fake.replace(serverUpdated); // bumps to version 2

    const { lastFrame, stdin } = render(
      React.createElement(DiffView, {
        original,
        modified: staleModified, // stale resourceVersion=1 vs server=2
        editedYaml: '',
        kubeClient: fake,
        onApplied: noop,
        onCancel: noop,
        onReloadAndRedit: noop,
      }),
    );

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    stdin.write('\r'); // Enter to apply — should 409
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Conflict');
    expect(frame).toContain('[Reload');
    expect(frame).toContain('[Discard]');
  });

  it('shows error state after non-conflict failure', async () => {
    const original = makeConfigMap('cfg', 'default', { env: 'staging' }, '1');
    const modified = makeConfigMap('cfg', 'default', { env: 'prod' }, '1');

    // Don't seed the resource so replace() returns notFound (a non-conflict error)
    const fake = new FakeKubeClient();

    const { lastFrame, stdin } = render(
      React.createElement(DiffView, {
        original,
        modified,
        editedYaml: '',
        kubeClient: fake,
        onApplied: noop,
        onCancel: noop,
        onReloadAndRedit: noop,
      }),
    );

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    stdin.write('\r'); // Enter to apply — should return notFound error
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });
    // Should show error message (not found)
    const frame = lastFrame() ?? '';
    expect(frame).toContain('not found');
  });
});

// ---------------------------------------------------------------------------
// Tests — Cancel flow (keyboard Escape)
// ---------------------------------------------------------------------------

describe('DiffView cancel flow', () => {
  it('calls onCancel when Escape is pressed in ready state', async () => {
    const original = makeConfigMap('cfg', 'default', { env: 'staging' });
    const modified = makeConfigMap('cfg', 'default', { env: 'prod' });
    const fake = new FakeKubeClient();
    fake.seed(original);

    let cancelled = false;
    const onCancel = (): void => {
      cancelled = true;
    };

    const { stdin } = render(
      React.createElement(DiffView, {
        original,
        modified,
        editedYaml: '',
        kubeClient: fake,
        onApplied: noop,
        onCancel,
        onReloadAndRedit: noop,
      }),
    );

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    stdin.write('\x1B'); // Escape
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(cancelled).toBe(true);
  });

  it('calls onCancel when Discard pressed after conflict (Escape key)', async () => {
    const original = makeConfigMap('cfg', 'default', { env: 'staging' }, '1');
    const staleModified = makeConfigMap('cfg', 'default', { env: 'prod' }, '1');

    const fake = new FakeKubeClient();
    fake.seed(original);
    const serverUpdated = makeConfigMap(
      'cfg',
      'default',
      { env: 'updated' },
      '1',
    );
    await fake.replace(serverUpdated); // bumps to version 2

    let cancelled = false;
    const onCancel = (): void => {
      cancelled = true;
    };

    const { stdin } = render(
      React.createElement(DiffView, {
        original,
        modified: staleModified,
        editedYaml: '',
        kubeClient: fake,
        onApplied: noop,
        onCancel,
        onReloadAndRedit: noop,
      }),
    );

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    stdin.write('\r'); // Enter to apply — 409
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });
    stdin.write('\x1B'); // Escape → Discard in conflict state
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(cancelled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests — Reload & re-edit flow
// ---------------------------------------------------------------------------

describe('DiffView reload and re-edit', () => {
  it('calls onReloadAndRedit with fresh resource when r is pressed after conflict', async () => {
    const original = makeConfigMap('cfg', 'default', { env: 'staging' }, '1');
    const staleModified = makeConfigMap('cfg', 'default', { env: 'prod' }, '1');
    const fresh = makeConfigMap('cfg', 'default', { env: 'updated' }, '2');

    const fake = new FakeKubeClient();
    // Seed the original at version 1, then seed the fresh version directly
    // so that get() returns version 2 but replace() with version 1 conflicts
    fake.seed(original); // stores version 1
    // Update the server version by seeding the fresh resource directly
    // (bypassing the conflict check that replace() would do)
    fake.seed(fresh); // stores version 2, making staleModified (version 1) stale

    let reloadedResource: KubernetesObject | null = null;
    const onReloadAndRedit = (res: KubernetesObject): void => {
      reloadedResource = res;
    };

    const { stdin } = render(
      React.createElement(DiffView, {
        original,
        modified: staleModified,
        editedYaml: '',
        kubeClient: fake,
        onApplied: noop,
        onCancel: noop,
        onReloadAndRedit,
      }),
    );

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    stdin.write('\r'); // Enter to apply — 409 conflict (stale version 1 vs server version 2)
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });
    stdin.write('r'); // r to reload-and-redit
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });
    expect(reloadedResource).not.toBeNull();
    const rr = reloadedResource as unknown as KubernetesObject;
    expect(rr.metadata?.resourceVersion).toBe('2');
  });

  it('handles reload when resource has no kind or name (covers ?? fallbacks)', async () => {
    // Resource with no kind/metadata — covers the original.kind ?? '' and metadata?.name ?? '' branches
    const original: KubernetesObject = {
      apiVersion: 'v1',
      metadata: { resourceVersion: '1' },
    };
    const staleModified: KubernetesObject = {
      apiVersion: 'v1',
      metadata: { resourceVersion: '1' },
    };
    const serverVersion: KubernetesObject = {
      apiVersion: 'v1',
      metadata: { resourceVersion: '2' },
    };

    const fake = new FakeKubeClient();
    fake.seed(original);
    fake.seed(serverVersion); // bump server version

    const { stdin } = render(
      React.createElement(DiffView, {
        original,
        modified: staleModified,
        editedYaml: '',
        kubeClient: fake,
        onApplied: noop,
        onCancel: noop,
        onReloadAndRedit: noop,
      }),
    );

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    stdin.write('\r'); // Enter to apply — 409 conflict
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });
    stdin.write('r'); // r to reload — will call get('', '', null) — notFound
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });
    // Doesn't crash — the ?? '' fallbacks were exercised
  });

  it('shows error when reload fails', async () => {
    const original = makeConfigMap('cfg', 'default', { env: 'staging' }, '1');
    const staleModified = makeConfigMap('cfg', 'default', { env: 'prod' }, '1');

    // Force the conflict first via version mismatch, then forbid get
    const fake = new FakeKubeClient();
    fake.seed(original);
    const serverUpdated = makeConfigMap(
      'cfg',
      'default',
      { env: 'updated' },
      '1',
    );
    await fake.replace(serverUpdated); // bumps to v2

    // Now forbid get so reload fails
    fake.forbid('ConfigMap');

    const { lastFrame, stdin } = render(
      React.createElement(DiffView, {
        original,
        modified: staleModified,
        editedYaml: '',
        kubeClient: fake,
        onApplied: noop,
        onCancel: noop,
        onReloadAndRedit: noop,
      }),
    );

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    stdin.write('\r'); // Enter to apply — 409 conflict
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });
    stdin.write('r'); // r to reload — should fail with forbidden
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });
    const frame = lastFrame() ?? '';
    expect(frame).toContain('forbidden');
  });
});

// ---------------------------------------------------------------------------
// Tests — FakeKubeClient behaviors (underlying logic tests)
// ---------------------------------------------------------------------------

describe('FakeKubeClient conflict behavior', () => {
  it('returns conflict on stale resourceVersion', async () => {
    const original = makeConfigMap('cfg', 'default', { env: 'staging' }, '1');
    const staleModified = makeConfigMap('cfg', 'default', { env: 'prod' }, '1');

    const fake = new FakeKubeClient();
    fake.seed(original);

    // Advance the server version first
    const serverUpdated = makeConfigMap(
      'cfg',
      'default',
      { env: 'updated' },
      '1',
    );
    await fake.replace(serverUpdated); // version bumps to 2

    // Now replace with stale version 1 should 409
    const conflictResult = await fake.replace(staleModified);
    expect(conflictResult.ok).toBe(false);
    if (!conflictResult.ok) {
      expect(conflictResult.error.kind).toBe('conflict');
    }
  });

  it('returns fresh resource on get', async () => {
    const original = makeConfigMap('cfg', 'default', { env: 'staging' }, '1');
    const fresh = makeConfigMap('cfg', 'default', { env: 'updated' }, '2');

    const fake = new FakeKubeClient();
    fake.seed(fresh); // seed with updated version

    const getResult = await fake.get('ConfigMap', 'cfg', 'default');
    expect(getResult.ok).toBe(true);
    if (getResult.ok) {
      expect(getResult.value.metadata?.resourceVersion).toBe('2');
    }
    void original; // used in test setup
  });
});
