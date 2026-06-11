/**
 * LogStream boundary (Spec 01 §3.1, Spec 05 §3). The single seam to pod log
 * streaming. The production adapter wraps the `@kubernetes/client-node` Log
 * API; `FakeLogStream` replays scripted lines in tests.
 *
 * `tail` opens a follow stream: each log line is delivered to `onLine`, stream
 * errors to `onError`, and the returned handle closes the stream. No business
 * logic lives here — colorization, buffering, search, and the picker all live
 * behind this seam in `src/logs`.
 */

export interface LogTailOptions {
  /** Namespace of the pod. */
  namespace: string;
  /** Pod name. */
  pod: string;
  /** Container name within the pod. */
  container: string;
  /** Max lines to retrieve before following, or undefined for all. */
  tailLines?: number;
  /** Only return logs newer than this many seconds, or undefined. */
  sinceSeconds?: number;
  /** Read the previous terminated instance's logs (Spec 05 §3.3). */
  previous?: boolean;
}

export interface LogTailHandlers {
  /** Called once per log line, in arrival order, newline-stripped. */
  onLine: (line: string) => void;
  /** Called when the stream fails. After this the stream is closed. */
  onError: (error: LogStreamError) => void;
}

/** Closes an open log stream. Idempotent. */
export type LogTailSubscription = () => void;

export interface LogStreamError {
  kind: 'network' | 'forbidden' | 'notFound' | 'closed';
  message: string;
}

export interface LogStream {
  /**
   * Open a follow stream for a pod container. Lines are delivered to
   * `handlers.onLine`; the returned subscription stops the stream.
   */
  tail(options: LogTailOptions, handlers: LogTailHandlers): LogTailSubscription;
}
