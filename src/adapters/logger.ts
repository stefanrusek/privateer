/**
 * Diagnostic logger (coverage-excluded glue). pino writing newline-delimited
 * JSON to ~/.config/p9r/debug.log — never stdout/stderr, which belong to the
 * Ink renderer.
 *
 * Levels: warnings and errors (stream drops, agent failures, tunnel
 * failures) are always journaled so problems can be diagnosed after the
 * fact; `P9R_DEBUG` (any value) enables debug-level tracing (stream events,
 * agent rounds, tool calls, engine timing).
 *
 * The file is truncated when it exceeds ~5MB at startup — a session journal,
 * not an archive. Pretty-print with: `npx pino-pretty < ~/.config/p9r/debug.log`
 */
import { mkdirSync, statSync, truncateSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pino, destination, type Logger } from 'pino';

const MAX_LOG_BYTES = 5 * 1024 * 1024;

function logPath(): string {
  return join(homedir(), '.config', 'p9r', 'debug.log');
}

function createLogger(): Logger {
  try {
    mkdirSync(join(homedir(), '.config', 'p9r'), { recursive: true });
    try {
      if (statSync(logPath()).size > MAX_LOG_BYTES) {
        truncateSync(logPath(), 0);
      }
    } catch {
      // No file yet — fine.
    }
    return pino(
      {
        level: process.env.P9R_DEBUG !== undefined ? 'debug' : 'warn',
        base: { pid: process.pid },
      },
      // Synchronous destination: plain fs writes, safe under Bun (no worker
      // transports), flushed even on abrupt exits.
      destination({ dest: logPath(), sync: true, append: true }),
    );
  } catch {
    // Unwritable config dir — log nowhere rather than corrupt the TUI.
    return pino({ level: 'silent' });
  }
}

/** Process-wide diagnostic logger. */
export const log: Logger = createLogger();
