import type {
  LogStream,
  LogTailOptions,
  LogTailHandlers,
  LogTailSubscription,
  LogStreamError,
} from './log-stream.js';

interface OpenTail {
  options: LogTailOptions;
  handlers: LogTailHandlers;
  closed: boolean;
}

/**
 * In-memory LogStream for tests. Each `tail` is recorded so tests can drive
 * lines and errors into a specific open stream and assert how it was opened
 * (container, tailLines, sinceSeconds, previous). Closing a stream prevents
 * further delivery.
 */
export class FakeLogStream implements LogStream {
  private tails: OpenTail[] = [];

  tail(
    options: LogTailOptions,
    handlers: LogTailHandlers,
  ): LogTailSubscription {
    const entry: OpenTail = { options, handlers, closed: false };
    this.tails.push(entry);
    return () => {
      entry.closed = true;
    };
  }

  // ---- test-driving helpers -------------------------------------------------

  /** Number of `tail` calls made so far. */
  get tailCount(): number {
    return this.tails.length;
  }

  /** Options the stream at `index` was opened with, or undefined. */
  optionsAt(index: number): LogTailOptions | undefined {
    return this.tails[index]?.options;
  }

  /** Whether the stream at `index` has been closed. */
  isClosed(index: number): boolean {
    return this.tails[index]?.closed ?? true;
  }

  /** The most recently opened (and not-yet-superseded) stream's options. */
  lastOptions(): LogTailOptions | undefined {
    return this.tails[this.tails.length - 1]?.options;
  }

  /** Deliver a line to the stream at `index` (ignored if closed/missing). */
  emitLine(index: number, line: string): void {
    const entry = this.tails[index];
    if (entry === undefined || entry.closed) {
      return;
    }
    entry.handlers.onLine(line);
  }

  /** Deliver many lines to the stream at `index`, in order. */
  emitLines(index: number, lines: readonly string[]): void {
    for (const line of lines) {
      this.emitLine(index, line);
    }
  }

  /** Deliver an error to the stream at `index` (ignored if closed/missing). */
  emitError(index: number, error: LogStreamError): void {
    const entry = this.tails[index];
    if (entry === undefined || entry.closed) {
      return;
    }
    entry.closed = true;
    entry.handlers.onError(error);
  }
}
