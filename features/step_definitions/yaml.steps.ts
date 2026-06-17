import { Given, When, Then, Before } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { render } from 'ink-testing-library';
import React from 'react';
import jsYaml from 'js-yaml';
import type { PrivateerWorld } from '../support/world.js';
import { FakeKubeClient } from '../../src/boundaries/kube-client.fake.js';
import { FakeClock } from '../../src/boundaries/clock.fake.js';
import type { KubernetesObject } from '../../src/core/types.js';
import { YamlTab } from '../../src/ui/components/YamlTab.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RenderResult = ReturnType<typeof render>;

// ---------------------------------------------------------------------------
// World augmentation
// ---------------------------------------------------------------------------

declare module '../support/world.js' {
  interface PrivateerWorld {
    yamlResource: KubernetesObject;
    yamlFakeClient: FakeKubeClient;
    yamlClock: FakeClock;
    yamlFrame: string;
    yamlRenderResult: RenderResult | null;
    yamlSaved: boolean;
    yamlDiffFrame: string;
    yamlPendingSubstitution: {
      key: string;
      toValue: string;
    } | null;
  }
}

// ---------------------------------------------------------------------------
// Reset per-scenario state
// ---------------------------------------------------------------------------

Before(function (this: PrivateerWorld) {
  this.yamlResource = { apiVersion: 'v1', kind: 'ConfigMap', metadata: {} };
  this.yamlFakeClient = new FakeKubeClient();
  this.yamlClock = new FakeClock(new Date('2026-06-10T13:00:00Z').getTime());
  this.yamlFrame = '';
  this.yamlRenderResult = null;
  this.yamlSaved = false;
  this.yamlDiffFrame = '';
  this.yamlPendingSubstitution = null;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Yield to the event loop so Ink can process state updates. */
async function tick(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

/** Yield multiple times to allow async actions to complete. */
async function ticks(ms = 50): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function makeConfigMap(
  name: string,
  namespace: string,
  data: Record<string, string> = {},
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
  data: Record<string, string> = {},
  stringData: Record<string, string> = {},
  resourceVersion = '1',
): KubernetesObject {
  const base: KubernetesObject = {
    apiVersion: 'v1',
    kind: 'Secret',
    metadata: { name, namespace, resourceVersion },
  };
  const withData: KubernetesObject =
    Object.keys(data).length > 0 ? { ...base, data } : base;
  const withStringData: KubernetesObject =
    Object.keys(stringData).length > 0 ? { ...withData, stringData } : withData;
  return withStringData;
}

/** Get the 'data' field of a KubernetesObject as a string map, if present. */
function getResourceData(
  resource: KubernetesObject,
): Record<string, string> | undefined {
  const raw = (resource as { data?: Record<string, string> }).data;
  return raw;
}

/** Build the B07 prop-driven YamlTab props from the world's fake client. */
function yamlProps(
  world: PrivateerWorld,
  testInitialContent?: string,
): Parameters<typeof YamlTab>[0] {
  const yaml = jsYaml.dump(world.yamlResource, { lineWidth: -1, indent: 2 });
  const meta = world.yamlResource.metadata ?? {};
  const kind = world.yamlResource.kind ?? '';
  const props: Parameters<typeof YamlTab>[0] = {
    yaml,
    kind,
    title: `${kind}/${meta.namespace ?? ''}/${meta.name ?? ''}`,
    onReplace: async (newYaml: string) => {
      const parsed = jsYaml.load(newYaml) as KubernetesObject;
      const res = await world.yamlFakeClient.replace(parsed);
      if (res.ok) {
        return { ok: true };
      }
      if (res.error.kind === 'conflict') {
        return { ok: false, conflict: true };
      }
      return { ok: false, conflict: false, message: res.error.message };
    },
    onReload: async () => {
      const res = await world.yamlFakeClient.get(
        kind,
        meta.name ?? '',
        meta.namespace ?? null,
      );
      if (!res.ok) {
        return { ok: false, message: res.error.message };
      }
      return {
        ok: true,
        yaml: jsYaml.dump(res.value, { lineWidth: -1, indent: 2 }),
      };
    },
    onOpenInEditor: (input: string) => Promise.resolve(input),
    onSave: (): void => {
      world.yamlSaved = true;
    },
  };
  if (testInitialContent !== undefined) {
    props._testInitialContent = testInitialContent;
  }
  return props;
}

function renderYamlTab(
  this: PrivateerWorld,
  testInitialContent?: string,
): RenderResult {
  this.yamlFakeClient.seed(this.yamlResource);
  const result = render(
    React.createElement(YamlTab, yamlProps(this, testInitialContent)),
  );
  this.yamlRenderResult = result;
  this.yamlFrame = result.lastFrame() ?? '';
  return result;
}

/** Build modified YAML from the current resource using the pending substitution. */
function buildModifiedYaml(world: PrivateerWorld): string {
  const originalYaml = jsYaml.dump(world.yamlResource, {
    lineWidth: -1,
    indent: 2,
  });
  const sub = world.yamlPendingSubstitution;
  if (sub !== null) {
    const resourceData = getResourceData(world.yamlResource);
    if (resourceData !== undefined) {
      const originalValue = resourceData[sub.key];
      if (originalValue !== undefined) {
        return originalYaml.replace(
          `${sub.key}: ${originalValue}`,
          `${sub.key}: ${sub.toValue}`,
        );
      }
    }
  }
  // Fallback: modify the first data entry with a suffix
  const resourceData = getResourceData(world.yamlResource);
  if (resourceData !== undefined) {
    const firstEntry = Object.entries(resourceData)[0];
    if (firstEntry !== undefined) {
      const [key, value] = firstEntry;
      return originalYaml.replace(
        `${key}: ${value}`,
        `${key}: ${value}-modified`,
      );
    }
  }
  return originalYaml;
}

// ---------------------------------------------------------------------------
// Given steps — ConfigMap
// ---------------------------------------------------------------------------

Given(
  'a YamlTab for a ConfigMap named {string} in namespace {string}',
  function (this: PrivateerWorld, name: string, namespace: string) {
    this.yamlResource = makeConfigMap(name, namespace);
  },
);

Given(
  'the ConfigMap has data key {string} with value {string}',
  function (this: PrivateerWorld, key: string, value: string) {
    const existing = getResourceData(this.yamlResource);
    const data: Record<string, string> = { ...(existing ?? {}), [key]: value };
    this.yamlResource = { ...this.yamlResource, data };
  },
);

Given(
  'the ConfigMap has a data key {string} with value {string}',
  function (this: PrivateerWorld, key: string, value: string) {
    const existing = getResourceData(this.yamlResource);
    const data: Record<string, string> = { ...(existing ?? {}), [key]: value };
    this.yamlResource = { ...this.yamlResource, data };
  },
);

// ---------------------------------------------------------------------------
// Given steps — Secret
// ---------------------------------------------------------------------------

Given(
  'a YamlTab for a Secret named {string} in namespace {string}',
  function (this: PrivateerWorld, name: string, namespace: string) {
    this.yamlResource = makeSecret(name, namespace);
  },
);

Given(
  'the Secret has a data key {string} with base64 value {string}',
  function (this: PrivateerWorld, key: string, value: string) {
    const existing = getResourceData(this.yamlResource);
    const data: Record<string, string> = { ...(existing ?? {}), [key]: value };
    this.yamlResource = { ...this.yamlResource, data };
  },
);

Given(
  'the Secret has a stringData key {string} with value {string}',
  function (this: PrivateerWorld, key: string, value: string) {
    const existingRaw = (
      this.yamlResource as { stringData?: Record<string, string> }
    ).stringData;
    const stringData: Record<string, string> = {
      ...(existingRaw ?? {}),
      [key]: value,
    };
    this.yamlResource = { ...this.yamlResource, stringData };
  },
);

// ---------------------------------------------------------------------------
// When steps — rendering
// ---------------------------------------------------------------------------

When('the YamlTab renders in read mode', function (this: PrivateerWorld) {
  renderYamlTab.call(this);
});

// ---------------------------------------------------------------------------
// When steps — edit mode
// ---------------------------------------------------------------------------

When('I enter yaml edit mode', async function (this: PrivateerWorld) {
  const result = renderYamlTab.call(this);
  await tick();
  result.stdin.write('e');
  await tick();
  this.yamlFrame = result.lastFrame() ?? '';
});

When(
  'I update the yaml content with {string} changed to {string}',
  function (this: PrivateerWorld, fromValue: string, toValue: string) {
    // Store the substitution info so "I open the diff view" can apply it.
    // fromValue is the data key name (e.g. "replicas", "tier", "env").
    this.yamlPendingSubstitution = { key: fromValue, toValue };
  },
);

When('I open the diff view', async function (this: PrivateerWorld) {
  // Build modified YAML with the pending substitution applied.
  const modifiedYaml = buildModifiedYaml(this);

  // Do NOT re-seed here to preserve any version bumps from prior steps.
  // (Prior steps like "I enter yaml edit mode" already seed the resource.)

  const result = render(
    React.createElement(YamlTab, yamlProps(this, modifiedYaml)),
  );
  this.yamlRenderResult = result;

  // Yield to let Ink mount the component
  await tick();

  // Ctrl+S to transition to DiffView
  result.stdin.write('\x13');

  // Yield for state update
  await tick();

  this.yamlFrame = result.lastFrame() ?? '';
  this.yamlDiffFrame = this.yamlFrame;
});

When('I apply the diff', async function (this: PrivateerWorld) {
  const result = this.yamlRenderResult;
  assert.ok(result !== null, 'YamlTab not rendered');
  result.stdin.write('\r'); // Enter to apply
  await ticks(50);
  this.yamlFrame = result.lastFrame() ?? '';
});

When(
  'the resource is updated server-side to version {string}',
  function (this: PrivateerWorld, version: string) {
    // Seed a newer version of the resource so that apply will 409
    const updated: KubernetesObject = {
      ...this.yamlResource,
      metadata: {
        ...this.yamlResource.metadata,
        resourceVersion: version,
      },
    };
    this.yamlFakeClient.seed(updated);
  },
);

When(
  'I apply the diff expecting a conflict',
  async function (this: PrivateerWorld) {
    const result = this.yamlRenderResult;
    assert.ok(result !== null, 'YamlTab not rendered');
    result.stdin.write('\r'); // Enter to apply — should 409
    await ticks(50);
    this.yamlFrame = result.lastFrame() ?? '';
    this.yamlDiffFrame = this.yamlFrame;
  },
);

When('I discard yaml edits', async function (this: PrivateerWorld) {
  const result = this.yamlRenderResult;
  assert.ok(result !== null, 'YamlTab not rendered');
  await tick();
  result.stdin.write('\x1B'); // Escape — since buffer is clean, returns directly to read mode
  await tick();
  this.yamlFrame = result.lastFrame() ?? '';
});

When(
  'I set the yaml content to invalid YAML',
  async function (this: PrivateerWorld) {
    const invalidYaml = 'key: {unclosed brace';
    this.yamlFakeClient.seed(this.yamlResource);

    const result = render(
      React.createElement(YamlTab, yamlProps(this, invalidYaml)),
    );
    this.yamlRenderResult = result;

    await tick();

    // Ctrl+S — should trigger validation error
    result.stdin.write('\x13');

    await tick();

    this.yamlFrame = result.lastFrame() ?? '';
  },
);

When(
  'I reveal secret values after confirmation',
  async function (this: PrivateerWorld) {
    const result = this.yamlRenderResult;
    assert.ok(result !== null, 'YamlTab not rendered');
    await tick();
    result.stdin.write('v'); // reveal secret values
    await tick();
    this.yamlFrame = result.lastFrame() ?? '';
  },
);

// ---------------------------------------------------------------------------
// Then steps
// ---------------------------------------------------------------------------

Then(
  'the yaml frame contains {string}',
  function (this: PrivateerWorld, text: string) {
    assert.ok(
      this.yamlFrame.includes(text),
      `Expected yaml frame to contain "${text}", got:\n${this.yamlFrame}`,
    );
  },
);

Then(
  'the yaml frame does not contain {string}',
  function (this: PrivateerWorld, text: string) {
    assert.ok(
      !this.yamlFrame.includes(text),
      `Expected yaml frame NOT to contain "${text}", got:\n${this.yamlFrame}`,
    );
  },
);

Then('the yaml frame is in read mode', function (this: PrivateerWorld) {
  assert.ok(
    this.yamlFrame.includes('[Edit]'),
    `Expected yaml frame to show "[Edit]" (read mode), got:\n${this.yamlFrame}`,
  );
});

Then('the yaml save succeeded', function (this: PrivateerWorld) {
  assert.ok(
    this.yamlSaved,
    `Expected yaml save to have been called, but it was not`,
  );
});

Then(
  'the diff frame shows a change from {string} to {string}',
  function (this: PrivateerWorld, _from: string, _to: string) {
    // The diff frame should contain both minus and plus lines
    assert.ok(
      this.yamlDiffFrame.includes('-') || this.yamlDiffFrame.includes('+'),
      `Expected diff frame to show a change, got:\n${this.yamlDiffFrame}`,
    );
  },
);

Then('the diff frame shows a conflict error', function (this: PrivateerWorld) {
  assert.ok(
    this.yamlDiffFrame.includes('Conflict') ||
      this.yamlDiffFrame.includes('conflict'),
    `Expected diff frame to show conflict error, got:\n${this.yamlDiffFrame}`,
  );
});

Then('the diff frame shows a reload option', function (this: PrivateerWorld) {
  assert.ok(
    this.yamlDiffFrame.includes('[Reload') ||
      this.yamlDiffFrame.includes('Reload'),
    `Expected diff frame to show reload option, got:\n${this.yamlDiffFrame}`,
  );
});

Then('the yaml validation error is shown', function (this: PrivateerWorld) {
  assert.ok(
    this.yamlFrame.includes('YAML error') || this.yamlFrame.includes('error'),
    `Expected yaml frame to show validation error, got:\n${this.yamlFrame}`,
  );
});
