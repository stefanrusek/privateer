import type { Result } from '../core/result.js';

/**
 * ConfigStore and FileSink boundaries (Spec 01 §4, Spec 08 §5.1) — the
 * filesystem seam. ConfigStore loads/saves/watches `~/.config/p9r/config.yaml`;
 * FileSink writes one-shot files (log downloads, exec history). Production
 * adapters use `fs`; tests use in-memory implementations.
 */
export interface ConfigStore {
  /** Read and parse the config. Missing file yields defaults, not an error. */
  load(): Promise<Result<RawConfig, ConfigError>>;

  /** Persist a (partial) config change, merging into the existing file. */
  save(patch: RawConfig): Promise<Result<void, ConfigError>>;

  /**
   * Watch the config file for external edits and hot-reload (Spec 01 §4).
   * Returns an unwatch function.
   */
  watch(handler: (config: RawConfig) => void): () => void;
}

/** Untyped parsed config; the typed schema lives in the config layer. */
export type RawConfig = Record<string, unknown>;

export interface ConfigError {
  kind: 'parseError' | 'writeError';
  message: string;
}

export interface FileSink {
  /** Write `contents` to `path`, creating parent directories as needed. */
  write(path: string, contents: string): Promise<Result<void, FileSinkError>>;

  /** Append a line (exec history — Spec 05 §4.2). */
  appendLine(path: string, line: string): Promise<Result<void, FileSinkError>>;

  /** Read a file's contents, or notFound. */
  read(path: string): Promise<Result<string, FileSinkError>>;
}

export interface FileSinkError {
  kind: 'notFound' | 'writeError';
  message: string;
}
