// Adversarial tests for the alternate-screen-restore invariant (P9R-0013):
// every exit/suspend path leaves the alternate screen and shows the cursor,
// and teardown is idempotent.
//
// `src/adapters/**` is coverage-excluded, so these run for correctness but do
// not count toward the 100% bar; the pure control strings they assert on are
// covered in `src/input/screen.test.ts`.

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  ENTER_ALT_SCREEN,
  LEAVE_ALT_SCREEN,
  SHOW_CURSOR,
} from '../../input/screen.js';
import {
  ScreenLifecycle,
  installScreenExitGuards,
} from './screen-lifecycle.js';

describe('ScreenLifecycle', () => {
  it('enable() writes ENTER_ALT_SCREEN once', () => {
    const writes: string[] = [];
    const life = new ScreenLifecycle((s) => writes.push(s));
    life.enable();
    life.enable();
    expect(writes).toEqual([ENTER_ALT_SCREEN]);
  });

  it('tearDown() leaves the alternate screen and shows the cursor', () => {
    const writes: string[] = [];
    const life = new ScreenLifecycle((s) => writes.push(s));
    life.enable();
    life.tearDown();
    expect(writes).toEqual([ENTER_ALT_SCREEN, LEAVE_ALT_SCREEN + SHOW_CURSOR]);
  });

  it('tearDown() is idempotent — a double teardown restores at most once', () => {
    const writes: string[] = [];
    const life = new ScreenLifecycle((s) => writes.push(s));
    life.enable();
    life.tearDown();
    life.tearDown();
    life.tearDown();
    expect(
      writes.filter((w) => w === LEAVE_ALT_SCREEN + SHOW_CURSOR),
    ).toHaveLength(1);
  });

  it('tears down even when never entered (crash before enable)', () => {
    const writes: string[] = [];
    const life = new ScreenLifecycle((s) => writes.push(s));
    life.tearDown();
    expect(writes).toEqual([LEAVE_ALT_SCREEN + SHOW_CURSOR]);
  });

  it('re-enters after a teardown (exec handover returns)', () => {
    const writes: string[] = [];
    const life = new ScreenLifecycle((s) => writes.push(s));
    life.enable();
    life.tearDown(); // suspend for the handover
    life.enable(); // back from the external process
    life.tearDown(); // quit
    expect(writes).toEqual([
      ENTER_ALT_SCREEN,
      LEAVE_ALT_SCREEN + SHOW_CURSOR,
      ENTER_ALT_SCREEN,
      LEAVE_ALT_SCREEN + SHOW_CURSOR,
    ]);
  });
});

describe('installScreenExitGuards', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('tears down on process "exit"', () => {
    const writes: string[] = [];
    const life = new ScreenLifecycle((s) => writes.push(s));
    life.enable();
    const dispose = installScreenExitGuards(life);
    process.emit('exit', 0);
    dispose();
    expect(writes).toContain(LEAVE_ALT_SCREEN + SHOW_CURSOR);
  });

  it('tears down and re-raises on SIGINT (Ctrl-C)', () => {
    const writes: string[] = [];
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true);
    const life = new ScreenLifecycle((s) => writes.push(s));
    life.enable();
    const dispose = installScreenExitGuards(life);
    process.emit('SIGINT', 'SIGINT');
    expect(writes).toContain(LEAVE_ALT_SCREEN + SHOW_CURSOR);
    expect(kill).toHaveBeenCalledWith(process.pid, 'SIGINT');
    dispose();
  });

  it('tears down and re-raises on SIGTERM (kill)', () => {
    const writes: string[] = [];
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true);
    const life = new ScreenLifecycle((s) => writes.push(s));
    life.enable();
    const dispose = installScreenExitGuards(life);
    process.emit('SIGTERM', 'SIGTERM');
    expect(writes).toContain(LEAVE_ALT_SCREEN + SHOW_CURSOR);
    expect(kill).toHaveBeenCalledWith(process.pid, 'SIGTERM');
    dispose();
  });

  it('tears down, prints, and exits on an uncaught exception', () => {
    const writes: string[] = [];
    const life = new ScreenLifecycle((s) => writes.push(s));
    life.enable();
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);
    const dispose = installScreenExitGuards(life);
    const err = new Error('boom');
    process.emit('uncaughtException', err);
    expect(writes).toContain(LEAVE_ALT_SCREEN + SHOW_CURSOR);
    expect(errorSpy).toHaveBeenCalledWith(err);
    expect(exitSpy).toHaveBeenCalledWith(1);
    dispose();
  });

  it('the disposer removes the handlers (no teardown after dispose)', () => {
    const writes: string[] = [];
    const life = new ScreenLifecycle((s) => writes.push(s));
    const dispose = installScreenExitGuards(life);
    dispose();
    process.emit('exit', 0);
    expect(writes).not.toContain(LEAVE_ALT_SCREEN + SHOW_CURSOR);
  });
});
