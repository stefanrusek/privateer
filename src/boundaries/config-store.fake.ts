import { type Result, ok, err } from '../core/result.js';
import type {
  ConfigStore,
  RawConfig,
  ConfigError,
  FileSink,
  FileSinkError,
} from './config-store.js';

/** In-memory ConfigStore. Supports driving an external-edit hot-reload. */
export class InMemoryConfigStore implements ConfigStore {
  private config: RawConfig;
  private watchers = new Set<(config: RawConfig) => void>();
  private parseError = false;

  constructor(initial: RawConfig = {}) {
    this.config = initial;
  }

  load(): Promise<Result<RawConfig, ConfigError>> {
    if (this.parseError) {
      return Promise.resolve(
        err({ kind: 'parseError', message: 'invalid yaml' }),
      );
    }
    return Promise.resolve(ok({ ...this.config }));
  }

  save(patch: RawConfig): Promise<Result<void, ConfigError>> {
    this.config = { ...this.config, ...patch };
    return Promise.resolve(ok(undefined));
  }

  watch(handler: (config: RawConfig) => void): () => void {
    this.watchers.add(handler);
    return () => {
      this.watchers.delete(handler);
    };
  }

  // ---- test-driving helpers -------------------------------------------------

  /** Simulate an external edit, notifying watchers (Spec 01 §4 hot-reload). */
  externalEdit(patch: RawConfig): void {
    this.config = { ...this.config, ...patch };
    for (const handler of this.watchers) {
      handler({ ...this.config });
    }
  }

  failNextLoad(): void {
    this.parseError = true;
  }
}

/** In-memory FileSink (log downloads, exec history). */
export class InMemoryFileSink implements FileSink {
  readonly files = new Map<string, string>();

  write(path: string, contents: string): Promise<Result<void, FileSinkError>> {
    this.files.set(path, contents);
    return Promise.resolve(ok(undefined));
  }

  appendLine(path: string, line: string): Promise<Result<void, FileSinkError>> {
    const existing = this.files.get(path);
    this.files.set(
      path,
      existing === undefined ? `${line}\n` : `${existing}${line}\n`,
    );
    return Promise.resolve(ok(undefined));
  }

  read(path: string): Promise<Result<string, FileSinkError>> {
    const contents = this.files.get(path);
    if (contents === undefined) {
      return Promise.resolve(
        err({ kind: 'notFound', message: `${path} not found` }),
      );
    }
    return Promise.resolve(ok(contents));
  }
}
