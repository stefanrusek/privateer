/**
 * Unit tests for PollingScheduler (Spec 06 §2.4).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { PollingScheduler, POLLING_INTERVALS_MS } from './scheduler.js';
import type { PollingContext } from './scheduler.js';
import { FakeClock } from '../boundaries/clock.fake.js';

describe('PollingScheduler', () => {
  let clock: FakeClock;
  let scheduler: PollingScheduler;

  beforeEach(() => {
    clock = new FakeClock(0);
    scheduler = new PollingScheduler(clock);
  });

  // -------------------------------------------------------------------------
  // Interval definitions
  // -------------------------------------------------------------------------

  it('list-sparklines interval is 30s', () => {
    expect(POLLING_INTERVALS_MS['list-sparklines']).toBe(30_000);
  });

  it('metrics-tab interval is 10s', () => {
    expect(POLLING_INTERVALS_MS['metrics-tab']).toBe(10_000);
  });

  it('dashboard interval is 60s', () => {
    expect(POLLING_INTERVALS_MS.dashboard).toBe(60_000);
  });

  it('kafka-lag interval is 15s', () => {
    expect(POLLING_INTERVALS_MS['kafka-lag']).toBe(15_000);
  });

  // -------------------------------------------------------------------------
  // Start / fire
  // -------------------------------------------------------------------------

  it('fires callback at correct interval for list-sparklines', () => {
    const calls: PollingContext[] = [];
    scheduler.start('list-sparklines', (ctx) => {
      calls.push(ctx);
    });
    clock.advance(29_999);
    expect(calls).toHaveLength(0);
    clock.advance(1);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe('list-sparklines');
  });

  it('fires callback at correct interval for metrics-tab', () => {
    const calls: PollingContext[] = [];
    scheduler.start('metrics-tab', (ctx) => {
      calls.push(ctx);
    });
    clock.advance(10_000);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe('metrics-tab');
  });

  it('fires callback at correct interval for dashboard', () => {
    const calls: PollingContext[] = [];
    scheduler.start('dashboard', (ctx) => {
      calls.push(ctx);
    });
    clock.advance(60_000);
    expect(calls).toHaveLength(1);
  });

  it('fires callback at correct interval for kafka-lag', () => {
    const calls: PollingContext[] = [];
    scheduler.start('kafka-lag', (ctx) => {
      calls.push(ctx);
    });
    clock.advance(15_000);
    expect(calls).toHaveLength(1);
  });

  it('fires multiple times over multiple intervals', () => {
    const calls: PollingContext[] = [];
    scheduler.start('list-sparklines', (ctx) => {
      calls.push(ctx);
    });
    clock.advance(90_000); // 3 intervals of 30s
    expect(calls).toHaveLength(3);
  });

  // -------------------------------------------------------------------------
  // Stop
  // -------------------------------------------------------------------------

  it('stop cancels polling', () => {
    const calls: PollingContext[] = [];
    scheduler.start('list-sparklines', (ctx) => {
      calls.push(ctx);
    });
    scheduler.stop('list-sparklines');
    clock.advance(90_000);
    expect(calls).toHaveLength(0);
  });

  it('stop is idempotent when context not active', () => {
    expect(() => {
      scheduler.stop('list-sparklines');
    }).not.toThrow();
  });

  it('starting same context twice replaces the first', () => {
    const calls1: PollingContext[] = [];
    const calls2: PollingContext[] = [];
    scheduler.start('list-sparklines', () => {
      calls1.push('list-sparklines');
    });
    scheduler.start('list-sparklines', () => {
      calls2.push('list-sparklines');
    });
    clock.advance(90_000);
    expect(calls1).toHaveLength(0);
    expect(calls2).toHaveLength(3);
  });

  // -------------------------------------------------------------------------
  // Cancel handle from start()
  // -------------------------------------------------------------------------

  it('cancel handle from start() stops polling', () => {
    const calls: PollingContext[] = [];
    const cancel = scheduler.start('metrics-tab', (ctx) => {
      calls.push(ctx);
    });
    clock.advance(10_000);
    expect(calls).toHaveLength(1);
    cancel();
    clock.advance(30_000);
    expect(calls).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // stopAll
  // -------------------------------------------------------------------------

  it('stopAll stops all active contexts', () => {
    const calls: PollingContext[] = [];
    scheduler.start('list-sparklines', (ctx) => {
      calls.push(ctx);
    });
    scheduler.start('metrics-tab', (ctx) => {
      calls.push(ctx);
    });
    scheduler.stopAll();
    clock.advance(120_000);
    expect(calls).toHaveLength(0);
  });

  it('stopAll is safe when nothing is active', () => {
    expect(() => {
      scheduler.stopAll();
    }).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // isActive / activeContexts
  // -------------------------------------------------------------------------

  it('isActive returns true for started context', () => {
    scheduler.start('kafka-lag', () => {
      return;
    });
    expect(scheduler.isActive('kafka-lag')).toBe(true);
  });

  it('isActive returns false for stopped context', () => {
    scheduler.start('kafka-lag', () => {
      return;
    });
    scheduler.stop('kafka-lag');
    expect(scheduler.isActive('kafka-lag')).toBe(false);
  });

  it('isActive returns false for never-started context', () => {
    expect(scheduler.isActive('dashboard')).toBe(false);
  });

  it('activeContexts returns all active contexts', () => {
    scheduler.start('list-sparklines', () => {
      return;
    });
    scheduler.start('kafka-lag', () => {
      return;
    });
    const active = scheduler.activeContexts();
    expect(active.has('list-sparklines')).toBe(true);
    expect(active.has('kafka-lag')).toBe(true);
    expect(active.has('metrics-tab')).toBe(false);
    expect(active.has('dashboard')).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Off-screen: not polled (no registration → no callbacks)
  // -------------------------------------------------------------------------

  it('off-screen resources are not polled when no context registered', () => {
    const calls: string[] = [];
    // Intentionally do NOT call start()
    clock.advance(300_000); // 5 minutes
    expect(calls).toHaveLength(0);
  });
});
