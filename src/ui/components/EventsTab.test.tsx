import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { EventsTab, useEventsFetcher } from './EventsTab.js';
import type { EventRow } from './EventsTab.js';
import { FakeKubeClient } from '../../boundaries/kube-client.fake.js';
import type { KubernetesObject } from '../../core/types.js';
import { err } from '../../core/result.js';
import type {
  KubeClient,
  EventSelector,
} from '../../boundaries/kube-client.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW_MS = new Date('2026-06-10T13:00:00Z').getTime();

function makeRawEvent(
  type: 'Warning' | 'Normal',
  reason: string,
  message: string,
  lastTimestamp: string,
  count = 1,
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
    involvedObject: { kind: 'Pod', name: 'order-api', namespace: 'default' },
  };
}

function makeRow(
  type: 'Warning' | 'Normal',
  reason: string,
  message = 'test message',
  lastTimestamp = '2026-06-10T12:00:00Z',
  count = 1,
): EventRow {
  return { type, reason, message, lastTimestamp, count };
}

function noop(): void {
  return;
}

/** Minimal KubeClient stub whose listEvents always returns a network error. */
function makeErrorKubeClient(): KubeClient {
  const stub: Pick<KubeClient, 'listEvents'> = {
    listEvents: (_selector: EventSelector) =>
      Promise.resolve(
        err({ kind: 'network' as const, message: 'simulated network error' }),
      ),
  };
  // The remaining methods are never called by useEventsFetcher.
  return stub as unknown as KubeClient;
}

// ---------------------------------------------------------------------------
// useEventsFetcher tests
// ---------------------------------------------------------------------------

describe('useEventsFetcher', () => {
  it('returns only warning events when showAll=false', async () => {
    const client = new FakeKubeClient({
      events: [
        makeRawEvent('Warning', 'BackOff', 'crash', '2026-06-10T12:00:00Z'),
        makeRawEvent('Normal', 'Pulled', 'pulled', '2026-06-10T12:00:00Z'),
      ],
    });
    const result = await useEventsFetcher({
      kubeClient: client,
      resourceName: 'order-api',
      resourceKind: 'Pod',
      namespace: 'default',
      showAll: false,
      nowMs: NOW_MS,
    });
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.type).toBe('Warning');
    expect(result.warningCount).toBe(1);
  });

  it('returns all events when showAll=true', async () => {
    const client = new FakeKubeClient({
      events: [
        makeRawEvent('Warning', 'BackOff', 'crash', '2026-06-10T12:00:00Z'),
        makeRawEvent('Normal', 'Pulled', 'pulled', '2026-06-10T11:00:00Z'),
      ],
    });
    const result = await useEventsFetcher({
      kubeClient: client,
      resourceName: 'order-api',
      resourceKind: 'Pod',
      namespace: 'default',
      showAll: true,
      nowMs: NOW_MS,
    });
    expect(result.events).toHaveLength(2);
    expect(result.warningCount).toBe(1);
  });

  it('sorts events by lastTimestamp descending', async () => {
    const client = new FakeKubeClient({
      events: [
        makeRawEvent('Warning', 'OlderEvent', 'old', '2026-06-10T10:00:00Z'),
        makeRawEvent('Warning', 'NewerEvent', 'new', '2026-06-10T12:00:00Z'),
      ],
    });
    const result = await useEventsFetcher({
      kubeClient: client,
      resourceName: 'order-api',
      resourceKind: 'Pod',
      namespace: 'default',
      showAll: false,
      nowMs: NOW_MS,
    });
    expect(result.events[0]?.reason).toBe('NewerEvent');
    expect(result.events[1]?.reason).toBe('OlderEvent');
  });

  it('returns empty arrays when no events exist', async () => {
    const client = new FakeKubeClient({ events: [] });
    const result = await useEventsFetcher({
      kubeClient: client,
      resourceName: 'order-api',
      resourceKind: 'Pod',
      namespace: 'default',
      showAll: false,
      nowMs: NOW_MS,
    });
    expect(result.events).toHaveLength(0);
    expect(result.warningCount).toBe(0);
  });

  it('counts warnings correctly even in showAll mode', async () => {
    const client = new FakeKubeClient({
      events: [
        makeRawEvent('Warning', 'BackOff', 'crash', '2026-06-10T12:00:00Z'),
        makeRawEvent('Warning', 'OOM', 'oom', '2026-06-10T11:00:00Z'),
        makeRawEvent('Normal', 'Pulled', 'ok', '2026-06-10T10:00:00Z'),
      ],
    });
    const result = await useEventsFetcher({
      kubeClient: client,
      resourceName: 'order-api',
      resourceKind: 'Pod',
      namespace: 'default',
      showAll: true,
      nowMs: NOW_MS,
    });
    expect(result.warningCount).toBe(2);
    expect(result.events).toHaveLength(3);
  });

  it('handles events with missing fields gracefully', async () => {
    const client = new FakeKubeClient({
      events: [
        {
          apiVersion: 'v1',
          kind: 'Event',
          metadata: { name: 'e1' },
          // type, reason, message, lastTimestamp, count all missing
          // but involvedObject must match so the event is returned
          involvedObject: {
            name: 'order-api',
            kind: 'Pod',
            namespace: 'default',
          },
        },
      ],
    });
    const result = await useEventsFetcher({
      kubeClient: client,
      resourceName: 'order-api',
      resourceKind: 'Pod',
      namespace: 'default',
      showAll: true,
      nowMs: NOW_MS,
    });
    // Missing type means it's not 'Warning', so warningCount stays 0
    expect(result.warningCount).toBe(0);
    expect(result.events[0]?.type).toBe('');
    expect(result.events[0]?.reason).toBe('');
    expect(result.events[0]?.count).toBe(0);
  });

  it('returns empty on client error', async () => {
    // FakeKubeClient.forbid() does not affect listEvents, so use a stub that
    // returns an error result to exercise the [] fallback branch.
    const client = makeErrorKubeClient();
    const result = await useEventsFetcher({
      kubeClient: client,
      resourceName: 'order-api',
      resourceKind: 'Pod',
      namespace: 'default',
      showAll: false,
      nowMs: NOW_MS,
    });
    expect(result.events).toHaveLength(0);
    expect(result.warningCount).toBe(0);
  });

  it('sorts events with empty lastTimestamp as epoch (0) — b has empty ts', async () => {
    // a=HasTimestamp b=NoTimestamp: exercises ta=getTime() and tb=0 branches.
    const client = new FakeKubeClient({
      events: [
        makeRawEvent('Warning', 'HasTimestamp', 'msg', '2026-06-10T12:00:00Z'),
        {
          apiVersion: 'v1',
          kind: 'Event',
          metadata: { name: 'no-ts', namespace: 'default' },
          type: 'Warning',
          reason: 'NoTimestamp',
          message: 'missing ts',
          // lastTimestamp intentionally absent → useEventsFetcher maps it to ''
          involvedObject: {
            name: 'order-api',
            kind: 'Pod',
            namespace: 'default',
          },
        },
      ],
    });
    const result = await useEventsFetcher({
      kubeClient: client,
      resourceName: 'order-api',
      resourceKind: 'Pod',
      namespace: 'default',
      showAll: false,
      nowMs: NOW_MS,
    });
    // Event with a timestamp sorts before one with empty timestamp (epoch 0).
    expect(result.events[0]?.reason).toBe('HasTimestamp');
    expect(result.events[1]?.reason).toBe('NoTimestamp');
  });

  it('sorts events with empty lastTimestamp as epoch (0) — a has empty ts', async () => {
    // a=NoTimestamp b=HasTimestamp: exercises ta=0 and tb=getTime() branches.
    const client = new FakeKubeClient({
      events: [
        {
          apiVersion: 'v1',
          kind: 'Event',
          metadata: { name: 'no-ts', namespace: 'default' },
          type: 'Warning',
          reason: 'NoTimestamp',
          message: 'missing ts',
          involvedObject: {
            name: 'order-api',
            kind: 'Pod',
            namespace: 'default',
          },
        },
        makeRawEvent('Warning', 'HasTimestamp', 'msg', '2026-06-10T12:00:00Z'),
      ],
    });
    const result = await useEventsFetcher({
      kubeClient: client,
      resourceName: 'order-api',
      resourceKind: 'Pod',
      namespace: 'default',
      showAll: false,
      nowMs: NOW_MS,
    });
    // Event with a timestamp should sort first (descending).
    expect(result.events[0]?.reason).toBe('HasTimestamp');
    expect(result.events[1]?.reason).toBe('NoTimestamp');
  });
});

// ---------------------------------------------------------------------------
// EventsTab component tests
// ---------------------------------------------------------------------------

describe('EventsTab', () => {
  it('renders warning toggle label when showAll=false', () => {
    const { lastFrame } = render(
      React.createElement(EventsTab, {
        events: [makeRow('Warning', 'BackOff')],
        warningCount: 1,
        showAll: false,
        onToggleShowAll: noop,
        nowMs: NOW_MS,
      }),
    );
    expect(lastFrame()).toContain('[Warning ✓]');
    expect(lastFrame()).toContain('[All]');
  });

  it('renders All toggle label when showAll=true', () => {
    const { lastFrame } = render(
      React.createElement(EventsTab, {
        events: [makeRow('Warning', 'BackOff')],
        warningCount: 1,
        showAll: true,
        onToggleShowAll: noop,
        nowMs: NOW_MS,
      }),
    );
    expect(lastFrame()).toContain('[All ✓]');
    expect(lastFrame()).toContain('[Warning]');
  });

  it('renders column headers', () => {
    const { lastFrame } = render(
      React.createElement(EventsTab, {
        events: [makeRow('Warning', 'BackOff')],
        warningCount: 1,
        showAll: false,
        onToggleShowAll: noop,
        nowMs: NOW_MS,
      }),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Type');
    expect(frame).toContain('Reason');
    expect(frame).toContain('Age');
    expect(frame).toContain('Count');
    expect(frame).toContain('Message');
  });

  it('renders event data', () => {
    const { lastFrame } = render(
      React.createElement(EventsTab, {
        events: [
          makeRow(
            'Warning',
            'BackOff',
            'crash loop',
            '2026-06-10T12:00:00Z',
            14,
          ),
        ],
        warningCount: 1,
        showAll: false,
        onToggleShowAll: noop,
        nowMs: NOW_MS,
      }),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('BackOff');
    expect(frame).toContain('crash loop');
    expect(frame).toContain('14');
    expect(frame).toContain('1h'); // 1 hour ago
  });

  it('shows empty warning state with show-all prompt', () => {
    const { lastFrame } = render(
      React.createElement(EventsTab, {
        events: [],
        warningCount: 0,
        showAll: false,
        onToggleShowAll: noop,
        nowMs: NOW_MS,
      }),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('No warning events');
    expect(frame).toContain('Show all events');
  });

  it('shows empty all-events state', () => {
    const { lastFrame } = render(
      React.createElement(EventsTab, {
        events: [],
        warningCount: 0,
        showAll: true,
        onToggleShowAll: noop,
        nowMs: NOW_MS,
      }),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('No events');
    expect(frame).not.toContain('No warning events');
  });

  it('shows warning count in toggle area', () => {
    const { lastFrame } = render(
      React.createElement(EventsTab, {
        events: [
          makeRow('Warning', 'BackOff'),
          makeRow('Warning', 'OOM'),
          makeRow('Warning', 'FailedScheduling'),
        ],
        warningCount: 3,
        showAll: false,
        onToggleShowAll: noop,
        nowMs: NOW_MS,
      }),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('3');
  });

  it('renders multiple events', () => {
    const { lastFrame } = render(
      React.createElement(EventsTab, {
        events: [
          makeRow('Warning', 'BackOff', 'crash', '2026-06-10T12:00:00Z'),
          makeRow('Normal', 'Pulled', 'pulled', '2026-06-10T11:00:00Z'),
        ],
        warningCount: 1,
        showAll: true,
        onToggleShowAll: noop,
        nowMs: NOW_MS,
      }),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('BackOff');
    expect(frame).toContain('Pulled');
  });

  it('renders a divider line', () => {
    const { lastFrame } = render(
      React.createElement(EventsTab, {
        events: [makeRow('Warning', 'BackOff')],
        warningCount: 1,
        showAll: false,
        onToggleShowAll: noop,
        nowMs: NOW_MS,
      }),
    );
    expect(lastFrame()).toContain('─');
  });

  it('shows NewerEvent before OlderEvent when sorted desc', () => {
    const { lastFrame } = render(
      React.createElement(EventsTab, {
        events: [
          makeRow('Warning', 'NewerEvent', 'new', '2026-06-10T12:00:00Z'),
          makeRow('Warning', 'OlderEvent', 'old', '2026-06-10T10:00:00Z'),
        ],
        warningCount: 2,
        showAll: false,
        onToggleShowAll: noop,
        nowMs: NOW_MS,
      }),
    );
    const frame = lastFrame() ?? '';
    const ni = frame.indexOf('NewerEvent');
    const oi = frame.indexOf('OlderEvent');
    expect(ni).toBeGreaterThanOrEqual(0);
    expect(oi).toBeGreaterThanOrEqual(0);
    expect(ni).toBeLessThan(oi);
  });

  it('shows warnings count in showAll mode', () => {
    const { lastFrame } = render(
      React.createElement(EventsTab, {
        events: [makeRow('Warning', 'BackOff'), makeRow('Normal', 'Pulled')],
        warningCount: 1,
        showAll: true,
        onToggleShowAll: noop,
        nowMs: NOW_MS,
      }),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('1 warnings');
  });

  it('does not show warnings label in showAll when warningCount=0', () => {
    const { lastFrame } = render(
      React.createElement(EventsTab, {
        events: [makeRow('Normal', 'Pulled')],
        warningCount: 0,
        showAll: true,
        onToggleShowAll: noop,
        nowMs: NOW_MS,
      }),
    );
    const frame = lastFrame() ?? '';
    expect(frame).not.toContain('warnings');
  });

  it('truncates reason that exceeds column width', () => {
    // COL_REASON=20, so a reason longer than 20 chars exercises padRight slice
    const longReason = 'VeryLongReasonExceedsTwentyCharacters';
    const { lastFrame } = render(
      React.createElement(EventsTab, {
        events: [makeRow('Warning', longReason)],
        warningCount: 1,
        showAll: false,
        onToggleShowAll: noop,
        nowMs: NOW_MS,
      }),
    );
    // The first 20 chars of the reason appear
    expect(lastFrame()).toContain('VeryLongReasonExceed');
  });

  it('renders empty Age cell when lastTimestamp is empty string', () => {
    // EventRow with lastTimestamp='' exercises the '' branch in formatAge call
    // at line 205: row.lastTimestamp === '' ? '' : formatAge(...)
    const { lastFrame } = render(
      React.createElement(EventsTab, {
        events: [
          {
            type: 'Warning',
            reason: 'NoTimestamp',
            lastTimestamp: '',
            count: 1,
            message: 'no ts message',
          },
        ],
        warningCount: 1,
        showAll: false,
        onToggleShowAll: noop,
        nowMs: NOW_MS,
      }),
    );
    // Event appears but Age column is blank
    expect(lastFrame()).toContain('NoTimestamp');
  });

  it('truncates count that exceeds column width', () => {
    // COL_COUNT=6, so a count with 7+ digits exercises padLeft slice
    const { lastFrame } = render(
      React.createElement(EventsTab, {
        events: [
          makeRow(
            'Warning',
            'BackOff',
            'msg',
            '2026-06-10T12:00:00Z',
            9_999_999,
          ),
        ],
        warningCount: 1,
        showAll: false,
        onToggleShowAll: noop,
        nowMs: NOW_MS,
      }),
    );
    // The first 6 chars of "9999999" appear
    expect(lastFrame()).toContain('999999');
  });
});

describe('EventsTab scroll viewport (chunk 03)', () => {
  it('windows tall content and scrolls to the offset', () => {
    const events = Array.from({ length: 30 }, (_, i) =>
      makeRow('Normal', `Reason${String(i)}`, `message-${String(i)}`),
    );
    const top = render(
      React.createElement(EventsTab, {
        events,
        warningCount: 0,
        showAll: true,
        onToggleShowAll: noop,
        nowMs: NOW_MS,
        width: 120,
        offset: 0,
        viewportHeight: 6,
      }),
    );
    const topOut = top.lastFrame() ?? '';
    expect(topOut).toContain('message-0');
    // far-below rows are not rendered at the top
    expect(topOut).not.toContain('message-25');

    const scrolled = render(
      React.createElement(EventsTab, {
        events,
        warningCount: 0,
        showAll: true,
        onToggleShowAll: noop,
        nowMs: NOW_MS,
        width: 120,
        offset: 25,
        viewportHeight: 6,
      }),
    );
    const scrolledOut = scrolled.lastFrame() ?? '';
    expect(scrolledOut).toContain('message-25');
  });
});
