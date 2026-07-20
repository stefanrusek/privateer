import { Given, When, Then, Before } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { render } from 'ink-testing-library';
import React from 'react';
import type { PrivateerWorld } from '../support/world.js';
import type { KubernetesObject } from '../../src/core/types.js';
import { FakeLogStream } from '../../src/boundaries/log-stream.fake.js';
import { InMemoryFileSink } from '../../src/boundaries/config-store.fake.js';
import { FakeClock } from '../../src/boundaries/clock.fake.js';
import {
  buildContainerPicker,
  type PickerResult,
} from '../../src/logs/container-picker.js';
import { RingBuffer } from '../../src/logs/ring-buffer.js';
import {
  runSearch,
  emptySearch,
  nextMatch,
  prevMatch,
  type SearchState,
} from '../../src/logs/search.js';
import { routeLogsSearchKey } from '../../src/logs/search-input.js';
import {
  streamParamsFor,
  type LineOptionId,
} from '../../src/logs/line-options.js';
import { downloadLogs } from '../../src/logs/download.js';
import { LogsTab } from '../../src/ui/components/LogsTab.js';
import {
  buildContainerItems,
  buildLineLimitItems,
  type LogsContainerItem,
  type LogsLineLimitItem,
} from '../../src/ui/logs-toolbar.js';

// ---------------------------------------------------------------------------
// World augmentation
// ---------------------------------------------------------------------------

interface ContainerStatus {
  name: string;
  state: Record<string, unknown>;
  restartCount: number;
}

declare module '../support/world.js' {
  interface PrivateerWorld {
    logsPodName: string;
    logsContainerStatuses: ContainerStatus[];
    logsInitStatuses: ContainerStatus[];
    logsPicker: PickerResult;
    logsSelectedContainer: string;
    logsStream: FakeLogStream;
    logsFileSink: InMemoryFileSink;
    logsClock: FakeClock;
    logsBuffer: RingBuffer;
    logsLive: boolean;
    logsNewLinesAvailable: boolean;
    logsSearch: SearchState;
    logsSearchFocused: boolean;
    logsConfirmation: string | undefined;
    logsFrame: string;
    logsContainerItems: LogsContainerItem[];
    logsLineLimitItems: LogsLineLimitItem[];
    logsContainerDropdownOpen: boolean;
    logsStreamedContainer: string | undefined;
  }
}

// ---------------------------------------------------------------------------
// Reset per-scenario
// ---------------------------------------------------------------------------

Before(function (this: PrivateerWorld) {
  this.logsPodName = '';
  this.logsContainerStatuses = [];
  this.logsInitStatuses = [];
  this.logsSelectedContainer = '';
  this.logsStream = new FakeLogStream();
  this.logsFileSink = new InMemoryFileSink();
  this.logsClock = new FakeClock(new Date('2026-06-10T14:22:09Z').getTime());
  this.logsBuffer = new RingBuffer(10_000);
  this.logsLive = true;
  this.logsNewLinesAvailable = false;
  this.logsSearch = emptySearch();
  this.logsSearchFocused = false;
  this.logsConfirmation = undefined;
  this.logsFrame = '';
  this.logsContainerItems = [];
  this.logsLineLimitItems = [];
  this.logsContainerDropdownOpen = false;
  this.logsStreamedContainer = undefined;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function runningState(): Record<string, unknown> {
  return { running: { startedAt: '2026-06-10T00:00:00Z' } };
}
function terminatedState(): Record<string, unknown> {
  return { terminated: { exitCode: 0 } };
}

function buildPod(world: PrivateerWorld): KubernetesObject {
  return {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: world.logsPodName, namespace: 'default' },
    status: {
      containerStatuses: world.logsContainerStatuses,
      initContainerStatuses: world.logsInitStatuses,
    },
  };
}

function renderLogs(world: PrivateerWorld): void {
  const { lastFrame } = render(
    React.createElement(LogsTab, {
      podName: world.logsPodName,
      container: world.logsSelectedContainer || 'order-api',
      lines: world.logsBuffer.toArray(),
      live: world.logsLive,
      timestamps: true,
      wrap: false,
      lineLimitLabel: '100 lines',
      previous: false,
      search: world.logsSearch,
      searchFocused: world.logsSearchFocused,
      newLinesAvailable: world.logsNewLinesAvailable,
      ...(world.logsConfirmation !== undefined
        ? { confirmation: world.logsConfirmation }
        : {}),
    }),
  );
  world.logsFrame = lastFrame() ?? '';
}

function openStream(
  world: PrivateerWorld,
  params: { tailLines?: number; sinceSeconds?: number } = {},
): void {
  world.logsStream.tail(
    {
      namespace: 'default',
      pod: world.logsPodName,
      container: world.logsSelectedContainer || 'order-api',
      ...params,
    },
    {
      onLine: (line) => {
        world.logsBuffer.push(line);
      },
      onError: () => undefined,
    },
  );
}

// ---------------------------------------------------------------------------
// Given steps
// ---------------------------------------------------------------------------

Given(
  'a pod {string} with a running container {string}',
  function (this: PrivateerWorld, pod: string, container: string) {
    this.logsPodName = pod;
    this.logsContainerStatuses.push({
      name: container,
      state: runningState(),
      restartCount: 0,
    });
  },
);

Given(
  'a pod {string} with a terminated container {string}',
  function (this: PrivateerWorld, pod: string, container: string) {
    this.logsPodName = pod;
    this.logsContainerStatuses.push({
      name: container,
      state: terminatedState(),
      restartCount: 0,
    });
  },
);

Given(
  'the pod has a terminated container {string}',
  function (this: PrivateerWorld, container: string) {
    this.logsContainerStatuses.push({
      name: container,
      state: terminatedState(),
      restartCount: 0,
    });
  },
);

Given(
  'the pod has an init container {string}',
  function (this: PrivateerWorld, container: string) {
    this.logsInitStatuses.push({
      name: container,
      state: terminatedState(),
      restartCount: 0,
    });
  },
);

Given(
  'a pod {string} with a running container {string} that restarted {int} times',
  function (
    this: PrivateerWorld,
    pod: string,
    container: string,
    restarts: number,
  ) {
    this.logsPodName = pod;
    this.logsContainerStatuses.push({
      name: container,
      state: runningState(),
      restartCount: restarts,
    });
  },
);

Given(
  'an open LogsTab for pod {string} container {string}',
  function (this: PrivateerWorld, pod: string, container: string) {
    this.logsPodName = pod;
    this.logsSelectedContainer = container;
    openStream(this);
  },
);

Given(
  'the log buffer capacity is {int}',
  function (this: PrivateerWorld, capacity: number) {
    this.logsBuffer = new RingBuffer(capacity);
  },
);

// ---------------------------------------------------------------------------
// When steps
// ---------------------------------------------------------------------------

When('I open logs for the pod', function (this: PrivateerWorld) {
  this.logsPicker = buildContainerPicker(buildPod(this));
  if (this.logsPicker.defaultIndex >= 0) {
    this.logsSelectedContainer =
      this.logsPicker.options[this.logsPicker.defaultIndex]?.name ?? '';
  }
  // B06: no full-screen modal. With a default we stream it immediately and the
  // inline dropdown stays closed; with no default we stream nothing and the
  // inline container dropdown auto-opens.
  const hasDefault = this.logsPicker.defaultIndex >= 0;
  this.logsContainerDropdownOpen = !hasDefault;
  this.logsStreamedContainer = hasDefault
    ? this.logsPicker.options[this.logsPicker.defaultIndex]?.name
    : undefined;
});

When(
  'I build the inline container dropdown items',
  function (this: PrivateerWorld) {
    this.logsContainerItems = buildContainerItems(
      this.logsPicker.options,
      this.logsSelectedContainer,
    );
  },
);

When(
  'I build the line-limit dropdown items for {string}',
  function (this: PrivateerWorld, current: string) {
    this.logsLineLimitItems = buildLineLimitItems(current as LineOptionId);
  },
);

When(
  'the stream delivers the log line {string}',
  function (this: PrivateerWorld, line: string) {
    this.logsStream.emitLine(0, line);
    renderLogs(this);
  },
);

When(
  'the stream delivers the log lines {string}',
  function (this: PrivateerWorld, csv: string) {
    this.logsStream.emitLines(0, csv.split(','));
    renderLogs(this);
  },
);

When(
  'I pause the live tail with new lines waiting',
  function (this: PrivateerWorld) {
    this.logsLive = false;
    this.logsNewLinesAvailable = true;
    renderLogs(this);
  },
);

When(
  'I search the logs for {string}',
  function (this: PrivateerWorld, query: string) {
    this.logsSearch = runSearch(this.logsBuffer.toArray(), query);
    renderLogs(this);
  },
);

When('I open the log search bar', function (this: PrivateerWorld) {
  const route = routeLogsSearchKey(
    '/',
    {
      escape: false,
      return: false,
      backspace: false,
      delete: false,
      ctrl: false,
      meta: false,
    },
    { focused: this.logsSearchFocused, query: this.logsSearch.query },
  );
  assert.equal(route.kind, 'open');
  this.logsSearchFocused = true;
  renderLogs(this);
});

When(
  'I type {string} into the log search bar',
  function (this: PrivateerWorld, text: string) {
    for (const ch of text) {
      const route = routeLogsSearchKey(
        ch,
        {
          escape: false,
          return: false,
          backspace: false,
          delete: false,
          ctrl: false,
          meta: false,
        },
        { focused: this.logsSearchFocused, query: this.logsSearch.query },
      );
      // Exclusive capture (P9R-0004): every keystroke while focused must be
      // absorbed into the query — never fall through to a Logs hotkey.
      if (route.kind !== 'append') {
        throw new Error(
          `expected "${ch}" to be captured by the search bar, got ${route.kind}`,
        );
      }
      this.logsSearch = { ...this.logsSearch, query: route.query };
    }
    renderLogs(this);
  },
);

When('I press Enter in the log search bar', function (this: PrivateerWorld) {
  this.logsSearchFocused = false;
  this.logsSearch = runSearch(this.logsBuffer.toArray(), this.logsSearch.query);
  renderLogs(this);
});

When('I press Esc in the log search bar', function (this: PrivateerWorld) {
  const route = routeLogsSearchKey(
    '',
    {
      escape: true,
      return: false,
      backspace: false,
      delete: false,
      ctrl: false,
      meta: false,
    },
    { focused: this.logsSearchFocused, query: this.logsSearch.query },
  );
  assert.ok(
    route.kind === 'close' || route.kind === 'clear-active',
    `expected Esc to close or clear the search, got ${route.kind}`,
  );
  this.logsSearchFocused = false;
  this.logsSearch = emptySearch();
  renderLogs(this);
});

When('I jump to the next log search match', function (this: PrivateerWorld) {
  this.logsSearch = nextMatch(this.logsSearch);
  renderLogs(this);
});

When(
  'I jump to the previous log search match',
  function (this: PrivateerWorld) {
    this.logsSearch = prevMatch(this.logsSearch);
    renderLogs(this);
  },
);

When(
  'I choose the line-limit option {string}',
  function (this: PrivateerWorld, optionId: string) {
    const params = streamParamsFor(optionId as LineOptionId);
    openStream(this, params);
  },
);

When('I download the logs', async function (this: PrivateerWorld) {
  const result = await downloadLogs(
    this.logsFileSink,
    '/Users/tester',
    this.logsPodName,
    this.logsSelectedContainer,
    this.logsBuffer.toArray(),
    this.logsClock.now(),
  );
  assert.ok(result.ok, 'download should succeed');
  this.logsConfirmation = `✓ Saved to ${result.value.displayPath}`;
  renderLogs(this);
});

// ---------------------------------------------------------------------------
// Then steps
// ---------------------------------------------------------------------------

Then(
  'the log picker auto-opens the single container',
  function (this: PrivateerWorld) {
    assert.ok(this.logsPicker.autoOpen, 'expected picker to auto-open');
  },
);

Then('the log picker does not auto-open', function (this: PrivateerWorld) {
  assert.ok(!this.logsPicker.autoOpen, 'expected picker NOT to auto-open');
});

Then(
  'the selected log container is {string}',
  function (this: PrivateerWorld, name: string) {
    assert.equal(this.logsSelectedContainer, name);
  },
);

Then(
  'the default log container is {string}',
  function (this: PrivateerWorld, name: string) {
    const idx = this.logsPicker.defaultIndex;
    assert.ok(idx >= 0, 'expected a default selection');
    assert.equal(this.logsPicker.options[idx]?.name, name);
  },
);

Then(
  'the log picker has no default selection',
  function (this: PrivateerWorld) {
    assert.equal(this.logsPicker.defaultIndex, -1);
  },
);

Then(
  'the log option at index {int} is labeled {string}',
  function (this: PrivateerWorld, index: number, label: string) {
    assert.equal(this.logsPicker.options[index]?.label, label);
  },
);

Then(
  'the selected log container offers a previous instance',
  function (this: PrivateerWorld) {
    const idx = this.logsPicker.defaultIndex;
    assert.ok(idx >= 0, 'expected a default selection');
    assert.ok(
      this.logsPicker.options[idx]?.hasPrevious,
      'expected a previous instance to be available',
    );
  },
);

Then(
  'the logs frame contains {string}',
  function (this: PrivateerWorld, text: string) {
    assert.ok(
      this.logsFrame.includes(text),
      `Expected logs frame to contain "${text}", got:\n${this.logsFrame}`,
    );
  },
);

Then(
  'the logs frame does not contain {string}',
  function (this: PrivateerWorld, text: string) {
    assert.ok(
      !this.logsFrame.includes(text),
      `Expected logs frame NOT to contain "${text}", got:\n${this.logsFrame}`,
    );
  },
);

Then(
  'the most recent log stream was opened with since seconds {int}',
  function (this: PrivateerWorld, seconds: number) {
    assert.equal(this.logsStream.lastOptions()?.sinceSeconds, seconds);
  },
);

Then(
  'a log file is saved under {string}',
  function (this: PrivateerWorld, prefix: string) {
    const saved = [...this.logsFileSink.files.keys()].some((p) =>
      p.includes(prefix),
    );
    assert.ok(
      saved,
      `Expected a saved file under "${prefix}", got:\n${[...this.logsFileSink.files.keys()].join('\n')}`,
    );
  },
);

Then(
  'logs stream the default container {string} immediately',
  function (this: PrivateerWorld, name: string) {
    assert.equal(this.logsStreamedContainer, name);
  },
);

Then(
  'no container streams until I choose one',
  function (this: PrivateerWorld) {
    assert.equal(this.logsStreamedContainer, undefined);
  },
);

Then('the inline container dropdown is open', function (this: PrivateerWorld) {
  assert.ok(this.logsContainerDropdownOpen, 'expected the dropdown to be open');
});

Then(
  'the inline container dropdown is closed',
  function (this: PrivateerWorld) {
    assert.ok(
      !this.logsContainerDropdownOpen,
      'expected the dropdown to be closed',
    );
  },
);

Then(
  'container dropdown item {string} has a green dot and is marked current',
  function (this: PrivateerWorld, name: string) {
    const item = this.logsContainerItems.find((i) => i.id === name);
    assert.ok(item !== undefined, `no dropdown item for "${name}"`);
    assert.equal(item.dotColor, 'green');
    assert.ok(item.current, 'expected the item to be marked current');
    assert.ok(item.label.includes('✓'), 'expected a current marker in label');
  },
);

Then(
  'container dropdown item {string} has a gray dot and is not marked',
  function (this: PrivateerWorld, name: string) {
    const item = this.logsContainerItems.find((i) => i.id === name);
    assert.ok(item !== undefined, `no dropdown item for "${name}"`);
    assert.equal(item.dotColor, 'gray');
    assert.ok(!item.current, 'expected the item NOT to be marked current');
    assert.ok(!item.label.includes('✓'), 'expected no current marker in label');
  },
);

Then(
  'the line-limit dropdown marks {string} as current',
  function (this: PrivateerWorld, id: string) {
    const marked = this.logsLineLimitItems.filter((i) => i.current);
    assert.equal(marked.length, 1, 'expected exactly one current limit');
    assert.equal(marked[0]?.id, id);
  },
);
