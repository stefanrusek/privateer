// Thin production adapters for the time / lifecycle / filesystem / subprocess /
// TTY boundaries. Covered structurally by exclusion (Spec 08 §5.2) — no logic
// lives here, only translation to Node/Bun primitives.
import { spawn } from 'node:child_process';
import {
  mkdirSync,
  appendFileSync,
  writeFileSync,
  readFileSync,
  existsSync,
  watch as fsWatch,
} from 'node:fs';
import { dirname } from 'node:path';
import { load as parseYaml } from 'js-yaml';
import type { Clock, CancelHandle } from '../boundaries/clock.js';
import type { Lifecycle, TerminationSignal } from '../boundaries/lifecycle.js';
import type {
  ProcessRunner,
  ProcessHandle,
} from '../boundaries/process-runner.js';
import type {
  ConfigStore,
  RawConfig,
  ConfigError,
  FileSink,
  FileSinkError,
} from '../boundaries/config-store.js';
import { type Result, ok, err } from '../core/result.js';

export class SystemClock implements Clock {
  now(): number {
    return Date.now();
  }
  setTimeout(callback: () => void, delayMs: number): CancelHandle {
    const handle = setTimeout(callback, delayMs);
    return () => {
      clearTimeout(handle);
    };
  }
  setInterval(callback: () => void, intervalMs: number): CancelHandle {
    const handle = setInterval(callback, intervalMs);
    return () => {
      clearInterval(handle);
    };
  }
}

export class SystemLifecycle implements Lifecycle {
  exit(code = 0): void {
    process.exit(code);
  }
  onSignal(handler: (signal: TerminationSignal) => void): () => void {
    const onInt = (): void => {
      handler('SIGINT');
    };
    const onTerm = (): void => {
      handler('SIGTERM');
    };
    process.on('SIGINT', onInt);
    process.on('SIGTERM', onTerm);
    return () => {
      process.off('SIGINT', onInt);
      process.off('SIGTERM', onTerm);
    };
  }
}

export class SubprocessRunner implements ProcessRunner {
  spawn(command: string, args: readonly string[]): ProcessHandle {
    const child = spawn(command, [...args]);
    let running = true;
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    return {
      get running(): boolean {
        return running;
      },
      onStdout(h: (line: string) => void): void {
        child.stdout.on('data', (d: string) => {
          h(d);
        });
      },
      onStderr(h: (line: string) => void): void {
        child.stderr.on('data', (d: string) => {
          h(d);
        });
      },
      onExit(h: (code: number | null) => void): void {
        child.on('exit', (code) => {
          running = false;
          h(code);
        });
      },
      terminate(): void {
        child.kill('SIGTERM');
      },
    };
  }
}

export class FsFileSink implements FileSink {
  write(path: string, contents: string): Promise<Result<void, FileSinkError>> {
    try {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, contents);
      return Promise.resolve(ok(undefined));
    } catch (e) {
      return Promise.resolve(err({ kind: 'writeError', message: String(e) }));
    }
  }
  appendLine(path: string, line: string): Promise<Result<void, FileSinkError>> {
    try {
      mkdirSync(dirname(path), { recursive: true });
      appendFileSync(path, `${line}\n`);
      return Promise.resolve(ok(undefined));
    } catch (e) {
      return Promise.resolve(err({ kind: 'writeError', message: String(e) }));
    }
  }
  read(path: string): Promise<Result<string, FileSinkError>> {
    if (!existsSync(path)) {
      return Promise.resolve(err({ kind: 'notFound', message: path }));
    }
    return Promise.resolve(ok(readFileSync(path, 'utf8')));
  }
}

export class FsConfigStore implements ConfigStore {
  constructor(private readonly path: string) {}
  load(): Promise<Result<RawConfig, ConfigError>> {
    try {
      if (!existsSync(this.path)) {
        return Promise.resolve(ok({}));
      }
      const parsed = parseYaml(readFileSync(this.path, 'utf8'));
      const record =
        typeof parsed === 'object' && parsed !== null
          ? (parsed as RawConfig)
          : {};
      return Promise.resolve(ok(record));
    } catch (e) {
      return Promise.resolve(err({ kind: 'parseError', message: String(e) }));
    }
  }
  save(): Promise<Result<void, ConfigError>> {
    return Promise.resolve(ok(undefined));
  }
  watch(handler: (config: RawConfig) => void): () => void {
    if (!existsSync(this.path)) {
      return () => undefined;
    }
    const watcher = fsWatch(this.path, () => {
      void this.load().then((r) => {
        if (r.ok) {
          handler(r.value);
        }
      });
    });
    return () => {
      watcher.close();
    };
  }
}
