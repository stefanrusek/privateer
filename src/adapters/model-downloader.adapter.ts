/**
 * Real ModelDownloader adapter — resolves the Gemma ONNX model files via
 * `@huggingface/transformers` model resolution, forwarding the library's
 * progress callbacks as {@link ProgressSample}s (Spec 07 §11.2). Thin
 * translation only; the percent/speed/ETA state machine lives behind the
 * boundary in src/model/download.ts.
 *
 * Covered by @envtest, not unit tests (src/adapters/** excluded in vitest).
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- SDK lacks precise progress types */
/* eslint-disable @typescript-eslint/no-unsafe-assignment -- SDK progress_callback option is untyped */

import { AutoModelForCausalLM, AutoTokenizer } from '@huggingface/transformers';
import { ok, err } from '../core/result.js';
import type {
  ModelDownloader,
  DownloadHandle,
  ProgressSample,
  ModelDownloaderError,
} from '../model/download.js';

const DEFAULT_MODEL_ID = 'onnx-community/gemma-4-E2B-it-ONNX';

interface ProgressEvent {
  status?: string;
  loaded?: number;
  total?: number;
}

export class TransformersModelDownloader implements ModelDownloader {
  constructor(
    private readonly modelId: string = DEFAULT_MODEL_ID,
    private readonly now: () => number = () => performance.now(),
  ) {}

  start(onProgress: (sample: ProgressSample) => void): DownloadHandle {
    const controller = new AbortController();

    const progressCallback = (event: ProgressEvent): void => {
      if (event.status === 'progress' && typeof event.loaded === 'number') {
        onProgress({ downloadedBytes: event.loaded, atMs: this.now() });
      }
    };

    const done = (async () => {
      try {
        await Promise.all([
          AutoTokenizer.from_pretrained(this.modelId, {
            progress_callback: progressCallback as any,
          }),
          AutoModelForCausalLM.from_pretrained(this.modelId, {
            progress_callback: progressCallback as any,
          }),
        ]);
        if (controller.signal.aborted) {
          const e: ModelDownloaderError = {
            kind: 'cancelled',
            message: 'download cancelled',
          };
          return err(e);
        }
        return ok(undefined);
      } catch (e) {
        if (controller.signal.aborted) {
          const cancelled: ModelDownloaderError = {
            kind: 'cancelled',
            message: 'download cancelled',
          };
          return err(cancelled);
        }
        const network: ModelDownloaderError = {
          kind: 'network',
          message: e instanceof Error ? e.message : String(e),
        };
        return err(network);
      }
    })();

    return {
      done,
      cancel(): void {
        controller.abort();
      },
    };
  }
}
