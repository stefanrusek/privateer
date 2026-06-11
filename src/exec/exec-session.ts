/**
 * ExecSession boundary (Spec 05 §4.3). Represents a single live exec
 * connection to a container. Production adapter wraps the Kubernetes Exec
 * WebSocket; tests use the in-memory fake below.
 */
export interface ExecSession {
  /** Send raw bytes to the remote shell's stdin. */
  write(data: string): void;

  /** Subscribe to raw bytes from the remote shell's stdout/stderr. */
  onData(handler: (data: string) => void): () => void;

  /**
   * Subscribe to session close. `reason` is undefined on a clean exit; a
   * string describing the connection error on a drop.
   */
  onClose(handler: (reason?: string) => void): () => void;

  /** Notify the remote PTY of a terminal resize. */
  resize(cols: number, rows: number): void;

  /** Forcibly close the session (e.g. on TUI teardown). */
  close(): void;
}
