import { describe, it, expect, vi, afterEach } from 'vitest';
import { InMemoryFileSink } from '../boundaries/config-store.fake.js';
import { err } from '../core/result.js';
import type { FileSink, FileSinkError } from '../boundaries/config-store.js';
import type { Result } from '../core/result.js';
import {
  resolveCommand,
  loadHistory,
  appendHistory,
  CommandInput,
  DEFAULT_COMMAND,
  MAX_HISTORY,
  EXEC_HISTORY_PATH,
  homeDir,
} from './command-history.js';

/** A FileSink whose appendLine and write always fail. */
class FailingSink extends InMemoryFileSink implements FileSink {
  override appendLine(
    _path: string,
    _line: string,
  ): Promise<Result<void, FileSinkError>> {
    return Promise.resolve(
      err({ kind: 'writeError' as const, message: 'append failed' }),
    );
  }

  override write(
    _path: string,
    _contents: string,
  ): Promise<Result<void, FileSinkError>> {
    return Promise.resolve(
      err({ kind: 'writeError' as const, message: 'write failed' }),
    );
  }
}

describe('resolveCommand', () => {
  it('returns the trimmed input when non-empty', () => {
    expect(resolveCommand('/bin/sh')).toBe('/bin/sh');
    expect(resolveCommand('  python3  ')).toBe('python3');
  });

  it('returns the default command for empty or whitespace-only input', () => {
    expect(resolveCommand('')).toBe(DEFAULT_COMMAND);
    expect(resolveCommand('   ')).toBe(DEFAULT_COMMAND);
  });
});

describe('homeDir', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns process.env.HOME when set', () => {
    vi.stubEnv('HOME', '/custom/home');
    expect(homeDir()).toBe('/custom/home');
  });

  it('returns ~ when HOME is not set', () => {
    // HOME is an empty string — the ?? branch fires when value is undefined,
    // not empty; simulate absence by deleting after stubbing.
    vi.unstubAllEnvs();
    const saved = process.env.HOME;
    delete process.env.HOME;
    try {
      expect(homeDir()).toBe('~');
    } finally {
      if (saved !== undefined) {
        process.env.HOME = saved;
      }
    }
  });
});

describe('loadHistory', () => {
  it('returns an empty array when the file does not exist', async () => {
    const sink = new InMemoryFileSink();
    expect(await loadHistory(sink)).toEqual([]);
  });

  it('parses newline-separated lines from the file', async () => {
    const sink = new InMemoryFileSink();
    await sink.write(EXEC_HISTORY_PATH, 'python3\n/bin/sh\n');
    expect(await loadHistory(sink)).toEqual(['python3', '/bin/sh']);
  });

  it('returns at most MAX_HISTORY entries (tail-trimmed)', async () => {
    const sink = new InMemoryFileSink();
    const lines = Array.from({ length: 12 }, (_, i) => `cmd${String(i + 1)}`);
    await sink.write(EXEC_HISTORY_PATH, lines.join('\n') + '\n');
    const history = await loadHistory(sink);
    expect(history).toHaveLength(MAX_HISTORY);
    expect(history[history.length - 1]).toBe('cmd12');
  });
});

describe('appendHistory', () => {
  it('appends a new command to an empty history', async () => {
    const sink = new InMemoryFileSink();
    await appendHistory(sink, '/bin/sh');
    const lines = await loadHistory(sink);
    expect(lines).toContain('/bin/sh');
  });

  it('does not duplicate consecutive identical commands', async () => {
    const sink = new InMemoryFileSink();
    await appendHistory(sink, '/bin/sh');
    await appendHistory(sink, '/bin/sh');
    const lines = await loadHistory(sink);
    expect(lines.filter((l) => l === '/bin/sh')).toHaveLength(1);
  });

  it('allows the same command again after a different command', async () => {
    const sink = new InMemoryFileSink();
    await appendHistory(sink, '/bin/sh');
    await appendHistory(sink, 'python3');
    await appendHistory(sink, '/bin/sh');
    const lines = await loadHistory(sink);
    expect(lines).toEqual(['/bin/sh', 'python3', '/bin/sh']);
  });

  it('trims to at most MAX_HISTORY entries when capacity is exceeded', async () => {
    const sink = new InMemoryFileSink();
    for (let i = 1; i <= MAX_HISTORY + 1; i++) {
      await appendHistory(sink, `cmd${String(i)}`);
    }
    const lines = await loadHistory(sink);
    expect(lines).toHaveLength(MAX_HISTORY);
    expect(lines[lines.length - 1]).toBe(`cmd${String(MAX_HISTORY + 1)}`);
  });

  it('returns an error when appendLine fails (fast path)', async () => {
    const sink = new FailingSink();
    const result = await appendHistory(sink, '/bin/sh');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('writeError');
      expect(result.error.message).toBe('append failed');
    }
  });

  it('returns an error when write fails (full rewrite path)', async () => {
    // Pre-fill with MAX_HISTORY entries so the next append triggers a full rewrite
    const baseSink = new InMemoryFileSink();
    for (let i = 1; i <= MAX_HISTORY; i++) {
      await baseSink.appendLine(EXEC_HISTORY_PATH, `cmd${String(i)}`);
    }
    // Wrap: read succeeds (from base), write/appendLine fails
    const hybrid: FileSink = {
      read: (path) => baseSink.read(path),
      write: () =>
        Promise.resolve(
          err({ kind: 'writeError' as const, message: 'write failed' }),
        ),
      appendLine: () =>
        Promise.resolve(
          err({ kind: 'writeError' as const, message: 'append failed' }),
        ),
    };
    const result = await appendHistory(hybrid, 'new-cmd');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('writeError');
    }
  });
});

describe('CommandInput', () => {
  it('returns the live buffer value by default', () => {
    const input = new CommandInput([], 'hello');
    expect(input.value).toBe('hello');
  });

  it('up with no history is a no-op', () => {
    const input = new CommandInput([], '');
    input.up();
    expect(input.value).toBe('');
  });

  it('up cycles to the most recent history entry first', () => {
    const input = new CommandInput(['python3', '/bin/sh'], '');
    input.up();
    expect(input.value).toBe('/bin/sh');
  });

  it('up twice goes one further back', () => {
    const input = new CommandInput(['python3', '/bin/sh'], '');
    input.up();
    input.up();
    expect(input.value).toBe('python3');
  });

  it('up stops at the oldest entry', () => {
    const input = new CommandInput(['python3'], '');
    input.up();
    input.up(); // already at oldest, no-op
    expect(input.value).toBe('python3');
  });

  it('down after up returns to the live buffer', () => {
    const input = new CommandInput(['python3', '/bin/sh'], 'draft');
    input.up();
    input.down();
    expect(input.value).toBe('draft');
  });

  it('down with cursor at -1 is a no-op', () => {
    const input = new CommandInput(['python3'], 'draft');
    input.down();
    expect(input.value).toBe('draft');
  });

  it('down from deeper in history goes toward the live buffer', () => {
    const input = new CommandInput(['python3', '/bin/sh'], '');
    input.up();
    input.up();
    input.down();
    expect(input.value).toBe('/bin/sh');
  });

  it('setBuffer updates the live value and resets the cursor', () => {
    const input = new CommandInput(['python3'], '');
    input.up();
    input.setBuffer('new-value');
    expect(input.value).toBe('new-value');
    // Pressing down should be a no-op after setBuffer (cursor reset)
    input.down();
    expect(input.value).toBe('new-value');
  });

  it('historyLength reflects the number of loaded entries', () => {
    const input = new CommandInput(['a', 'b', 'c']);
    expect(input.historyLength).toBe(3);
  });

  it('entryAt falls back to DEFAULT_COMMAND for an out-of-bounds index', () => {
    const input = new CommandInput(['python3']);
    // Index 99 is out of bounds; the noUncheckedIndexedAccess guard fires.
    expect(input.entryAt(99)).toBe(DEFAULT_COMMAND);
  });

  it('entryAt returns the entry for a valid in-bounds index', () => {
    const input = new CommandInput(['python3', '/bin/sh']);
    expect(input.entryAt(0)).toBe('python3');
    expect(input.entryAt(1)).toBe('/bin/sh');
  });
});
