import type { ProcessRunner, ProcessHandle } from './process-runner.js';

/**
 * A scriptable process handle. Implements the `ProcessHandle` contract and adds
 * test-driving methods to push output and resolve exit.
 */
export class FakeProcessHandle implements ProcessHandle {
  readonly command: string;
  readonly args: readonly string[];
  terminated = false;
  private exited = false;
  private stdoutHandlers: ((line: string) => void)[] = [];
  private stderrHandlers: ((line: string) => void)[] = [];
  private exitHandlers: ((code: number | null) => void)[] = [];

  constructor(command: string, args: readonly string[]) {
    this.command = command;
    this.args = args;
  }

  get running(): boolean {
    return !this.exited;
  }

  onStdout(handler: (line: string) => void): void {
    this.stdoutHandlers.push(handler);
  }

  onStderr(handler: (line: string) => void): void {
    this.stderrHandlers.push(handler);
  }

  onExit(handler: (code: number | null) => void): void {
    this.exitHandlers.push(handler);
  }

  terminate(): void {
    this.terminated = true;
    this.finish(null);
  }

  // ---- test-driving helpers -------------------------------------------------

  pushStdout(line: string): void {
    for (const handler of this.stdoutHandlers) {
      handler(line);
    }
  }

  pushStderr(line: string): void {
    for (const handler of this.stderrHandlers) {
      handler(line);
    }
  }

  /** Resolve the process exit once; subsequent calls are ignored. */
  finish(code: number | null): void {
    if (this.exited) {
      return;
    }
    this.exited = true;
    for (const handler of this.exitHandlers) {
      handler(code);
    }
  }
}

/** Records spawned processes and hands back scriptable handles. */
export class FakeProcessRunner implements ProcessRunner {
  readonly spawned: FakeProcessHandle[] = [];

  spawn(command: string, args: readonly string[]): ProcessHandle {
    const handle = new FakeProcessHandle(command, args);
    this.spawned.push(handle);
    return handle;
  }

  /** The most recently spawned handle, for convenience in tests. */
  last(): FakeProcessHandle {
    const handle = this.spawned.at(-1);
    if (handle === undefined) {
      throw new Error('no process has been spawned');
    }
    return handle;
  }
}
