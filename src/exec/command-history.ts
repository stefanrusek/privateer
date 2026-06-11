import type { FileSink } from '../boundaries/config-store.js';
import type { Result } from '../core/result.js';
import { ok } from '../core/result.js';

/** Path where exec command history is persisted (Spec 05 §4.2). */
export const EXEC_HISTORY_PATH = homeDir() + '/.config/p9r/exec-history';

/** Returns the user's home directory, falling back to '~'. */
export function homeDir(): string {
  return process.env.HOME ?? '~';
}

/** Maximum number of history entries to keep. */
export const MAX_HISTORY = 10;

/** Default command used when input is empty (Spec 05 §4.2). */
export const DEFAULT_COMMAND = '/bin/bash';

/**
 * Resolve the actual command to execute. Empty or whitespace-only input
 * falls back to the default.
 */
export function resolveCommand(input: string): string {
  const trimmed = input.trim();
  return trimmed.length === 0 ? DEFAULT_COMMAND : trimmed;
}

/**
 * Load history from the FileSink. Returns at most MAX_HISTORY entries.
 * A missing file is silently treated as empty history.
 */
export async function loadHistory(sink: FileSink): Promise<string[]> {
  const result = await sink.read(EXEC_HISTORY_PATH);
  if (!result.ok) {
    return [];
  }
  const lines = result.value
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  return lines.slice(-MAX_HISTORY);
}

/**
 * Append a command to the history file, deduplifying consecutive duplicates
 * and enforcing the MAX_HISTORY cap. Rewrites the whole file when a cap/dedup
 * trim is needed; otherwise appends a single line.
 */
export async function appendHistory(
  sink: FileSink,
  command: string,
): Promise<Result<void, { kind: 'writeError'; message: string }>> {
  const existing = await loadHistory(sink);

  // Deduplicate: do not append if the most-recent entry is identical
  const last = existing[existing.length - 1];
  if (last === command) {
    return ok(undefined);
  }

  const updated = [...existing, command].slice(-MAX_HISTORY);

  if (updated.length <= existing.length + 1 && existing.length < MAX_HISTORY) {
    // Fast path: just append a line
    const appendResult = await sink.appendLine(EXEC_HISTORY_PATH, command);
    if (!appendResult.ok) {
      return {
        ok: false,
        error: { kind: 'writeError', message: appendResult.error.message },
      };
    }
    return ok(undefined);
  }

  // Full rewrite (cap trim needed)
  const contents = updated.join('\n') + '\n';
  const writeResult = await sink.write(EXEC_HISTORY_PATH, contents);
  if (!writeResult.ok) {
    return {
      ok: false,
      error: { kind: 'writeError', message: writeResult.error.message },
    };
  }
  return ok(undefined);
}

/**
 * Mutable command-input state machine tracking the current edit buffer and
 * history cursor. History is ordered oldest-first; null historyValue means
 * "not in history" (editing the live buffer).
 */
export class CommandInput {
  private _buffer: string;
  private _entries: string[];
  /** Current history entry being previewed; null when editing the live buffer. */
  private _historyValue: string | null = null;
  /** Index into _entries when browsing history; -1 means live-buffer mode. */
  private _cursor = -1;
  /** Snapshot of the live edit buffer before entering history. */
  private _editSnapshot: string;

  constructor(history: string[], initialBuffer = '') {
    this._entries = history.slice(-MAX_HISTORY);
    this._buffer = initialBuffer;
    this._editSnapshot = initialBuffer;
  }

  get value(): string {
    return this._historyValue ?? this._buffer;
  }

  get historyLength(): number {
    return this._entries.length;
  }

  /** Navigate backward (older) in history. */
  up(): void {
    if (this._entries.length === 0) {
      return;
    }
    if (this._cursor === -1) {
      this._editSnapshot = this._buffer;
      this._cursor = this._entries.length - 1;
    } else if (this._cursor > 0) {
      this._cursor--;
    }
    this._historyValue = this.entryAt(this._cursor);
  }

  /** Navigate forward (newer) in history, eventually returning to live buffer. */
  down(): void {
    if (this._cursor === -1) {
      return;
    }
    this._cursor++;
    if (this._cursor >= this._entries.length) {
      this._cursor = -1;
      this._historyValue = null;
      this._buffer = this._editSnapshot;
    } else {
      this._historyValue = this.entryAt(this._cursor);
    }
  }

  /** @internal Exposed for testing the noUncheckedIndexedAccess safety branch. */
  entryAt(index: number): string {
    const entry = this._entries[index];
    return entry ?? DEFAULT_COMMAND;
  }

  /** Update the live edit buffer (keystrokes). Exits history cursor mode. */
  setBuffer(value: string): void {
    this._cursor = -1;
    this._historyValue = null;
    this._buffer = value;
    this._editSnapshot = value;
  }
}
