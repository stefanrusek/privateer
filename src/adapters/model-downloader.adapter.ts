/**
 * Real ModelDownloader adapter — resolves the local agent model files via
 * `@huggingface/transformers` model resolution, forwarding the library's
 * progress callbacks as {@link ProgressSample}s (Spec 07 §11.2). Files are
 * cached under `~/.config/p9r/models/<model-id>/`; a later run with the files
 * present resolves from disk without network. Thin translation only; the
 * percent/speed/ETA state machine lives behind the boundary in
 * src/model/download.ts.
 *
 * Covered by @envtest, not unit tests (src/adapters/** excluded in vitest).
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- SDK lacks precise progress types */
/* eslint-disable @typescript-eslint/no-unsafe-assignment -- SDK progress_callback option is untyped */

import {
  AutoModelForCausalLM,
  AutoTokenizer,
  env,
} from '@huggingface/transformers';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { ok, err } from '../core/result.js';
import type {
  ModelDownloader,
  DownloadHandle,
  ProgressSample,
  ModelDownloaderError,
} from '../model/download.js';

/** Must match the inference adapter so the downloaded files are the ones used. */
const DEFAULT_MODEL_ID = 'onnx-community/gemma-3n-E2B-it-ONNX';
const DTYPE = 'q4';

/** Metadata for the selectable agent models (first-run chooser + screen). */
export interface AgentModelInfo {
  readonly id: string;
  readonly displayName: string;
  /** Approximate download size for the progress bar. */
  readonly totalBytes: number;
}

export const AGENT_MODELS: Record<'gemma' | 'qwen', AgentModelInfo> = {
  gemma: {
    id: 'onnx-community/gemma-3n-E2B-it-ONNX',
    displayName: 'Gemma 3n E2B (quantized)',
    totalBytes: 3_100_000_000,
  },
  qwen: {
    id: 'onnx-community/Qwen3-0.6B-ONNX',
    displayName: 'Qwen3 0.6B (quantized)',
    totalBytes: 580_000_000,
  },
};

/** Metadata for a model id, falling back to the default's entry. */
export function agentModelInfo(modelId: string): AgentModelInfo {
  const known = Object.values(AGENT_MODELS).find((m) => m.id === modelId);
  return (
    known ?? {
      id: modelId,
      displayName: modelId.split('/').pop() ?? modelId,
      totalBytes: 1_000_000_000,
    }
  );
}

/**
 * Whether the agent model files are already cached on disk (Spec 07 §11.2 —
 * decides whether the first-run download screen is shown). Single-graph
 * exports ship `onnx/model_<dtype>.onnx`; multimodal exports like Gemma 3n
 * ship a merged decoder instead.
 */
export function isModelCached(modelId: string = DEFAULT_MODEL_ID): boolean {
  const dir = join(homedir(), '.config', 'p9r', 'models', modelId);
  if (!existsSync(join(dir, 'tokenizer.json'))) {
    return false;
  }
  const candidates = [
    join(dir, 'onnx', `model_${DTYPE}.onnx`),
    join(dir, 'onnx', `model_q4f16.onnx`),
    join(dir, 'onnx', `decoder_model_merged_${DTYPE}.onnx`),
    join(dir, 'onnx', `decoder_model_merged_q4f16.onnx`),
  ];
  return candidates.some((path) => existsSync(path));
}

interface ProgressEvent {
  status?: string;
  file?: string;
  loaded?: number;
  total?: number;
}

export class TransformersModelDownloader implements ModelDownloader {
  constructor(
    private readonly modelId: string = DEFAULT_MODEL_ID,
    private readonly now: () => number = () => performance.now(),
  ) {}

  start(onProgress: (sample: ProgressSample) => void): DownloadHandle {
    (env as { cacheDir: string | null }).cacheDir = join(
      homedir(),
      '.config',
      'p9r',
      'models',
    );

    const controller = new AbortController();

    // The library reports per-file progress for several files (tokenizer,
    // config, ONNX weights) — aggregate into one cumulative byte count.
    const perFile = new Map<string, number>();
    const progressCallback = (event: ProgressEvent): void => {
      if (event.status !== 'progress' || typeof event.loaded !== 'number') {
        return;
      }
      perFile.set(event.file ?? '', event.loaded);
      let totalLoaded = 0;
      for (const bytes of perFile.values()) {
        totalLoaded += bytes;
      }
      onProgress({ downloadedBytes: totalLoaded, atMs: this.now() });
    };

    const done = (async () => {
      try {
        await Promise.all([
          AutoTokenizer.from_pretrained(this.modelId, {
            progress_callback: progressCallback as any,
          }),
          AutoModelForCausalLM.from_pretrained(this.modelId, {
            dtype: DTYPE,
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
