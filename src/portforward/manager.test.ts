import { describe, it, expect, beforeEach } from 'vitest';
import { PortForwardManager } from './manager.js';
import { FakeProcessRunner } from '../boundaries/process-runner.fake.js';
import { FakeLifecycle } from '../boundaries/lifecycle.fake.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function noop(): void {
  return;
}

const DEFAULT_PARAMS = {
  podName: 'order-api-7d9f-xk2p',
  namespace: 'default',
  remotePort: 8080,
  localPort: 8080,
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let runner: FakeProcessRunner;
let lifecycle: FakeLifecycle;
let manager: PortForwardManager;

beforeEach(() => {
  runner = new FakeProcessRunner();
  lifecycle = new FakeLifecycle();
  manager = new PortForwardManager(runner, lifecycle);
});

// ---------------------------------------------------------------------------
// Spawning
// ---------------------------------------------------------------------------

describe('start()', () => {
  it('spawns kubectl port-forward with correct args', () => {
    manager.start(DEFAULT_PARAMS);
    const handle = runner.last();
    expect(handle.command).toBe('kubectl');
    expect(handle.args).toEqual([
      'port-forward',
      'pod/order-api-7d9f-xk2p',
      '8080:8080',
      '-n',
      'default',
    ]);
  });

  it('returns an id string', () => {
    const id = manager.start(DEFAULT_PARAMS);
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('forward starts in starting state', () => {
    manager.start(DEFAULT_PARAMS);
    const { forwards } = manager.getState();
    expect(forwards).toHaveLength(1);
    expect(forwards[0]?.status).toBe('starting');
  });

  it('transitions to active on Forwarding from stdout', () => {
    manager.start(DEFAULT_PARAMS);
    runner.last().pushStdout('Forwarding from 127.0.0.1:8080 -> 8080');
    const { forwards } = manager.getState();
    expect(forwards[0]?.status).toBe('active');
  });

  it('does not transition to active on unrelated stdout', () => {
    manager.start(DEFAULT_PARAMS);
    runner.last().pushStdout('some other output');
    expect(manager.getState().forwards[0]?.status).toBe('starting');
  });

  it('transitions to failed on stderr', () => {
    manager.start(DEFAULT_PARAMS);
    runner.last().pushStderr('error: pod not found');
    const { forwards } = manager.getState();
    expect(forwards[0]?.status).toBe('failed');
    expect(forwards[0]?.failReason).toBe('error: pod not found');
  });

  it('transitions to failed on exit with non-null code', () => {
    manager.start(DEFAULT_PARAMS);
    runner.last().finish(1);
    const { forwards } = manager.getState();
    expect(forwards[0]?.status).toBe('failed');
    expect(forwards[0]?.failReason).toBe('exited with code 1');
  });

  it('transitions to failed on exit with null code (terminated)', () => {
    manager.start(DEFAULT_PARAMS);
    runner.last().finish(null);
    const { forwards } = manager.getState();
    expect(forwards[0]?.status).toBe('failed');
    expect(forwards[0]?.failReason).toBe('terminated');
  });

  it('does not re-fail an already-failed forward on exit', () => {
    manager.start(DEFAULT_PARAMS);
    runner.last().pushStderr('error: pod not found');
    const reasonBefore = manager.getState().forwards[0]?.failReason;
    runner.last().finish(1);
    const reasonAfter = manager.getState().forwards[0]?.failReason;
    // The reason stays the same (the first stderr message)
    expect(reasonAfter).toBe(reasonBefore);
  });

  it('assigns unique ids to multiple forwards', () => {
    const id1 = manager.start(DEFAULT_PARAMS);
    const id2 = manager.start({
      ...DEFAULT_PARAMS,
      remotePort: 9090,
      localPort: 9090,
    });
    expect(id1).not.toBe(id2);
  });
});

// ---------------------------------------------------------------------------
// activeCount
// ---------------------------------------------------------------------------

describe('activeCount', () => {
  it('is 0 with no forwards', () => {
    expect(manager.activeCount).toBe(0);
  });

  it('counts starting forwards', () => {
    manager.start(DEFAULT_PARAMS);
    expect(manager.activeCount).toBe(1);
  });

  it('counts active forwards', () => {
    manager.start(DEFAULT_PARAMS);
    runner.last().pushStdout('Forwarding from 127.0.0.1:8080 -> 8080');
    expect(manager.activeCount).toBe(1);
  });

  it('does not count failed forwards', () => {
    manager.start(DEFAULT_PARAMS);
    runner.last().pushStderr('error');
    expect(manager.activeCount).toBe(0);
  });

  it('counts multiple active forwards', () => {
    manager.start(DEFAULT_PARAMS);
    manager.start({ ...DEFAULT_PARAMS, remotePort: 9090, localPort: 9090 });
    runner.spawned[0]?.pushStdout('Forwarding from 127.0.0.1:8080 -> 8080');
    runner.spawned[1]?.pushStdout('Forwarding from 127.0.0.1:9090 -> 9090');
    expect(manager.activeCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// stop()
// ---------------------------------------------------------------------------

describe('stop()', () => {
  it('removes the forward from state', () => {
    const id = manager.start(DEFAULT_PARAMS);
    manager.stop(id);
    expect(manager.getState().forwards).toHaveLength(0);
  });

  it('terminates the subprocess', () => {
    const id = manager.start(DEFAULT_PARAMS);
    manager.stop(id);
    expect(runner.last().terminated).toBe(true);
  });

  it('does nothing for unknown id', () => {
    manager.stop('unknown-id');
    expect(manager.getState().forwards).toHaveLength(0);
  });

  it('does not terminate if already exited', () => {
    const id = manager.start(DEFAULT_PARAMS);
    runner.last().finish(0);
    manager.stop(id);
    // No error — the handle says not running, so terminate is not called again
    expect(manager.getState().forwards).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// retry()
// ---------------------------------------------------------------------------

describe('retry()', () => {
  it('spawns a new subprocess with the same params', () => {
    const id = manager.start(DEFAULT_PARAMS);
    runner.last().pushStderr('error');
    const newId = manager.retry(id);
    expect(newId).toBeDefined();
    expect(runner.spawned).toHaveLength(2);
    const newHandle = runner.last();
    expect(newHandle.args).toEqual([
      'port-forward',
      'pod/order-api-7d9f-xk2p',
      '8080:8080',
      '-n',
      'default',
    ]);
  });

  it('returns undefined for unknown id', () => {
    const result = manager.retry('unknown-id');
    expect(result).toBeUndefined();
  });

  it('removes the old forward entry', () => {
    const id = manager.start(DEFAULT_PARAMS);
    runner.last().pushStderr('error');
    manager.retry(id);
    const { forwards } = manager.getState();
    // Only the new one should exist
    expect(forwards).toHaveLength(1);
    expect(forwards[0]?.status).toBe('starting');
  });
});

// ---------------------------------------------------------------------------
// Guard branches — stale handle events after removal
// ---------------------------------------------------------------------------

describe('stale handle events after removal', () => {
  it('ignores stdout from a stopped forward (updateStatus guard)', () => {
    const id = manager.start(DEFAULT_PARAMS);
    const handle = runner.last();
    manager.stop(id);
    // Now push stdout to the handle whose entry was already removed
    // — should not throw, and no entry reappears
    handle.pushStdout('Forwarding from 127.0.0.1:8080 -> 8080');
    expect(manager.getState().forwards).toHaveLength(0);
  });

  it('ignores stderr from a stopped forward (setFailed guard)', () => {
    const id = manager.start(DEFAULT_PARAMS);
    const handle = runner.last();
    manager.stop(id);
    handle.pushStderr('error: pod not found');
    expect(manager.getState().forwards).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Recents
// ---------------------------------------------------------------------------

describe('recents', () => {
  it('adds to recents when forward goes active', () => {
    manager.start(DEFAULT_PARAMS);
    runner.last().pushStdout('Forwarding from 127.0.0.1:8080 -> 8080');
    const { recents } = manager.getState();
    expect(recents).toHaveLength(1);
    expect(recents[0]?.podName).toBe('order-api-7d9f-xk2p');
  });

  it('does not add to recents while still starting', () => {
    manager.start(DEFAULT_PARAMS);
    expect(manager.getState().recents).toHaveLength(0);
  });

  it('de-duplicates recents on second activation of same params', () => {
    manager.start(DEFAULT_PARAMS);
    runner.last().pushStdout('Forwarding from 127.0.0.1:8080 -> 8080');
    manager.start(DEFAULT_PARAMS);
    runner.last().pushStdout('Forwarding from 127.0.0.1:8080 -> 8080');
    expect(manager.getState().recents).toHaveLength(1);
  });

  it('caps recents at 10', () => {
    for (let i = 0; i < 12; i++) {
      manager.start({
        ...DEFAULT_PARAMS,
        remotePort: 8000 + i,
        localPort: 8000 + i,
      });
      runner.last().pushStdout('Forwarding from 127.0.0.1:8080 -> 8080');
    }
    expect(manager.getState().recents).toHaveLength(10);
  });

  it('most recent is first in the list', () => {
    manager.start(DEFAULT_PARAMS);
    runner.last().pushStdout('Forwarding from 127.0.0.1:8080 -> 8080');
    manager.start({ ...DEFAULT_PARAMS, remotePort: 9090, localPort: 9090 });
    runner.last().pushStdout('Forwarding from 127.0.0.1:9090 -> 9090');
    const { recents } = manager.getState();
    expect(recents[0]?.remotePort).toBe(9090);
    expect(recents[1]?.remotePort).toBe(8080);
  });
});

// ---------------------------------------------------------------------------
// Lifecycle / SIGTERM cleanup
// ---------------------------------------------------------------------------

describe('lifecycle cleanup', () => {
  it('terminates all running subprocesses on SIGTERM', () => {
    manager.start(DEFAULT_PARAMS);
    manager.start({ ...DEFAULT_PARAMS, remotePort: 9090, localPort: 9090 });
    lifecycle.emitSignal('SIGTERM');
    expect(runner.spawned[0]?.terminated).toBe(true);
    expect(runner.spawned[1]?.terminated).toBe(true);
  });

  it('terminates all running subprocesses on SIGINT', () => {
    manager.start(DEFAULT_PARAMS);
    lifecycle.emitSignal('SIGINT');
    expect(runner.last().terminated).toBe(true);
  });

  it('does not double-terminate already-exited processes', () => {
    manager.start(DEFAULT_PARAMS);
    runner.last().finish(0);
    // Should not throw
    lifecycle.emitSignal('SIGTERM');
  });
});

// ---------------------------------------------------------------------------
// onChange subscription
// ---------------------------------------------------------------------------

describe('onChange()', () => {
  it('calls handler when a forward is added', () => {
    let callCount = 0;
    manager.onChange(() => {
      callCount++;
    });
    manager.start(DEFAULT_PARAMS);
    expect(callCount).toBe(1);
  });

  it('calls handler when status changes', () => {
    let callCount = 0;
    manager.onChange(() => {
      callCount++;
    });
    manager.start(DEFAULT_PARAMS);
    callCount = 0;
    runner.last().pushStdout('Forwarding from 127.0.0.1:8080 -> 8080');
    expect(callCount).toBe(1);
  });

  it('calls handler when forward is stopped', () => {
    const id = manager.start(DEFAULT_PARAMS);
    let callCount = 0;
    manager.onChange(() => {
      callCount++;
    });
    manager.stop(id);
    expect(callCount).toBe(1);
  });

  it('unsubscribe prevents further notifications', () => {
    let callCount = 0;
    const unsub = manager.onChange(() => {
      callCount++;
    });
    manager.start(DEFAULT_PARAMS);
    expect(callCount).toBe(1);
    unsub();
    manager.start({ ...DEFAULT_PARAMS, remotePort: 9090, localPort: 9090 });
    expect(callCount).toBe(1);
  });

  it('multiple handlers all receive notifications', () => {
    let a = 0;
    let b = 0;
    manager.onChange(() => {
      a++;
    });
    manager.onChange(() => {
      b++;
    });
    manager.start(DEFAULT_PARAMS);
    expect(a).toBe(1);
    expect(b).toBe(1);
  });

  it('noop onChange still compiles and runs', () => {
    const unsub = manager.onChange(noop);
    manager.start(DEFAULT_PARAMS);
    unsub();
  });
});

// ---------------------------------------------------------------------------
// getState snapshot
// ---------------------------------------------------------------------------

describe('getState()', () => {
  it('returns empty state initially', () => {
    const state = manager.getState();
    expect(state.forwards).toHaveLength(0);
    expect(state.recents).toHaveLength(0);
  });

  it('returns immutable-ish snapshots (arrays are copies)', () => {
    manager.start(DEFAULT_PARAMS);
    const state1 = manager.getState();
    manager.start({ ...DEFAULT_PARAMS, remotePort: 9090, localPort: 9090 });
    const state2 = manager.getState();
    expect(state1.forwards).toHaveLength(1);
    expect(state2.forwards).toHaveLength(2);
  });

  it('includes pod name, namespace, ports', () => {
    manager.start(DEFAULT_PARAMS);
    const { forwards } = manager.getState();
    const fwd = forwards[0];
    expect(fwd?.podName).toBe('order-api-7d9f-xk2p');
    expect(fwd?.namespace).toBe('default');
    expect(fwd?.remotePort).toBe(8080);
    expect(fwd?.localPort).toBe(8080);
  });
});
