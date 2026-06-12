import { Given, When, Then, Before } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { render } from 'ink-testing-library';
import React from 'react';
import type { PrivateerWorld } from '../support/world.js';
import { FakeKubeClient } from '../../src/boundaries/kube-client.fake.js';
import { FakeClock } from '../../src/boundaries/clock.fake.js';
import type { KubernetesObject } from '../../src/core/types.js';
import { EventsTab } from '../../src/ui/components/EventsTab.js';
import { useEventsFetcher } from '../../src/ui/components/EventsTab.js';

// ---------------------------------------------------------------------------
// World augmentation
// ---------------------------------------------------------------------------

declare module '../support/world.js' {
  interface PrivateerWorld {
    eventsFrame: string;
    eventsFakeClient: FakeKubeClient;
    eventsClock: FakeClock;
    eventsShowAll: boolean;
    eventsResourceName: string;
    eventsResourceKind: string;
    eventsNamespace: string;
    eventsRawEvents: KubernetesObject[];
  }
}

// ---------------------------------------------------------------------------
// Reset per-scenario state
// ---------------------------------------------------------------------------

Before(function (this: PrivateerWorld) {
  this.eventsFrame = '';
  this.eventsRawEvents = [];
  this.eventsClock = new FakeClock(new Date('2026-06-10T13:00:00Z').getTime());
  this.eventsFakeClient = new FakeKubeClient({
    events: [],
    clock: () => this.eventsClock.now(),
  });
  this.eventsShowAll = false;
  this.eventsResourceName = '';
  this.eventsResourceKind = 'Pod';
  this.eventsNamespace = 'default';
});

// ---------------------------------------------------------------------------
// Helper to build a raw k8s Event object
// ---------------------------------------------------------------------------

function makeEvent(
  type: 'Warning' | 'Normal',
  reason: string,
  message: string,
  lastTimestamp: string,
  count: number,
): KubernetesObject {
  return {
    apiVersion: 'v1',
    kind: 'Event',
    metadata: { name: `event-${reason}`, namespace: 'default' },
    type,
    reason,
    message,
    lastTimestamp,
    count,
    involvedObject: {
      kind: 'Pod',
      name: 'order-api',
      namespace: 'default',
    },
  };
}

// ---------------------------------------------------------------------------
// Given steps
// ---------------------------------------------------------------------------

Given(
  'an EventsTab for pod {string} in namespace {string}',
  function (this: PrivateerWorld, name: string, ns: string) {
    this.eventsResourceName = name;
    this.eventsResourceKind = 'Pod';
    this.eventsNamespace = ns;
  },
);

Given(
  'the fake client has a Warning event with reason {string} and message {string}',
  function (this: PrivateerWorld, reason: string, message: string) {
    this.eventsRawEvents.push(
      makeEvent('Warning', reason, message, '2026-06-10T12:00:00Z', 1),
    );
    this.eventsFakeClient = new FakeKubeClient({
      events: this.eventsRawEvents,
      clock: () => this.eventsClock.now(),
    });
  },
);

Given(
  'the fake client has a Normal event with reason {string} and message {string}',
  function (this: PrivateerWorld, reason: string, message: string) {
    this.eventsRawEvents.push(
      makeEvent('Normal', reason, message, '2026-06-10T12:00:00Z', 1),
    );
    this.eventsFakeClient = new FakeKubeClient({
      events: this.eventsRawEvents,
      clock: () => this.eventsClock.now(),
    });
  },
);

Given('the fake client has 3 Warning events', function (this: PrivateerWorld) {
  this.eventsRawEvents = [
    makeEvent('Warning', 'BackOff', 'msg1', '2026-06-10T12:00:00Z', 1),
    makeEvent('Warning', 'OOMKilled', 'msg2', '2026-06-10T11:00:00Z', 2),
    makeEvent('Warning', 'FailedScheduling', 'msg3', '2026-06-10T10:00:00Z', 3),
  ];
  this.eventsFakeClient = new FakeKubeClient({
    events: this.eventsRawEvents,
    clock: () => this.eventsClock.now(),
  });
});

Given('the fake client has no events', function (this: PrivateerWorld) {
  this.eventsRawEvents = [];
  this.eventsFakeClient = new FakeKubeClient({
    events: [],
    clock: () => this.eventsClock.now(),
  });
});

Given(
  'the fake client has a Warning event with reason {string} at time {string}',
  function (this: PrivateerWorld, reason: string, timestamp: string) {
    this.eventsRawEvents.push(
      makeEvent('Warning', reason, 'test message', timestamp, 1),
    );
    this.eventsFakeClient = new FakeKubeClient({
      events: this.eventsRawEvents,
      clock: () => this.eventsClock.now(),
    });
  },
);

Given(
  'the fake client has a Warning event with reason {string} count {int} and message {string}',
  function (
    this: PrivateerWorld,
    reason: string,
    count: number,
    message: string,
  ) {
    this.eventsRawEvents.push(
      makeEvent('Warning', reason, message, '2026-06-10T12:00:00Z', count),
    );
    this.eventsFakeClient = new FakeKubeClient({
      events: this.eventsRawEvents,
      clock: () => this.eventsClock.now(),
    });
  },
);

// ---------------------------------------------------------------------------
// When steps
// ---------------------------------------------------------------------------

When('the EventsTab loads', async function (this: PrivateerWorld) {
  const result = await useEventsFetcher({
    kubeClient: this.eventsFakeClient,
    resourceName: this.eventsResourceName,
    resourceKind: this.eventsResourceKind,
    namespace: this.eventsNamespace,
    showAll: this.eventsShowAll,
    nowMs: this.eventsClock.now(),
  });

  const { lastFrame } = render(
    React.createElement(EventsTab, {
      events: result.events,
      warningCount: result.warningCount,
      showAll: this.eventsShowAll,
      onToggleShowAll: () => {
        this.eventsShowAll = !this.eventsShowAll;
      },
      nowMs: this.eventsClock.now(),
    }),
  );
  this.eventsFrame = lastFrame() ?? '';
});

When('I toggle to show all events', async function (this: PrivateerWorld) {
  this.eventsShowAll = true;

  const result = await useEventsFetcher({
    kubeClient: this.eventsFakeClient,
    resourceName: this.eventsResourceName,
    resourceKind: this.eventsResourceKind,
    namespace: this.eventsNamespace,
    showAll: this.eventsShowAll,
    nowMs: this.eventsClock.now(),
  });

  const { lastFrame } = render(
    React.createElement(EventsTab, {
      events: result.events,
      warningCount: result.warningCount,
      showAll: this.eventsShowAll,
      onToggleShowAll: () => {
        this.eventsShowAll = !this.eventsShowAll;
      },
      nowMs: this.eventsClock.now(),
    }),
  );
  this.eventsFrame = lastFrame() ?? '';
});

// ---------------------------------------------------------------------------
// Then steps
// ---------------------------------------------------------------------------

Then(
  'the events frame contains {string}',
  function (this: PrivateerWorld, text: string) {
    assert.ok(
      this.eventsFrame.includes(text),
      `Expected events frame to contain "${text}", got:\n${this.eventsFrame}`,
    );
  },
);

Then(
  'the events frame does not contain {string}',
  function (this: PrivateerWorld, text: string) {
    assert.ok(
      !this.eventsFrame.includes(text),
      `Expected events frame NOT to contain "${text}", got:\n${this.eventsFrame}`,
    );
  },
);

Then(
  'the events frame shows {string} before {string}',
  function (this: PrivateerWorld, first: string, second: string) {
    const firstIdx = this.eventsFrame.indexOf(first);
    const secondIdx = this.eventsFrame.indexOf(second);
    assert.ok(firstIdx !== -1, `"${first}" not found in frame`);
    assert.ok(secondIdx !== -1, `"${second}" not found in frame`);
    assert.ok(
      firstIdx < secondIdx,
      `Expected "${first}" (at ${String(firstIdx)}) to appear before "${second}" (at ${String(secondIdx)})`,
    );
  },
);
