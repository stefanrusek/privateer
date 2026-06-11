/**
 * Log download (Spec 05 §3.3 "Download"). Writes the current log buffer to
 * `~/Downloads/p9r-logs-<podname>-<container>-<timestamp>.txt` via the FileSink
 * boundary. The timestamp comes from the injected Clock (epoch ms) — never
 * `Date.now()`.
 */

import type { FileSink, FileSinkError } from '../boundaries/config-store.js';
import type { Result } from '../core/result.js';

/**
 * Format an epoch-ms instant as a filesystem-safe timestamp
 * (`YYYYMMDD-HHMMSS`, UTC). Stable and dependency-free so the filename is
 * deterministic given a Clock reading.
 */
export function formatTimestamp(nowMs: number): string {
  const d = new Date(nowMs);
  const pad = (n: number): string => String(n).padStart(2, '0');
  const year = String(d.getUTCFullYear());
  const month = pad(d.getUTCMonth() + 1);
  const day = pad(d.getUTCDate());
  const hours = pad(d.getUTCHours());
  const minutes = pad(d.getUTCMinutes());
  const seconds = pad(d.getUTCSeconds());
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

/** Build the absolute download path under the user's home directory. */
export function buildDownloadPath(
  homeDir: string,
  pod: string,
  container: string,
  nowMs: number,
): string {
  const ts = formatTimestamp(nowMs);
  return `${homeDir}/Downloads/p9r-logs-${pod}-${container}-${ts}.txt`;
}

/**
 * A short tilde-form rendering of the download path for the confirmation
 * message, e.g. `~/Downloads/p9r-logs-…`. Falls back to the full path when it
 * does not sit under `homeDir`.
 */
export function tildePath(homeDir: string, fullPath: string): string {
  if (fullPath.startsWith(`${homeDir}/`)) {
    return `~${fullPath.slice(homeDir.length)}`;
  }
  return fullPath;
}

export interface DownloadResult {
  /** The absolute path written. */
  path: string;
  /** The tilde-form path for the confirmation message. */
  displayPath: string;
}

/**
 * Write `lines` (joined by newline, trailing newline added) to the download
 * path. Returns the path on success, or the FileSink error.
 */
export async function downloadLogs(
  fileSink: FileSink,
  homeDir: string,
  pod: string,
  container: string,
  lines: readonly string[],
  nowMs: number,
): Promise<Result<DownloadResult, FileSinkError>> {
  const path = buildDownloadPath(homeDir, pod, container, nowMs);
  const contents = lines.length === 0 ? '' : `${lines.join('\n')}\n`;
  const written = await fileSink.write(path, contents);
  if (!written.ok) {
    return written;
  }
  return {
    ok: true,
    value: { path, displayPath: tildePath(homeDir, path) },
  };
}
