// Adversarial tests for THE mouse-teardown invariant (chunk 04 B04a,
// principle #7): every exit/suspend path hard-disables all mouse modes, and
// teardown is idempotent. A leaked escape sequence corrupts the user's shell,
// so one happy-path test is not enough — we prove each path here.
//
// `src/adapters/**` is coverage-excluded, so these run for correctness but do
// not count toward the 100% bar; the pure mode strings they assert on are
// covered in `src/input/mouse.test.ts`.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { MOUSE_DISABLE, MOUSE_ENABLE } from '../../input/mouse.js';
import { MouseLifecycle, installMouseExitGuards } from './mouse-lifecycle.js';

describe('MouseLifecycle', () => {
  it('enable() writes MOUSE_ENABLE once', () => {
    const writes: string[] = [];
    const life = new MouseLifecycle((s) => writes.push(s));
    life.enable();
    life.enable();
    expect(writes).toEqual([MOUSE_ENABLE]);
  });

  it('tearDown() writes MOUSE_DISABLE (every mode off)', () => {
    const writes: string[] = [];
    const life = new MouseLifecycle((s) => writes.push(s));
    life.enable();
    life.tearDown();
    expect(writes).toEqual([MOUSE_ENABLE, MOUSE_DISABLE]);
  });

  it('tearDown() is idempotent — a double teardown disables at most once', () => {
    const writes: string[] = [];
    const life = new MouseLifecycle((s) => writes.push(s));
    life.enable();
    life.tearDown();
    life.tearDown();
    life.tearDown();
    expect(writes.filter((w) => w === MOUSE_DISABLE)).toHaveLength(1);
  });

  it('tears down even when reporting was never enabled (crash before enable)', () => {
    const writes: string[] = [];
    const life = new MouseLifecycle((s) => writes.push(s));
    life.tearDown();
    expect(writes).toEqual([MOUSE_DISABLE]);
  });

  it('re-enables after a teardown (exec handover returns)', () => {
    const writes: string[] = [];
    const life = new MouseLifecycle((s) => writes.push(s));
    life.enable();
    life.tearDown(); // suspend for the handover
    life.enable(); // back from the external process
    life.tearDown(); // quit
    expect(writes).toEqual([
      MOUSE_ENABLE,
      MOUSE_DISABLE,
      MOUSE_ENABLE,
      MOUSE_DISABLE,
    ]);
  });
});

describe('installMouseExitGuards', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('tears down on process "exit"', () => {
    const writes: string[] = [];
    const life = new MouseLifecycle((s) => writes.push(s));
    life.enable();
    const dispose = installMouseExitGuards(life);
    process.emit('exit', 0);
    dispose();
    expect(writes).toContain(MOUSE_DISABLE);
  });

  it('tears down and re-raises on SIGINT (Ctrl-C)', () => {
    const writes: string[] = [];
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true);
    const life = new MouseLifecycle((s) => writes.push(s));
    life.enable();
    const dispose = installMouseExitGuards(life);
    process.emit('SIGINT', 'SIGINT');
    expect(writes).toContain(MOUSE_DISABLE);
    expect(kill).toHaveBeenCalledWith(process.pid, 'SIGINT');
    dispose();
  });

  it('tears down and re-raises on SIGTERM (kill)', () => {
    const writes: string[] = [];
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true);
    const life = new MouseLifecycle((s) => writes.push(s));
    life.enable();
    const dispose = installMouseExitGuards(life);
    process.emit('SIGTERM', 'SIGTERM');
    expect(writes).toContain(MOUSE_DISABLE);
    expect(kill).toHaveBeenCalledWith(process.pid, 'SIGTERM');
    dispose();
  });

  it('the disposer removes the handlers (no teardown after dispose)', () => {
    const writes: string[] = [];
    const life = new MouseLifecycle((s) => writes.push(s));
    const dispose = installMouseExitGuards(life);
    dispose();
    process.emit('exit', 0);
    expect(writes).not.toContain(MOUSE_DISABLE);
  });
});
