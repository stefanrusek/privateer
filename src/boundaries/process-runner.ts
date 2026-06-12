/**
 * ProcessRunner boundary (Spec 01 §10 OQ-2, Spec 05 §5.6, Spec 08 §5.1).
 * Subprocess management for `kubectl port-forward`. The production adapter uses
 * `Bun.spawn`; `FakeProcessRunner` scripts lifecycle, output, and exit codes.
 */
export interface ProcessRunner {
  /** Spawn a subprocess and return a handle to observe and control it. */
  spawn(command: string, args: readonly string[]): ProcessHandle;
}

export interface ProcessHandle {
  /** Subscribe to stdout lines (e.g. port-forward ready detection). */
  onStdout(handler: (line: string) => void): void;
  /** Subscribe to stderr lines (failure detection). */
  onStderr(handler: (line: string) => void): void;
  /** Subscribe to process exit. Fires once. */
  onExit(handler: (code: number | null) => void): void;
  /** Send SIGTERM (clean shutdown on quit — Spec 05 §5.6). */
  terminate(): void;
  /** True until the process has exited. */
  readonly running: boolean;
}
