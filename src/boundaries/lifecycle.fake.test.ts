import { describe, it, expect, vi } from 'vitest';
import { FakeLifecycle } from './lifecycle.fake.js';

describe('FakeLifecycle', () => {
  it('records exit requests with their codes', () => {
    const lifecycle = new FakeLifecycle();
    expect(lifecycle.exited).toBe(false);
    expect(lifecycle.lastExitCode).toBeNull();

    lifecycle.exit();
    lifecycle.exit(2);
    expect(lifecycle.exitCodes).toEqual([0, 2]);
    expect(lifecycle.exited).toBe(true);
    expect(lifecycle.lastExitCode).toBe(2);
  });

  it('delivers signals to all registered handlers', () => {
    const lifecycle = new FakeLifecycle();
    const a = vi.fn();
    const b = vi.fn();
    lifecycle.onSignal(a);
    lifecycle.onSignal(b);
    lifecycle.emitSignal('SIGTERM');
    expect(a).toHaveBeenCalledWith('SIGTERM');
    expect(b).toHaveBeenCalledWith('SIGTERM');
  });

  it('stops delivering to an unregistered handler', () => {
    const lifecycle = new FakeLifecycle();
    const handler = vi.fn();
    const off = lifecycle.onSignal(handler);
    off();
    lifecycle.emitSignal('SIGINT');
    expect(handler).not.toHaveBeenCalled();
  });
});
