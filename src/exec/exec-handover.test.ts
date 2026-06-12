import { describe, it, expect } from 'vitest';
import { CapturedTty } from '../boundaries/tty.fake.js';
import { FakeExecSession } from './exec-session.fake.js';
import { startExecHandover } from './exec-handover.js';

function setup(): { tty: CapturedTty; session: FakeExecSession } {
  const tty = new CapturedTty({ columns: 80, rows: 24 });
  const session = new FakeExecSession();
  return { tty, session };
}

describe('startExecHandover', () => {
  it('suspends the TTY immediately on start', () => {
    const { tty, session } = setup();
    expect(tty.suspended).toBe(false);
    startExecHandover({ tty, session });
    expect(tty.suspended).toBe(true);
  });

  it('sends initial terminal size to the session', () => {
    const { tty, session } = setup();
    startExecHandover({ tty, session });
    expect(session.resizes).toEqual([{ cols: 80, rows: 24 }]);
  });

  it('forwards TTY input to the session', () => {
    const { tty, session } = setup();
    startExecHandover({ tty, session });
    tty.pushInput('ls\r');
    expect(session.writes).toEqual(['ls\r']);
  });

  it('forwards session output to the TTY', () => {
    const { tty, session } = setup();
    startExecHandover({ tty, session });
    session.pushData('hello from shell');
    expect(tty.writes).toContain('hello from shell');
  });

  it('forwards resize events to the session', () => {
    const { tty, session } = setup();
    startExecHandover({ tty, session });
    // Clear the initial resize recorded during start
    session.resizes.length = 0;
    tty.resize({ columns: 120, rows: 40 });
    expect(session.resizes).toEqual([{ cols: 120, rows: 40 }]);
  });

  it('resumes the TTY on clean session close', () => {
    const { tty, session } = setup();
    startExecHandover({ tty, session });
    expect(tty.suspended).toBe(true);
    session.emitClose();
    expect(tty.suspended).toBe(false);
  });

  it('does not write a notice on clean session close', () => {
    const { tty, session } = setup();
    startExecHandover({ tty, session });
    const writesBefore = tty.writes.length;
    session.emitClose();
    const newWrites = tty.writes.slice(writesBefore);
    const notice = newWrites.find((w) => w.includes('connection dropped'));
    expect(notice).toBeUndefined();
  });

  it('writes a drop notice and resumes the TTY on connection drop', () => {
    const { tty, session } = setup();
    startExecHandover({ tty, session });
    session.emitDrop('connection reset');
    expect(tty.output()).toContain('connection reset');
    expect(tty.suspended).toBe(false);
  });

  it('resumes only once even if teardown is called multiple times', () => {
    const { tty, session } = setup();
    const teardown = startExecHandover({ tty, session });
    session.emitClose();
    // Calling teardown again should be a no-op
    teardown();
    expect(tty.suspended).toBe(false);
  });

  it('stops forwarding input after teardown', () => {
    const { tty, session } = setup();
    const teardown = startExecHandover({ tty, session });
    teardown();
    session.writes.length = 0;
    tty.pushInput('should-not-arrive');
    expect(session.writes).toHaveLength(0);
  });

  it('stops forwarding resize after teardown', () => {
    const { tty, session } = setup();
    const teardown = startExecHandover({ tty, session });
    teardown();
    session.resizes.length = 0;
    tty.resize({ columns: 200, rows: 50 });
    expect(session.resizes).toHaveLength(0);
  });

  it('calls session.close during teardown', () => {
    const { tty, session } = setup();
    const teardown = startExecHandover({ tty, session });
    teardown();
    expect(session.closed).toBe(true);
  });
});
