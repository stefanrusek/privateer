import type { Tty, TerminalSize } from './tty.js';

/**
 * Captured TTY stream pair for tests (Spec 08 §5.1). Records every write,
 * tracks raw/suspend state, and lets tests push scripted key/mouse byte
 * sequences and resize events.
 */
export class CapturedTty implements Tty {
  readonly writes: string[] = [];
  rawMode = false;
  suspended = false;
  private terminalSize: TerminalSize;
  private dataHandlers = new Set<(chunk: string) => void>();
  private resizeHandlers = new Set<(size: TerminalSize) => void>();

  constructor(size: TerminalSize = { columns: 80, rows: 24 }) {
    this.terminalSize = size;
  }

  onData(handler: (chunk: string) => void): () => void {
    this.dataHandlers.add(handler);
    return () => {
      this.dataHandlers.delete(handler);
    };
  }

  write(data: string): void {
    this.writes.push(data);
  }

  size(): TerminalSize {
    return this.terminalSize;
  }

  onResize(handler: (size: TerminalSize) => void): () => void {
    this.resizeHandlers.add(handler);
    return () => {
      this.resizeHandlers.delete(handler);
    };
  }

  setRawMode(raw: boolean): void {
    this.rawMode = raw;
  }

  suspend(): void {
    this.suspended = true;
  }

  resume(): void {
    this.suspended = false;
  }

  // ---- test-driving helpers -------------------------------------------------

  /** Push raw input bytes to all data subscribers. */
  pushInput(chunk: string): void {
    for (const handler of this.dataHandlers) {
      handler(chunk);
    }
  }

  /** Resize the terminal, notifying subscribers (SIGWINCH). */
  resize(size: TerminalSize): void {
    this.terminalSize = size;
    for (const handler of this.resizeHandlers) {
      handler(size);
    }
  }

  /** All output concatenated — convenient for frame assertions. */
  output(): string {
    return this.writes.join('');
  }
}
