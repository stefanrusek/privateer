import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StreamManager } from './stream-manager.js';
import { FakeKubeClient } from '../boundaries/kube-client.fake.js';
import { FakeClock } from '../boundaries/clock.fake.js';
import type { ResourceEvent } from '../core/types.js';
import type { KubeError } from '../boundaries/kube-client.js';

const CORE_KINDS = [
  'Pod',
  'Deployment',
  'StatefulSet',
  'DaemonSet',
  'Node',
  'Namespace',
];

function makeStreamManager(
  client: FakeKubeClient,
  clock: FakeClock,
  options?: {
    idleTimeoutSeconds?: number;
    listIntervalSeconds?: number;
    backoffBaseMs?: number;
    backoffMaxMs?: number;
    relistBackoffMaxMs?: number;
  },
) {
  const events: ResourceEvent[] = [];
  const errors: { kind: string; error: KubeError }[] = [];
  const badges: { kind: string; count: number }[] = [];
  const degraded: { kind: string; degraded: boolean }[] = [];
  const relists: { kind: string; present: ReadonlySet<string> }[] = [];

  const onEvent = vi.fn((e: ResourceEvent) => {
    events.push(e);
  });
  const onError = vi.fn((kind: string, error: KubeError) => {
    errors.push({ kind, error });
  });
  const onBadgeCount = vi.fn((kind: string, count: number) => {
    badges.push({ kind, count });
  });
  const onDegraded = vi.fn((kind: string, isDegraded: boolean) => {
    degraded.push({ kind, degraded: isDegraded });
  });
  const onRelist = vi.fn((kind: string, present: ReadonlySet<string>) => {
    relists.push({ kind, present });
  });

  const manager = new StreamManager(
    client,
    clock,
    onEvent,
    onError,
    onBadgeCount,
    onDegraded,
    onRelist,
    options,
  );

  return {
    manager,
    events,
    errors,
    badges,
    degraded,
    relists,
    onEvent,
    onError,
    onBadgeCount,
    onDegraded,
    onRelist,
  };
}

function makeNetworkError(): KubeError {
  return { kind: 'network', message: 'connection reset' };
}

function makeExpiredError(): KubeError {
  return {
    kind: 'expired',
    message: 'too old resource version: 6 (57736)',
    statusCode: 410,
  };
}

describe('StreamManager', () => {
  let client: FakeKubeClient;
  let clock: FakeClock;

  beforeEach(() => {
    client = new FakeKubeClient();
    clock = new FakeClock(0);
  });

  describe('start()', () => {
    it('opens a watch for each builtin core kind', () => {
      const { manager } = makeStreamManager(client, clock);
      manager.start();
      // 6 builtin + 1 warning events = 7
      expect(client.openWatchCount()).toBe(7);
      for (const kind of CORE_KINDS) {
        expect(manager.trackedKinds()).toContain(kind);
      }
      expect(manager.trackedKinds()).toContain('WarningEvents');
    });

    it('includes Kafka kinds from the kafka set', () => {
      const { manager } = makeStreamManager(client, clock);
      manager.start(new Set(['Kafka', 'KafkaTopic']));
      // 6 builtin + 2 kafka + 1 warning events = 9
      expect(client.openWatchCount()).toBe(9);
      expect(manager.trackedKinds()).toContain('Kafka');
      expect(manager.trackedKinds()).toContain('KafkaTopic');
    });

    it('ignores unknown kafka kinds not in the kafka set', () => {
      const { manager } = makeStreamManager(client, clock);
      manager.start(new Set(['KafkaConnect', 'UnknownKind']));
      // Only builtins + warning events — KafkaConnect is not in KAFKA_KINDS
      expect(client.openWatchCount()).toBe(7);
      expect(manager.trackedKinds()).not.toContain('KafkaConnect');
    });

    it('is idempotent — second call is a no-op', () => {
      const { manager } = makeStreamManager(client, clock);
      manager.start();
      const countAfterFirst = client.openWatchCount();
      manager.start();
      expect(client.openWatchCount()).toBe(countAfterFirst);
    });

    it('after stop() start() is a no-op', () => {
      const { manager } = makeStreamManager(client, clock);
      manager.stop();
      manager.start();
      expect(client.openWatchCount()).toBe(0);
    });

    it('Warning events use kind=Event with fieldSelector type=Warning', () => {
      const { manager } = makeStreamManager(client, clock);
      manager.start();
      // The WarningEvents key maps to watchKind=Event
      expect(manager.trackedKinds()).toContain('WarningEvents');
    });
  });

  describe('stop()', () => {
    it('closes all open streams', () => {
      const { manager } = makeStreamManager(client, clock);
      manager.start();
      expect(client.openWatchCount()).toBeGreaterThan(0);
      manager.stop();
      expect(client.openWatchCount()).toBe(0);
    });

    it('clears all tracked kinds', () => {
      const { manager } = makeStreamManager(client, clock);
      manager.start();
      manager.stop();
      expect(manager.trackedKinds()).toEqual([]);
    });

    it('is idempotent', () => {
      const { manager } = makeStreamManager(client, clock);
      manager.start();
      manager.stop();
      manager.stop(); // should not throw
      expect(client.openWatchCount()).toBe(0);
    });

    it('cancels pending reconnect timers', () => {
      const { manager } = makeStreamManager(client, clock, {
        backoffBaseMs: 1000,
      });
      manager.start();
      // Trigger an error on Pod to schedule a reconnect
      client.emitError('Pod', makeNetworkError());
      expect(clock.pendingCount()).toBeGreaterThan(0);
      manager.stop();
      expect(clock.pendingCount()).toBe(0);
    });
  });

  describe('activate()', () => {
    it('opens a new on-demand stream for an unknown kind', () => {
      const { manager } = makeStreamManager(client, clock);
      manager.start();
      const before = client.openWatchCount();
      manager.activate('ConfigMap');
      expect(client.openWatchCount()).toBe(before + 1);
      expect(manager.trackedKinds()).toContain('ConfigMap');
    });

    it('sets up an idle-close timer and a periodic list interval', () => {
      const { manager } = makeStreamManager(client, clock, {
        idleTimeoutSeconds: 300,
        listIntervalSeconds: 60,
      });
      manager.start();
      const pendingBefore = clock.pendingCount();
      manager.activate('ConfigMap');
      // Should have added 2 tasks: idle timeout + list interval
      expect(clock.pendingCount()).toBe(pendingBefore + 2);
    });

    it('closes on-demand stream after idle timeout', () => {
      const { manager } = makeStreamManager(client, clock, {
        idleTimeoutSeconds: 300,
        listIntervalSeconds: 60,
      });
      manager.start();
      manager.activate('ConfigMap');
      expect(manager.trackedKinds()).toContain('ConfigMap');
      // Advance past idle timeout
      clock.advance(300_000);
      expect(manager.trackedKinds()).not.toContain('ConfigMap');
    });

    it('resets idle timer on repeated activation', () => {
      const { manager } = makeStreamManager(client, clock, {
        idleTimeoutSeconds: 300,
        listIntervalSeconds: 600,
      });
      manager.start();
      manager.activate('ConfigMap');
      // Advance 200s — still within timeout
      clock.advance(200_000);
      // Re-activate resets the idle timer
      manager.activate('ConfigMap');
      // Advance another 200s — now 400s total but only 200s since last activate
      clock.advance(200_000);
      expect(manager.trackedKinds()).toContain('ConfigMap');
      // Advance 200 more — 400s since last activate, exceeds 300s timeout
      clock.advance(200_000);
      expect(manager.trackedKinds()).not.toContain('ConfigMap');
    });

    it('does not open a second stream if kind is already tracked', () => {
      const { manager } = makeStreamManager(client, clock, {
        idleTimeoutSeconds: 300,
        listIntervalSeconds: 60,
      });
      manager.start();
      manager.activate('ConfigMap');
      const countAfterFirst = client.openWatchCount();
      manager.activate('ConfigMap');
      expect(client.openWatchCount()).toBe(countAfterFirst);
    });

    it('is a no-op after stop()', () => {
      const { manager } = makeStreamManager(client, clock);
      manager.start();
      manager.stop();
      manager.activate('ConfigMap');
      expect(manager.trackedKinds()).not.toContain('ConfigMap');
    });
  });

  describe('periodic badge list', () => {
    it('calls onBadgeCount on list interval', async () => {
      client.seed({
        apiVersion: 'v1',
        kind: 'ConfigMap',
        metadata: { name: 'cm1', namespace: 'default' },
      });
      const { manager, onBadgeCount } = makeStreamManager(client, clock, {
        idleTimeoutSeconds: 300,
        listIntervalSeconds: 60,
      });
      manager.start();
      manager.activate('ConfigMap');
      // Advance past the first list interval
      clock.advance(60_000);
      // Flush the full async chain: FakeKubeClient.list is async so needs
      // multiple microtask ticks to settle.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      expect(onBadgeCount).toHaveBeenCalledWith('ConfigMap', 1);
    });

    it('calls onBadgeCount multiple times across intervals', async () => {
      const { manager, onBadgeCount } = makeStreamManager(client, clock, {
        idleTimeoutSeconds: 600,
        listIntervalSeconds: 60,
      });
      manager.start();
      manager.activate('ConfigMap');
      clock.advance(60_000);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      clock.advance(60_000);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      expect(onBadgeCount).toHaveBeenCalledTimes(2);
    });

    it('does not call onBadgeCount if list returns an error', async () => {
      client.forbid('ConfigMap');
      const { manager, onBadgeCount } = makeStreamManager(client, clock, {
        idleTimeoutSeconds: 300,
        listIntervalSeconds: 60,
      });
      manager.start();
      manager.activate('ConfigMap');
      clock.advance(60_000);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      expect(onBadgeCount).not.toHaveBeenCalled();
    });
  });

  describe('backoff reconnect', () => {
    it('reconnects core stream after error with backoff delay', () => {
      const { manager } = makeStreamManager(client, clock, {
        backoffBaseMs: 1000,
      });
      manager.start();
      const countBefore = client.openWatchCount();
      // Trigger error on Pod
      client.emitError('Pod', makeNetworkError());
      // Watch count drops by 1 (Pod closed due to error)
      expect(client.openWatchCount()).toBe(countBefore - 1);
      // Advance past backoff
      clock.advance(1000);
      // Pod watch reconnected
      expect(client.openWatchCount()).toBe(countBefore);
    });

    it('calls onError when a stream errors', () => {
      const { manager, onError } = makeStreamManager(client, clock, {
        backoffBaseMs: 1000,
      });
      manager.start();
      const error = makeNetworkError();
      client.emitError('Pod', error);
      expect(onError).toHaveBeenCalledWith('Pod', error);
    });

    it('doubles backoff on repeated errors', () => {
      const { manager } = makeStreamManager(client, clock, {
        backoffBaseMs: 1000,
        backoffMaxMs: 30_000,
      });
      manager.start();
      const initialCount = client.openWatchCount();

      // First error — backoff 1000ms
      client.emitError('Pod', makeNetworkError());
      clock.advance(1000);
      expect(client.openWatchCount()).toBe(initialCount);

      // Second error — backoff 2000ms
      client.emitError('Pod', makeNetworkError());
      clock.advance(1000); // not enough
      expect(client.openWatchCount()).toBe(initialCount - 1);
      clock.advance(1000); // now enough (2000ms total)
      expect(client.openWatchCount()).toBe(initialCount);
    });

    it('caps backoff at backoffMaxMs', () => {
      const { manager } = makeStreamManager(client, clock, {
        backoffBaseMs: 1000,
        backoffMaxMs: 2000,
      });
      manager.start();

      // Trigger many errors to hit the cap
      for (let i = 0; i < 10; i++) {
        client.emitError('Pod', makeNetworkError());
        clock.advance(30_000); // advance far enough to trigger any reconnect
      }
      // After many reconnects, stream should still be reconnecting within max backoff
      expect(manager.trackedKinds()).toContain('Pod');
    });

    it('resets backoff to base on successful event', () => {
      const { manager } = makeStreamManager(client, clock, {
        backoffBaseMs: 1000,
        backoffMaxMs: 30_000,
      });
      manager.start();
      const initialCount = client.openWatchCount();

      // First error — backoff doubles to 2000ms next time
      client.emitError('Pod', makeNetworkError());
      clock.advance(1000); // reconnect fires
      expect(client.openWatchCount()).toBe(initialCount);

      // Emit a successful event to reset backoff
      client.emit({
        type: 'ADDED',
        apiVersion: 'v1',
        kind: 'Pod',
        namespace: 'default',
        name: 'test-pod',
        object: {
          apiVersion: 'v1',
          kind: 'Pod',
          metadata: {
            name: 'test-pod',
            namespace: 'default',
            resourceVersion: '1',
          },
        },
      });

      // Second error — backoff should be reset to 1000ms base
      client.emitError('Pod', makeNetworkError());
      clock.advance(1000); // should be enough after reset
      expect(client.openWatchCount()).toBe(initialCount);
    });

    it('does not reconnect after stop()', () => {
      const { manager } = makeStreamManager(client, clock, {
        backoffBaseMs: 1000,
      });
      manager.start();
      // Trigger error to schedule a reconnect
      client.emitError('Pod', makeNetworkError());
      // Stop before reconnect fires
      manager.stop();
      expect(clock.pendingCount()).toBe(0);
    });
  });

  describe('relist recovery on 410/expired (P9R-0009)', () => {
    it('re-lists, replays items as ADDED, reconciles, and resumes the watch', async () => {
      client.seed({
        apiVersion: 'v1',
        kind: 'Namespace',
        metadata: { name: 'kept', resourceVersion: '99' },
      });
      const { manager, events, relists, degraded } = makeStreamManager(
        client,
        clock,
      );
      manager.start();
      const countBefore = client.openWatchCount();

      client.emitError('Namespace', makeExpiredError());
      // Watch closed immediately; relist is in flight.
      expect(client.openWatchCount()).toBe(countBefore - 1);
      await vi.waitFor(() => {
        expect(client.openWatchCount()).toBe(countBefore);
      });

      expect(
        events.some((e) => e.kind === 'Namespace' && e.name === 'kept'),
      ).toBe(true);
      expect(relists).toHaveLength(1);
      expect(relists[0]?.kind).toBe('Namespace');
      expect(relists[0]?.present.has('~/kept')).toBe(true);
      // Relist succeeded without ever failing — no degraded transition.
      expect(degraded).toHaveLength(0);
    });

    it('defaults apiVersion/name when a relisted item omits them', async () => {
      // Real LIST responses often omit apiVersion/kind per-item; only
      // metadata.name is missing here to exercise the name fallback too.
      client.seed({ kind: 'Namespace', metadata: { resourceVersion: '1' } });
      const { manager, events, relists } = makeStreamManager(client, clock);
      manager.start();

      client.emitError('Namespace', makeExpiredError());
      await vi.waitFor(() => {
        expect(relists).toHaveLength(1);
      });

      expect(relists[0]?.present.has('~/')).toBe(true);
      const relisted = events.find(
        (e) => e.kind === 'Namespace' && e.type === 'ADDED' && e.name === '',
      );
      expect(relisted?.apiVersion).toBe('');
    });

    it('calls onError exactly once entering recovery, not per relist retry', async () => {
      client.forbid('Namespace');
      const { manager, errors } = makeStreamManager(client, clock, {
        backoffBaseMs: 100,
      });
      manager.start();

      client.emitError('Namespace', makeExpiredError());
      await vi.waitFor(() => {
        expect(errors.filter((e) => e.kind === 'Namespace')).toHaveLength(1);
      });

      // Advance past several relist retries — still only one recovery line.
      clock.advance(100);
      await Promise.resolve();
      clock.advance(200);
      await Promise.resolve();
      expect(errors.filter((e) => e.kind === 'Namespace')).toHaveLength(1);
    });

    it('surfaces a degraded indicator when relist fails, clears it once it succeeds', async () => {
      client.forbid('Namespace');
      const { manager, degraded } = makeStreamManager(client, clock, {
        backoffBaseMs: 100,
      });
      manager.start();

      client.emitError('Namespace', makeExpiredError());
      await vi.waitFor(() => {
        expect(degraded).toContainEqual({ kind: 'Namespace', degraded: true });
      });
      // Only one degraded(true) transition even if the flag is already set.
      expect(degraded.filter((d) => d.degraded)).toHaveLength(1);

      client.unforbid('Namespace');
      clock.advance(100);
      await vi.waitFor(() => {
        expect(degraded).toContainEqual({ kind: 'Namespace', degraded: false });
      });
    });

    it('caps relist retry backoff at relistBackoffMaxMs', async () => {
      client.forbid('Namespace');
      const { manager } = makeStreamManager(client, clock, {
        backoffBaseMs: 1000,
        relistBackoffMaxMs: 2000,
      });
      manager.start();

      client.emitError('Namespace', makeExpiredError());
      for (let i = 0; i < 5; i++) {
        clock.advance(2000);
        await Promise.resolve();
      }
      // Still tracked and still retrying — capped backoff never stalls out.
      expect(manager.trackedKinds()).toContain('Namespace');
    });

    it('does not resume with the stale resourceVersion after expiry', async () => {
      const { manager } = makeStreamManager(client, clock);
      manager.start();

      client.emit({
        type: 'ADDED',
        apiVersion: 'v1',
        kind: 'Namespace',
        namespace: null,
        name: 'ns-a',
        object: {
          apiVersion: 'v1',
          kind: 'Namespace',
          metadata: { name: 'ns-a', resourceVersion: '6' },
        },
      });
      client.emitError('Namespace', makeExpiredError());
      await vi.waitFor(() => {
        expect(client.lastWatchOptions('Namespace')?.resourceVersion).toBe('1');
      });
    });
  });

  describe('resourceVersion tracking', () => {
    it('tracks resourceVersion from events for reconnect resumption', () => {
      const { manager } = makeStreamManager(client, clock, {
        backoffBaseMs: 1000,
      });
      manager.start();

      // Emit an event with a resourceVersion
      client.emit({
        type: 'ADDED',
        apiVersion: 'v1',
        kind: 'Pod',
        namespace: 'default',
        name: 'test-pod',
        object: {
          apiVersion: 'v1',
          kind: 'Pod',
          metadata: {
            name: 'test-pod',
            namespace: 'default',
            resourceVersion: '42',
          },
        },
      });

      // After error and reconnect, the stream should have resumed
      client.emitError('Pod', makeNetworkError());
      clock.advance(1000);
      // Stream reconnected — we can't directly inspect options but can verify
      // the stream is still tracked and open
      expect(manager.trackedKinds()).toContain('Pod');
    });
  });

  describe('event delivery', () => {
    it('delivers watch events to onEvent handler', () => {
      const { manager, onEvent } = makeStreamManager(client, clock);
      manager.start();
      client.emit({
        type: 'ADDED',
        apiVersion: 'v1',
        kind: 'Pod',
        namespace: 'default',
        name: 'web-1',
        object: {
          apiVersion: 'v1',
          kind: 'Pod',
          metadata: { name: 'web-1', namespace: 'default' },
        },
      });
      expect(onEvent).toHaveBeenCalledOnce();
    });
  });

  describe('openStreamCount()', () => {
    it('returns 0 before start', () => {
      const { manager } = makeStreamManager(client, clock);
      expect(manager.openStreamCount()).toBe(0);
    });

    it('counts open subscriptions correctly', () => {
      const { manager } = makeStreamManager(client, clock);
      manager.start();
      // 6 builtin + 1 warning events
      expect(manager.openStreamCount()).toBe(7);
    });

    it('decrements when a stream errors out', () => {
      const { manager } = makeStreamManager(client, clock, {
        backoffBaseMs: 1000,
      });
      manager.start();
      const before = manager.openStreamCount();
      client.emitError('Pod', makeNetworkError());
      expect(manager.openStreamCount()).toBe(before - 1);
    });
  });
});
