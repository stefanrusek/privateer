import type { ExecSession } from './exec-session.js';

/**
 * In-memory ExecSession fake for unit tests. Records all writes and resize
 * calls; lets tests push data or close events from the "remote" side.
 */
export class FakeExecSession implements ExecSession {
  /** Raw bytes sent by the orchestrator to the remote shell. */
  readonly writes: string[] = [];

  /** Resize notifications sent by the orchestrator. */
  readonly resizes: { cols: number; rows: number }[] = [];

  private dataHandlers = new Set<(data: string) => void>();
  private closeHandlers = new Set<(reason?: string) => void>();
  private _closed = false;

  get closed(): boolean {
    return this._closed;
  }

  write(data: string): void {
    this.writes.push(data);
  }

  onData(handler: (data: string) => void): () => void {
    this.dataHandlers.add(handler);
    return () => {
      this.dataHandlers.delete(handler);
    };
  }

  onClose(handler: (reason?: string) => void): () => void {
    this.closeHandlers.add(handler);
    return () => {
      this.closeHandlers.delete(handler);
    };
  }

  resize(cols: number, rows: number): void {
    this.resizes.push({ cols, rows });
  }

  close(): void {
    this._closed = true;
  }

  // ---- test-driving helpers -------------------------------------------------

  /** Push data from the "remote" shell to all data subscribers. */
  pushData(data: string): void {
    for (const handler of this.dataHandlers) {
      handler(data);
    }
  }

  /** Simulate a clean shell exit (no reason string). */
  emitClose(): void {
    for (const handler of this.closeHandlers) {
      handler(undefined);
    }
  }

  /** Simulate a connection drop with an error reason. */
  emitDrop(reason: string): void {
    for (const handler of this.closeHandlers) {
      handler(reason);
    }
  }
}
