/**
 * TTY boundary (Spec 01 §3.5, Spec 08 §5.1). The terminal seam for both the Ink
 * render target (output) and the custom Input Layer (raw byte input + mouse
 * protocol control). Production wraps the real stdin/stdout; tests use a
 * captured stream pair driven by scripted key/mouse byte sequences.
 */
export interface Tty {
  /** Subscribe to raw input bytes from stdin. Returns an unsubscribe fn. */
  onData(handler: (chunk: string) => void): () => void;

  /** Write a raw control/render string to stdout. */
  write(data: string): void;

  /** Current terminal size in character cells. */
  size(): TerminalSize;

  /** Subscribe to resize (SIGWINCH) events. Returns an unsubscribe fn. */
  onResize(handler: (size: TerminalSize) => void): () => void;

  /** Enter/leave raw mode (no line buffering, no echo). */
  setRawMode(raw: boolean): void;

  /**
   * Suspend the TTY for exec handover (Spec 05 §4.3): disable mouse reporting,
   * leave raw mode, restore a normal terminal. `resume()` reverses it.
   */
  suspend(): void;
  resume(): void;
}

export interface TerminalSize {
  columns: number;
  rows: number;
}
