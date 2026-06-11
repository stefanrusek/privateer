/**
 * Unit tests for SystemTunnel — kubectl port-forward wrapper with backoff.
 * (Spec 06 §2.2, Spec 01 OQ-2)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { SystemTunnel } from './system-tunnel.js';
import { FakeProcessRunner } from '../boundaries/process-runner.fake.js';
import { FakeClock } from '../boundaries/clock.fake.js';

const OPTIONS = {
  resource: 'service/prometheus-operated',
  namespace: 'monitoring',
  remotePort: 9090,
  localPort: 19090,
};

describe('SystemTunnel', () => {
  let runner: FakeProcessRunner;
  let clock: FakeClock;
  let tunnel: SystemTunnel;

  beforeEach(() => {
    runner = new FakeProcessRunner();
    clock = new FakeClock(0);
    tunnel = new SystemTunnel(runner, clock, OPTIONS);
  });

  // -------------------------------------------------------------------------
  // Initial state
  // -------------------------------------------------------------------------

  it('does not spawn before open() is called', () => {
    expect(runner.spawned).toHaveLength(0);
  });

  it('starts in "starting" state after open()', () => {
    tunnel.open();
    expect(tunnel.getState().status).toBe('starting');
  });

  it('spawns kubectl port-forward with correct args', () => {
    tunnel.open();
    const handle = runner.last();
    expect(handle.command).toBe('kubectl');
    expect(handle.args).toContain('port-forward');
    expect(handle.args).toContain('service/prometheus-operated');
    expect(handle.args).toContain('19090:9090');
    expect(handle.args).toContain('-n');
    expect(handle.args).toContain('monitoring');
  });

  // -------------------------------------------------------------------------
  // Ready detection from stdout
  // -------------------------------------------------------------------------

  it('transitions to active when stdout contains "Forwarding from"', () => {
    tunnel.open();
    const handle = runner.last();
    handle.pushStdout('Forwarding from 127.0.0.1:19090 -> 9090');
    expect(tunnel.getState().status).toBe('active');
  });

  it('stays starting on unrelated stdout', () => {
    tunnel.open();
    runner.last().pushStdout('Handling connection for 19090');
    expect(tunnel.getState().status).toBe('starting');
  });

  it('records stderr but does not change status immediately', () => {
    tunnel.open();
    runner.last().pushStderr('error forwarding port: some error');
    expect(tunnel.getState().failReason).toBe(
      'error forwarding port: some error',
    );
    expect(tunnel.getState().status).toBe('starting');
  });

  // -------------------------------------------------------------------------
  // Exit → failure → backoff retry
  // -------------------------------------------------------------------------

  it('sets failed status when process exits from starting', () => {
    tunnel.open();
    runner.last().finish(1);
    expect(tunnel.getState().status).toBe('failed');
  });

  it('sets failed status when process exits from active', () => {
    tunnel.open();
    runner.last().pushStdout('Forwarding from 127.0.0.1:19090 -> 9090');
    runner.last().finish(0);
    expect(tunnel.getState().status).toBe('failed');
  });

  it('records exit code as fail reason when no stderr was seen', () => {
    tunnel.open();
    runner.last().finish(1);
    expect(tunnel.getState().failReason).toBe('exited with code 1');
  });

  it('uses stderr as fail reason over exit code', () => {
    tunnel.open();
    runner.last().pushStderr('connection refused');
    runner.last().finish(1);
    expect(tunnel.getState().failReason).toBe('connection refused');
  });

  it('records "terminated" when exit code is null', () => {
    tunnel.open();
    runner.last().finish(null);
    expect(tunnel.getState().failReason).toBe('terminated');
  });

  it('schedules retry after failure with 1s first delay', () => {
    tunnel.open();
    runner.last().finish(1);
    expect(runner.spawned).toHaveLength(1);
    clock.advance(999);
    expect(runner.spawned).toHaveLength(1);
    clock.advance(1);
    expect(runner.spawned).toHaveLength(2);
  });

  it('increments retry count on each retry attempt', () => {
    tunnel.open();
    expect(tunnel.getState().retryCount).toBe(0);
    runner.last().finish(1);
    clock.advance(1_000); // first retry fires
    expect(tunnel.getState().retryCount).toBe(1);
    runner.last().finish(1);
    clock.advance(2_000); // second retry fires
    expect(tunnel.getState().retryCount).toBe(2);
  });

  it('increases backoff delay on subsequent retries', () => {
    tunnel.open();
    runner.last().finish(1); // retry 1: 1000ms
    clock.advance(1_000);
    runner.last().finish(1); // retry 2: 2000ms
    expect(runner.spawned).toHaveLength(2); // not spawned yet
    clock.advance(1_000); // only 1000ms elapsed
    expect(runner.spawned).toHaveLength(2);
    clock.advance(1_000); // 2000ms total
    expect(runner.spawned).toHaveLength(3);
  });

  it('caps backoff at 32s after many retries', () => {
    tunnel.open();
    // exhaust the backoff table: 1s,2s,4s,8s,16s,32s
    const delays = [1_000, 2_000, 4_000, 8_000, 16_000, 32_000];
    for (const delay of delays) {
      runner.last().finish(1);
      clock.advance(delay);
    }
    // now at index 6+ — should still use 32s cap
    runner.last().finish(1);
    clock.advance(31_000);
    expect(runner.spawned).toHaveLength(delays.length + 1); // not yet
    clock.advance(1_000);
    expect(runner.spawned).toHaveLength(delays.length + 2); // spawned
  });

  it('clears failReason when tunnel becomes active after retry', () => {
    tunnel.open();
    runner.last().finish(1);
    clock.advance(1_000);
    runner.last().pushStdout('Forwarding from 127.0.0.1:19090 -> 9090');
    expect(tunnel.getState().status).toBe('active');
    expect(tunnel.getState().failReason).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Change notifications
  // -------------------------------------------------------------------------

  it('fires onChange handler on status transitions', () => {
    const events: string[] = [];
    tunnel.onChange(() => {
      events.push(tunnel.getState().status);
    });
    tunnel.open();
    runner.last().pushStdout('Forwarding from 127.0.0.1:19090 -> 9090');
    runner.last().finish(1);
    expect(events).toContain('starting');
    expect(events).toContain('active');
    expect(events).toContain('failed');
  });

  it('unsubscribe stops receiving notifications', () => {
    const events: string[] = [];
    const unsub = tunnel.onChange(() => {
      events.push(tunnel.getState().status);
    });
    tunnel.open();
    unsub();
    runner.last().pushStdout('Forwarding from 127.0.0.1:19090 -> 9090');
    expect(events).toHaveLength(1); // only 'starting'
  });

  // -------------------------------------------------------------------------
  // Close — no more retries
  // -------------------------------------------------------------------------

  it('transitions to closed on close()', () => {
    tunnel.open();
    tunnel.close();
    expect(tunnel.getState().status).toBe('closed');
  });

  it('does not retry after close', () => {
    tunnel.open();
    tunnel.close();
    runner.last().finish(1);
    clock.advance(60_000);
    expect(runner.spawned).toHaveLength(1);
  });

  it('cancels pending backoff timer on close', () => {
    tunnel.open();
    runner.last().finish(1);
    tunnel.close();
    clock.advance(60_000);
    expect(runner.spawned).toHaveLength(1);
    expect(clock.pendingCount()).toBe(0);
  });

  it('ignores stdout after close', () => {
    tunnel.open();
    const handle = runner.last();
    tunnel.close();
    // Should not change status back from closed
    handle.pushStdout('Forwarding from 127.0.0.1:19090 -> 9090');
    expect(tunnel.getState().status).toBe('closed');
  });

  it('ignores stderr after close', () => {
    tunnel.open();
    const handle = runner.last();
    tunnel.close();
    // Should not update failReason from closed
    handle.pushStderr('connection refused');
    expect(tunnel.getState().status).toBe('closed');
  });

  it('ignores exit after close without retrying', () => {
    tunnel.open();
    const handle = runner.last();
    tunnel.close();
    handle.finish(1);
    clock.advance(60_000);
    expect(runner.spawned).toHaveLength(1);
    expect(tunnel.getState().status).toBe('closed');
  });

  it('open() is idempotent after close', () => {
    tunnel.open();
    tunnel.close();
    tunnel.open(); // should be a no-op
    expect(runner.spawned).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // localPort exposed
  // -------------------------------------------------------------------------

  it('exposes localPort in state', () => {
    expect(tunnel.getState().localPort).toBe(19090);
  });

  // -------------------------------------------------------------------------
  // isRunning
  // -------------------------------------------------------------------------

  it('isRunning is true after open()', () => {
    tunnel.open();
    expect(tunnel.isRunning).toBe(true);
  });

  it('isRunning is false after process exits', () => {
    tunnel.open();
    runner.last().finish(0);
    expect(tunnel.isRunning).toBe(false);
  });
});
