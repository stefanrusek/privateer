import { Given, Then, Before } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { render } from 'ink-testing-library';
import React from 'react';
import type { PrivateerWorld } from '../support/world.js';
import {
  PortForwardManager,
  ForwardCountIndicator,
  QuitGuardPrompt,
} from '../../src/ui/components/PortForwardManager.js';
import type {
  PortForward,
  RecentForward,
} from '../../src/portforward/types.js';

// ---------------------------------------------------------------------------
// World augmentation
// ---------------------------------------------------------------------------

declare module '../support/world.js' {
  interface PrivateerWorld {
    managerFrame: string;
    indicatorFrame: string;
    quitGuardFrame: string;
  }
}

// ---------------------------------------------------------------------------
// Reset per-scenario state
// ---------------------------------------------------------------------------

Before(function (this: PrivateerWorld) {
  this.managerFrame = '';
  this.indicatorFrame = '';
  this.quitGuardFrame = '';
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function noop(): void {
  return;
}

function renderManager(
  forwards: readonly PortForward[],
  recents: readonly RecentForward[],
): string {
  const { lastFrame } = render(
    React.createElement(PortForwardManager, {
      forwards,
      recents,
      onStop: noop,
      onRetry: noop,
      onNewForward: noop,
      onClose: noop,
    }),
  );
  return lastFrame() ?? '';
}

// ---------------------------------------------------------------------------
// Given steps — PortForwardManager
// ---------------------------------------------------------------------------

Given('a PortForwardManager with no forwards', function (this: PrivateerWorld) {
  this.managerFrame = renderManager([], []);
});

Given(
  'a PortForwardManager with a healthy forward from {string} port {int} to local {int}',
  function (
    this: PrivateerWorld,
    podName: string,
    remotePort: number,
    localPort: number,
  ) {
    const fwd: PortForward = {
      id: '1',
      podName,
      namespace: 'default',
      remotePort,
      localPort,
      status: 'active',
    };
    this.managerFrame = renderManager([fwd], []);
  },
);

Given(
  'a PortForwardManager with a starting forward from {string} port {int} to local {int}',
  function (
    this: PrivateerWorld,
    podName: string,
    remotePort: number,
    localPort: number,
  ) {
    const fwd: PortForward = {
      id: '1',
      podName,
      namespace: 'default',
      remotePort,
      localPort,
      status: 'starting',
    };
    this.managerFrame = renderManager([fwd], []);
  },
);

Given(
  'a PortForwardManager with a failed forward from {string} port {int} to local {int}',
  function (
    this: PrivateerWorld,
    podName: string,
    remotePort: number,
    localPort: number,
  ) {
    const fwd: PortForward = {
      id: '1',
      podName,
      namespace: 'default',
      remotePort,
      localPort,
      status: 'failed',
      failReason: 'pod not found',
    };
    this.managerFrame = renderManager([fwd], []);
  },
);

Given(
  'a PortForwardManager with a recent forward from {string} port {int} to local {int}',
  function (
    this: PrivateerWorld,
    podName: string,
    remotePort: number,
    localPort: number,
  ) {
    const recent: RecentForward = {
      podName,
      namespace: 'default',
      remotePort,
      localPort,
    };
    this.managerFrame = renderManager([], [recent]);
  },
);

Given(
  'a PortForwardManager with 2 healthy forwards',
  function (this: PrivateerWorld) {
    const fwd1: PortForward = {
      id: '1',
      podName: 'pod-a',
      namespace: 'default',
      remotePort: 8080,
      localPort: 8080,
      status: 'active',
    };
    const fwd2: PortForward = {
      id: '2',
      podName: 'pod-b',
      namespace: 'default',
      remotePort: 9090,
      localPort: 9090,
      status: 'active',
    };
    this.managerFrame = renderManager([fwd1, fwd2], []);
  },
);

// ---------------------------------------------------------------------------
// Given steps — ForwardCountIndicator
// ---------------------------------------------------------------------------

Given(
  'a forward count indicator with {int} active forwards',
  function (this: PrivateerWorld, count: number) {
    const { lastFrame } = render(
      React.createElement(ForwardCountIndicator, { activeCount: count }),
    );
    this.indicatorFrame = lastFrame() ?? '';
  },
);

// ---------------------------------------------------------------------------
// Given steps — QuitGuardPrompt
// ---------------------------------------------------------------------------

Given(
  'a QuitGuardPrompt with {int} active forwards',
  function (this: PrivateerWorld, count: number) {
    const { lastFrame } = render(
      React.createElement(QuitGuardPrompt, {
        activeCount: count,
        onQuit: noop,
        onCancel: noop,
      }),
    );
    this.quitGuardFrame = lastFrame() ?? '';
  },
);

Given(
  'a QuitGuardPrompt with 1 active forward',
  function (this: PrivateerWorld) {
    const { lastFrame } = render(
      React.createElement(QuitGuardPrompt, {
        activeCount: 1,
        onQuit: noop,
        onCancel: noop,
      }),
    );
    this.quitGuardFrame = lastFrame() ?? '';
  },
);

// ---------------------------------------------------------------------------
// Then steps — manager frame
// ---------------------------------------------------------------------------

Then(
  'the manager frame contains {string}',
  function (this: PrivateerWorld, text: string) {
    assert.ok(
      this.managerFrame.includes(text),
      `Expected manager frame to contain "${text}", got:\n${this.managerFrame}`,
    );
  },
);

Then(
  'the manager frame does not contain {string}',
  function (this: PrivateerWorld, text: string) {
    assert.ok(
      !this.managerFrame.includes(text),
      `Expected manager frame NOT to contain "${text}", got:\n${this.managerFrame}`,
    );
  },
);

// ---------------------------------------------------------------------------
// Then steps — indicator frame
// ---------------------------------------------------------------------------

Then(
  'the indicator frame contains {string}',
  function (this: PrivateerWorld, text: string) {
    assert.ok(
      this.indicatorFrame.includes(text),
      `Expected indicator frame to contain "${text}", got:\n${this.indicatorFrame}`,
    );
  },
);

Then(
  'the indicator frame does not contain {string}',
  function (this: PrivateerWorld, text: string) {
    assert.ok(
      !this.indicatorFrame.includes(text),
      `Expected indicator frame NOT to contain "${text}", got:\n${this.indicatorFrame}`,
    );
  },
);

// ---------------------------------------------------------------------------
// Then steps — quit guard frame
// ---------------------------------------------------------------------------

Then(
  'the quit guard frame contains {string}',
  function (this: PrivateerWorld, text: string) {
    assert.ok(
      this.quitGuardFrame.includes(text),
      `Expected quit guard frame to contain "${text}", got:\n${this.quitGuardFrame}`,
    );
  },
);

Then(
  'the quit guard frame shows {string} before {string}',
  function (this: PrivateerWorld, first: string, second: string) {
    const firstIdx = this.quitGuardFrame.indexOf(first);
    const secondIdx = this.quitGuardFrame.indexOf(second);
    assert.ok(firstIdx !== -1, `"${first}" not found in quit guard frame`);
    assert.ok(secondIdx !== -1, `"${second}" not found in quit guard frame`);
    assert.ok(
      firstIdx < secondIdx,
      `Expected "${first}" (at ${String(firstIdx)}) to appear before "${second}" (at ${String(secondIdx)}) in:\n${this.quitGuardFrame}`,
    );
  },
);
