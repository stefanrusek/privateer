/**
 * Lifecycle boundary (Spec 08 §5.1). Process exit and OS signal handling are
 * requests to this injected object rather than direct `process.exit()` calls,
 * so the 100%-coverage rule never forces an untestable exit. The real adapter
 * calls `process.exit` / registers signal handlers; `main.ts` is the only place
 * it is constructed.
 */
export interface Lifecycle {
  /** Request process termination with the given exit code (default 0). */
  exit(code?: number): void;

  /**
   * Register a handler to run when the process receives a termination signal
   * (SIGINT/SIGTERM). Used to tear down kubectl port-forward subprocesses and
   * disable mouse reporting before exit (Spec 05 §5.6, Spec 01 §3.5). Returns an
   * unregister function.
   */
  onSignal(handler: (signal: TerminationSignal) => void): () => void;
}

export type TerminationSignal = 'SIGINT' | 'SIGTERM';
