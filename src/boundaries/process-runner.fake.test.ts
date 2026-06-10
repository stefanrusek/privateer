import { describe, it, expect, vi } from 'vitest';
import { FakeProcessRunner } from './process-runner.fake.js';

describe('FakeProcessRunner', () => {
  it('records spawned commands and exposes the last handle', () => {
    const runner = new FakeProcessRunner();
    runner.spawn('kubectl', ['port-forward', 'pod/a', '8080:8080']);
    expect(runner.spawned).toHaveLength(1);
    expect(runner.last().command).toBe('kubectl');
    expect(runner.last().args).toContain('port-forward');
  });

  it('throws when asking for the last handle with nothing spawned', () => {
    expect(() => new FakeProcessRunner().last()).toThrow('no process');
  });

  it('delivers stdout and stderr to subscribers', () => {
    const runner = new FakeProcessRunner();
    const handle = runner.spawn('kubectl', []);
    const out = vi.fn();
    const errOut = vi.fn();
    handle.onStdout(out);
    handle.onStderr(errOut);
    runner.last().pushStdout('Forwarding from 127.0.0.1:8080');
    runner.last().pushStderr('error: unable to forward');
    expect(out).toHaveBeenCalledWith('Forwarding from 127.0.0.1:8080');
    expect(errOut).toHaveBeenCalledWith('error: unable to forward');
  });

  it('is running until it exits, then reports the exit code once', () => {
    const runner = new FakeProcessRunner();
    const handle = runner.spawn('kubectl', []);
    const onExit = vi.fn();
    handle.onExit(onExit);
    expect(handle.running).toBe(true);
    runner.last().finish(0);
    expect(handle.running).toBe(false);
    runner.last().finish(1);
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(onExit).toHaveBeenCalledWith(0);
  });

  it('terminate sends a null-code exit and marks the handle terminated', () => {
    const runner = new FakeProcessRunner();
    const handle = runner.spawn('kubectl', []);
    const onExit = vi.fn();
    handle.onExit(onExit);
    handle.terminate();
    expect(runner.last().terminated).toBe(true);
    expect(onExit).toHaveBeenCalledWith(null);
    expect(handle.running).toBe(false);
  });
});
