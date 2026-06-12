import { describe, it, expect, vi } from 'vitest';
import { FakeClock } from './clock.fake.js';

describe('FakeClock', () => {
  it('starts at 0 by default and reports the configured start', () => {
    expect(new FakeClock().now()).toBe(0);
    expect(new FakeClock(1000).now()).toBe(1000);
  });

  it('advances wall-clock time', () => {
    const clock = new FakeClock(100);
    clock.advance(50);
    expect(clock.now()).toBe(150);
  });

  it('fires a timeout exactly when its delay elapses', () => {
    const clock = new FakeClock();
    const cb = vi.fn();
    clock.setTimeout(cb, 100);
    clock.advance(99);
    expect(cb).not.toHaveBeenCalled();
    clock.advance(1);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('does not fire a cancelled timeout', () => {
    const clock = new FakeClock();
    const cb = vi.fn();
    const cancel = clock.setTimeout(cb, 100);
    cancel();
    clock.advance(200);
    expect(cb).not.toHaveBeenCalled();
    expect(clock.pendingCount()).toBe(0);
  });

  it('cancel is idempotent', () => {
    const clock = new FakeClock();
    const cancel = clock.setTimeout(vi.fn(), 100);
    cancel();
    expect(() => {
      cancel();
    }).not.toThrow();
  });

  it('removes a one-shot timeout from the pending set after firing', () => {
    const clock = new FakeClock();
    clock.setTimeout(vi.fn(), 10);
    clock.advance(10);
    expect(clock.pendingCount()).toBe(0);
  });

  it('re-arms an interval for repeated ticks', () => {
    const clock = new FakeClock();
    const cb = vi.fn();
    clock.setInterval(cb, 100);
    clock.advance(350);
    expect(cb).toHaveBeenCalledTimes(3);
    expect(clock.pendingCount()).toBe(1);
  });

  it('stops an interval when cancelled', () => {
    const clock = new FakeClock();
    const cb = vi.fn();
    const cancel = clock.setInterval(cb, 100);
    clock.advance(150);
    cancel();
    clock.advance(500);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('fires multiple due tasks in chronological order', () => {
    const clock = new FakeClock();
    const order: string[] = [];
    clock.setTimeout(() => order.push('late'), 200);
    clock.setTimeout(() => order.push('early'), 100);
    clock.advance(300);
    expect(order).toEqual(['early', 'late']);
  });

  it('leaves time at the advance target even when nothing is due', () => {
    const clock = new FakeClock();
    clock.setTimeout(vi.fn(), 1000);
    clock.advance(10);
    expect(clock.now()).toBe(10);
    expect(clock.pendingCount()).toBe(1);
  });
});
