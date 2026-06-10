import { describe, it, expect, vi } from 'vitest';
import { CapturedTty } from './tty.fake.js';

describe('CapturedTty', () => {
  it('records writes and concatenates output', () => {
    const tty = new CapturedTty();
    tty.write('a');
    tty.write('b');
    expect(tty.writes).toEqual(['a', 'b']);
    expect(tty.output()).toBe('ab');
  });

  it('reports a default and configured size', () => {
    expect(new CapturedTty().size()).toEqual({ columns: 80, rows: 24 });
    expect(new CapturedTty({ columns: 120, rows: 40 }).size()).toEqual({
      columns: 120,
      rows: 40,
    });
  });

  it('delivers pushed input to subscribers and stops after unsubscribe', () => {
    const tty = new CapturedTty();
    const handler = vi.fn();
    const off = tty.onData(handler);
    tty.pushInput('\x1b[A');
    expect(handler).toHaveBeenCalledWith('\x1b[A');
    off();
    tty.pushInput('x');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('notifies resize subscribers and updates the reported size', () => {
    const tty = new CapturedTty();
    const handler = vi.fn();
    const off = tty.onResize(handler);
    tty.resize({ columns: 100, rows: 30 });
    expect(handler).toHaveBeenCalledWith({ columns: 100, rows: 30 });
    expect(tty.size()).toEqual({ columns: 100, rows: 30 });
    off();
    tty.resize({ columns: 1, rows: 1 });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('tracks raw mode and suspend/resume state', () => {
    const tty = new CapturedTty();
    expect(tty.rawMode).toBe(false);
    tty.setRawMode(true);
    expect(tty.rawMode).toBe(true);
    tty.suspend();
    expect(tty.suspended).toBe(true);
    tty.resume();
    expect(tty.suspended).toBe(false);
  });
});
