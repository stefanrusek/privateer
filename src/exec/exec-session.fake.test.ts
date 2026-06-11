import { describe, it, expect, vi } from 'vitest';
import { FakeExecSession } from './exec-session.fake.js';

describe('FakeExecSession', () => {
  it('records writes', () => {
    const session = new FakeExecSession();
    session.write('hello');
    session.write('world');
    expect(session.writes).toEqual(['hello', 'world']);
  });

  it('records resize calls', () => {
    const session = new FakeExecSession();
    session.resize(120, 40);
    session.resize(80, 24);
    expect(session.resizes).toEqual([
      { cols: 120, rows: 40 },
      { cols: 80, rows: 24 },
    ]);
  });

  it('close marks the session closed', () => {
    const session = new FakeExecSession();
    expect(session.closed).toBe(false);
    session.close();
    expect(session.closed).toBe(true);
  });

  it('delivers pushed data to onData subscribers and stops after unsubscribe', () => {
    const session = new FakeExecSession();
    const handler = vi.fn();
    const off = session.onData(handler);
    session.pushData('abc');
    expect(handler).toHaveBeenCalledWith('abc');
    off();
    session.pushData('def');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('emitClose calls onClose with no reason', () => {
    const session = new FakeExecSession();
    const handler = vi.fn();
    session.onClose(handler);
    session.emitClose();
    expect(handler).toHaveBeenCalledWith(undefined);
  });

  it('emitDrop calls onClose with a reason string', () => {
    const session = new FakeExecSession();
    const handler = vi.fn();
    session.onClose(handler);
    session.emitDrop('connection reset');
    expect(handler).toHaveBeenCalledWith('connection reset');
  });

  it('onClose unsubscribes cleanly', () => {
    const session = new FakeExecSession();
    const handler = vi.fn();
    const off = session.onClose(handler);
    off();
    session.emitClose();
    expect(handler).not.toHaveBeenCalled();
  });
});
