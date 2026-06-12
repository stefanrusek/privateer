/**
 * Real ExecSession adapter — wraps @kubernetes/client-node Exec (Spec 05 §4.3).
 * Contains no business logic; all orchestration lives in src/exec/exec-handover.ts.
 * Covered by @envtest, not unit tests.
 */

/* eslint-disable @typescript-eslint/no-unsafe-member-access -- SDK types are loose */
/* eslint-disable @typescript-eslint/no-explicit-any -- SDK types are loose */
/* eslint-disable @typescript-eslint/no-unsafe-assignment -- SDK exec() return type is untyped */
/* eslint-disable @typescript-eslint/no-unsafe-call -- SDK ws lacks typed .on() */

import * as stream from 'node:stream';
import { KubeConfig, Exec } from '@kubernetes/client-node';
import type { ExecSession } from '../exec/exec-session.js';

export class ExecSessionAdapter implements ExecSession {
  private dataHandlers = new Set<(data: string) => void>();
  private closeHandlers = new Set<(reason?: string) => void>();
  private stdoutStream: stream.PassThrough;
  private stdinStream: stream.PassThrough;
  private _closed = false;

  private constructor() {
    this.stdoutStream = new stream.PassThrough();
    this.stdinStream = new stream.PassThrough();
  }

  static async connect(
    kc: KubeConfig,
    namespace: string,
    podName: string,
    containerName: string,
    command: string[],
  ): Promise<ExecSessionAdapter> {
    const adapter = new ExecSessionAdapter();
    const exec = new Exec(kc);

    adapter.stdoutStream.on('data', (chunk: Buffer) => {
      const data = chunk.toString();
      for (const handler of adapter.dataHandlers) {
        handler(data);
      }
    });

    const ws = await exec.exec(
      namespace,
      podName,
      containerName,
      command,
      adapter.stdoutStream,
      adapter.stdoutStream,
      adapter.stdinStream,
      true, // tty
      (status: any) => {
        const reason: string | undefined =
          status?.status === 'Failure'
            ? ((status.message as string | undefined) ?? 'exec failed')
            : undefined;
        for (const handler of adapter.closeHandlers) {
          handler(reason);
        }
      },
    );

    // Forward close event from the WebSocket itself (network drop)
    (ws as any).on('close', () => {
      if (!adapter._closed) {
        adapter._closed = true;
        for (const handler of adapter.closeHandlers) {
          handler('websocket closed');
        }
      }
    });

    return adapter;
  }

  write(data: string): void {
    this.stdinStream.push(Buffer.from(data));
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
    // Kubernetes exec resize is sent as a control channel message.
    // The k8s-client Exec class does not expose a direct resize API;
    // send a resize sequence via the stdin channel using the k8s protocol.
    const resizeMsg = JSON.stringify({ Width: cols, Height: rows });
    // Channel 4 is the resize channel in the k8s exec protocol.
    const buf = Buffer.alloc(1 + resizeMsg.length);
    buf[0] = 4;
    buf.write(resizeMsg, 1);
    this.stdinStream.push(buf);
  }

  close(): void {
    if (this._closed) {
      return;
    }
    this._closed = true;
    this.stdinStream.end();
  }
}
