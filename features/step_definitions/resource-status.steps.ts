import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import type { PrivateerWorld } from '../support/world.js';
import type { KubernetesObject, ResourceStatus } from '../../src/core/types.js';
import { resolveStatus } from '../../src/resources/status/index.js';

/**
 * Step definitions for features/03-resources/status-resolution.feature.
 *
 * We compose the resolver functions directly (no I/O, pure data) rather than
 * driving the full TUI. This follows Spec 08 §3.3: step definitions are thin
 * and drive real app logic.
 */

declare module '../support/world.js' {
  interface PrivateerWorld {
    rawObject: KubernetesObject;
    resolvedStatus: ResourceStatus;
  }
}

// ---------------------------------------------------------------------------
// Given steps — build a raw KubernetesObject
//
// NOTE: The Examples table values are unquoted JSON, so we use regex steps
// to capture the trailing JSON text rather than Cucumber's {string} parameter
// (which requires the value to be wrapped in quotes).
// ---------------------------------------------------------------------------

Given(
  /^a raw Kubernetes object of kind "([^"]+)" with status data (.+)$/,
  function (this: PrivateerWorld, kind: string, dataJson: string) {
    const statusData = JSON.parse(dataJson) as Record<string, unknown>;
    this.rawObject = { kind, status: statusData };
  },
);

Given(
  /^a raw Kubernetes object of kind "([^"]+)" with spec data (.+) and status data (.+)$/,
  function (
    this: PrivateerWorld,
    kind: string,
    specJson: string,
    statusJson: string,
  ) {
    const spec = JSON.parse(specJson) as Record<string, unknown>;
    const status = JSON.parse(statusJson) as Record<string, unknown>;
    this.rawObject = { kind, spec, status };
  },
);

// ---------------------------------------------------------------------------
// When steps — invoke the resolver
// ---------------------------------------------------------------------------

When('I resolve its status', function (this: PrivateerWorld) {
  const raw = this.rawObject;
  const kind = typeof raw.kind === 'string' ? raw.kind : '';
  this.resolvedStatus = resolveStatus(kind, raw);
});

// ---------------------------------------------------------------------------
// Then steps — assert on the result
// ---------------------------------------------------------------------------

Then(
  'the status color is {string} and label is {string}',
  function (this: PrivateerWorld, color: string, label: string) {
    assert.strictEqual(this.resolvedStatus.color, color);
    assert.strictEqual(this.resolvedStatus.label, label);
  },
);
