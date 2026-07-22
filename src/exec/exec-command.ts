/**
 * Pure helpers for building `kubectl exec` invocations and classifying
 * failures (Spec 05 §4.3, P9R-0005). All I/O (spawning kubectl, journaling,
 * UI feedback) lives in the thin adapter (`src/adapters/live/controller.ts`);
 * this module holds the decidable logic so it can be fully unit-tested.
 */

/** Shell tried first when the user accepts the default exec command. */
export const DEFAULT_SHELL = '/bin/bash';

/** Shell retried automatically when {@link DEFAULT_SHELL} is unavailable. */
export const FALLBACK_SHELL = '/bin/sh';

/**
 * Build the argv passed to `kubectl` for an exec session. The default shell
 * (and its fallback) is executed directly so a missing binary produces a
 * clean, attributable OCI runtime error; a user-entered command is run
 * through `sh -c` so shell syntax (pipes, args, quoting) keeps working.
 */
export function buildKubectlExecArgs(
  namespace: string,
  podName: string,
  container: string,
  command: string,
  isDefaultShell: boolean,
): string[] {
  const base = ['exec', '-it', '-n', namespace, podName, '-c', container, '--'];
  return isDefaultShell ? [...base, command] : [...base, 'sh', '-c', command];
}

/** Matches the OCI runtime's "executable file not found" diagnostic. */
const NOT_FOUND_PATTERN = /executable file not found/i;

/** Matches `exec: "<name>": executable file not found` to pull out the name. */
const MISSING_EXECUTABLE_PATTERN =
  /exec:\s*"([^"]+)":\s*executable file not found/i;

/**
 * True when kubectl's stderr indicates the requested command/shell does not
 * exist in the container (exit code 127 from the OCI runtime).
 */
export function isCommandNotFoundError(stderr: string): boolean {
  return NOT_FOUND_PATTERN.test(stderr);
}

/** Pulls the missing executable's name out of a "not found" stderr, if present. */
export function extractMissingExecutable(stderr: string): string | undefined {
  return MISSING_EXECUTABLE_PATTERN.exec(stderr)?.[1];
}

/**
 * Render kubectl's stderr into a short, user-facing failure message. Used
 * both for the status-bar toast and the debug.log entry.
 */
export function describeExecFailure(stderr: string): string {
  const trimmed = stderr.trim();
  const missing = extractMissingExecutable(trimmed);
  if (missing !== undefined) {
    return `exec failed: "${missing}" not found in container — try a different command`;
  }
  const newlineIndex = trimmed.indexOf('\n');
  const firstLineRaw =
    newlineIndex === -1 ? trimmed : trimmed.slice(0, newlineIndex);
  const firstLine = firstLineRaw.replace(/^error:\s*/i, '').trim();
  return `exec failed: ${firstLine.length > 0 ? firstLine : 'unknown error'}`;
}

/**
 * Render the exec-prompt command-bar line (P9R-0005 follow-up: a toast
 * fired alongside the reopened prompt was invisible — the prompt occludes
 * the toast's line the instant it reopens). When a failure is pending it is
 * folded into the same line the prompt already owns, so the user sees it
 * the moment the prompt reappears instead of a toast that never renders.
 */
export function formatExecPromptLine(
  resourceName: string,
  shownCommand: string,
  defaultCommand: string,
  pendingError: string | null,
): string {
  const base = `exec ${resourceName} ▸ ${shownCommand.length > 0 ? shownCommand : defaultCommand} (↑ history)`;
  return pendingError === null ? base : `✗ ${pendingError} — ${base}`;
}
