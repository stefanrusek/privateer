/**
 * Real LogStream adapter — wraps the @kubernetes/client-node Log API (Spec 01
 * §3.1, Spec 05 §3). Contains no business logic; it splits the byte stream into
 * lines and maps SDK errors to the typed LogStream interface. Covered by
 * @envtest, not unit tests.
 */

import { Writable } from 'node:stream';
import { Log } from '@kubernetes/client-node';
import type { KubeConfig } from '@kubernetes/client-node';
import type {
  LogStream,
  LogTailOptions,
  LogTailHandlers,
  LogTailSubscription,
  LogStreamError,
} from '../boundaries/log-stream.js';

function mapError(e: unknown): LogStreamError {
  if (e !== null && typeof e === 'object' && 'statusCode' in e) {
    const status = (e as { statusCode: number }).statusCode;
    const body = (e as { body?: { message?: string } }).body;
    const message =
      body?.message ?? (e instanceof Error ? e.message : 'unknown error');
    if (status === 401 || status === 403) {
      return { kind: 'forbidden', message };
    }
    if (status === 404) {
      return { kind: 'notFound', message };
    }
    return { kind: 'network', message };
  }
  const message = e instanceof Error ? e.message : String(e);
  return { kind: 'network', message };
}

/** A Writable that buffers bytes and emits complete newline-delimited lines. */
class LineSplitter extends Writable {
  private buffer = '';

  constructor(private readonly onLine: (line: string) => void) {
    super();
  }

  override _write(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.buffer += chunk.toString('utf8');
    let newlineIndex = this.buffer.indexOf('\n');
    while (newlineIndex !== -1) {
      const line = this.buffer.slice(0, newlineIndex);
      this.buffer = this.buffer.slice(newlineIndex + 1);
      this.onLine(line);
      newlineIndex = this.buffer.indexOf('\n');
    }
    callback();
  }
}

export class LogStreamAdapter implements LogStream {
  private readonly log: Log;

  constructor(config: KubeConfig) {
    this.log = new Log(config);
  }

  tail(
    options: LogTailOptions,
    handlers: LogTailHandlers,
  ): LogTailSubscription {
    const splitter = new LineSplitter(handlers.onLine);
    let aborter: AbortController | undefined;
    let cancelled = false;

    this.log
      .log(options.namespace, options.pod, options.container, splitter, {
        follow: true,
        timestamps: false,
        previous: options.previous ?? false,
        ...(options.tailLines !== undefined
          ? { tailLines: options.tailLines }
          : {}),
        ...(options.sinceSeconds !== undefined
          ? { sinceSeconds: options.sinceSeconds }
          : {}),
      })
      .then((controller) => {
        if (cancelled) {
          controller.abort();
          return;
        }
        aborter = controller;
      })
      .catch((e: unknown) => {
        handlers.onError(mapError(e));
      });

    return () => {
      cancelled = true;
      if (aborter !== undefined) {
        aborter.abort();
      }
    };
  }
}
