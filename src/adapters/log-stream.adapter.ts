/**
 * Real LogStream adapter — streams pod logs straight off the kube-apiserver
 * over node:https (Spec 01 §3.1, Spec 05 §3). The @kubernetes/client-node Log
 * API drops the TLS agent under Bun's fetch, so we reuse the same request
 * plumbing as the KubeClientAdapter. Contains no business logic; it splits the
 * byte stream into lines and maps errors to the typed LogStream interface.
 */

import https from 'node:https';
import type { KubeConfig } from '@kubernetes/client-node';
import type {
  LogStream,
  LogTailOptions,
  LogTailHandlers,
  LogTailSubscription,
  LogStreamError,
} from '../boundaries/log-stream.js';
import { buildKubeRequestOptions } from './kube-client.adapter.js';

function mapStatus(status: number, message: string): LogStreamError {
  if (status === 401 || status === 403) {
    return { kind: 'forbidden', message };
  }
  if (status === 404) {
    return { kind: 'notFound', message };
  }
  return { kind: 'network', message };
}

export class LogStreamAdapter implements LogStream {
  private readonly kc: KubeConfig;

  constructor(config: KubeConfig) {
    this.kc = config;
  }

  tail(
    options: LogTailOptions,
    handlers: LogTailHandlers,
  ): LogTailSubscription {
    const params = new URLSearchParams();
    params.set('follow', 'true');
    params.set('container', options.container);
    // Always request timestamps; the view layer strips the prefix when the
    // timestamps toggle is off.
    params.set('timestamps', 'true');
    if (options.previous === true) {
      params.set('previous', 'true');
    }
    if (options.tailLines !== undefined) {
      params.set('tailLines', String(options.tailLines));
    }
    if (options.sinceSeconds !== undefined) {
      params.set('sinceSeconds', String(options.sinceSeconds));
    }

    let closed = false;
    const isClosed = (): boolean => closed;
    let destroyRequest: (() => void) | null = null;

    void (async () => {
      try {
        const server = this.kc.getCurrentCluster()?.server ?? '';
        const path = `/api/v1/namespaces/${options.namespace}/pods/${options.pod}/log`;
        const url = `${server}${path}?${params.toString()}`;
        const reqOpts = await buildKubeRequestOptions(this.kc, 'GET', url);

        const req = https.request(reqOpts, (res) => {
          if (res.statusCode !== undefined && res.statusCode >= 300) {
            const chunks: Buffer[] = [];
            res.on('data', (c: Buffer) => chunks.push(c));
            res.on('end', () => {
              if (isClosed()) {
                return;
              }
              let message = `log request failed with status ${String(res.statusCode)}`;
              try {
                const parsed = JSON.parse(Buffer.concat(chunks).toString()) as {
                  message?: string;
                };
                message = parsed.message ?? message;
              } catch {
                // keep default message
              }
              handlers.onError(mapStatus(res.statusCode ?? 0, message));
            });
            return;
          }

          let buffer = '';
          res.on('data', (chunk: Buffer) => {
            buffer += chunk.toString('utf8');
            let newline = buffer.indexOf('\n');
            while (newline >= 0) {
              const line = buffer.slice(0, newline);
              buffer = buffer.slice(newline + 1);
              newline = buffer.indexOf('\n');
              handlers.onLine(line);
            }
          });
          res.on('end', () => {
            if (!isClosed()) {
              handlers.onError({ kind: 'closed', message: 'stream ended' });
            }
          });
          res.on('error', (e: Error) => {
            if (!isClosed()) {
              handlers.onError({ kind: 'network', message: e.message });
            }
          });
        });

        req.on('error', (e: Error) => {
          if (!isClosed()) {
            handlers.onError({ kind: 'network', message: e.message });
          }
        });
        req.end();
        destroyRequest = (): void => {
          req.destroy();
        };
        if (isClosed()) {
          req.destroy();
        }
      } catch (e) {
        if (!isClosed()) {
          const message = e instanceof Error ? e.message : String(e);
          handlers.onError({ kind: 'network', message });
        }
      }
    })();

    return () => {
      closed = true;
      destroyRequest?.();
    };
  }
}
