/**
 * Model download manager (Spec 04 §13, Spec 07 §11.2).
 *
 * A pure state machine that folds raw progress events into a renderable
 * `DownloadState` — percent, rolling 5-second speed average, ETA, and a phase.
 * Also defines the `ModelDownloader` boundary (the real adapter resolves the
 * model via `@huggingface/transformers`) and an in-memory fake.
 *
 * No `Date.now`/`setTimeout`: all timing flows through caller-supplied epoch
 * milliseconds, so every branch is a constructible test input.
 */

import type { Result } from '../core/result.js';

// ---------------------------------------------------------------------------
// Public state
// ---------------------------------------------------------------------------

/** Lifecycle phase of a model download. */
export type DownloadPhase =
  | 'idle'
  | 'downloading'
  | 'verifying'
  | 'complete'
  | 'failed'
  | 'cancelled';

/** The derived, renderable snapshot of a download. */
export interface DownloadState {
  readonly phase: DownloadPhase;
  readonly downloadedBytes: number;
  readonly totalBytes: number;
  /** 0–100, clamped. 0 when total is unknown. */
  readonly percent: number;
  /** Rolling average over the last {@link SPEED_WINDOW_MS} of samples. */
  readonly speedBytesPerSec: number;
  /** Whole seconds remaining at the current speed; null when unknown. */
  readonly etaSeconds: number | null;
  /** Set only when {@link phase} is `failed`. */
  readonly error: string | null;
}

/** A single byte/timestamp progress sample fed into the manager. */
export interface ProgressSample {
  readonly downloadedBytes: number;
  readonly atMs: number;
}

/** Window over which speed is averaged (Spec 04 §13 — "last 5s"). */
export const SPEED_WINDOW_MS = 5000;

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

interface Sample {
  readonly bytes: number;
  readonly atMs: number;
}

/**
 * Accumulates progress samples and exposes the derived `DownloadState`. Construct
 * with a known `totalBytes` (0 if unknown until the first event reveals it).
 */
export class DownloadManager {
  private phase: DownloadPhase;
  private total: number;
  private downloaded = 0;
  private error: string | null = null;
  private readonly samples: Sample[] = [];

  constructor(totalBytes = 0) {
    this.total = totalBytes;
    this.phase = 'idle';
  }

  /** Update the known total size (e.g. learned from the first HTTP response). */
  setTotal(totalBytes: number): void {
    this.total = Math.max(0, totalBytes);
  }

  /**
   * Fold a progress sample. Moves an `idle` download to `downloading`. Ignored
   * once the download is in a terminal phase (complete/failed/cancelled) or
   * while verifying.
   */
  report(sample: ProgressSample): void {
    if (
      this.phase === 'complete' ||
      this.phase === 'failed' ||
      this.phase === 'cancelled' ||
      this.phase === 'verifying'
    ) {
      return;
    }
    this.phase = 'downloading';
    this.downloaded = Math.max(0, sample.downloadedBytes);
    this.samples.push({ bytes: this.downloaded, atMs: sample.atMs });
    this.pruneWindow(sample.atMs);
  }

  /** Enter the checksum-verification phase (download bytes complete). */
  beginVerify(): void {
    if (this.phase === 'downloading' || this.phase === 'idle') {
      this.phase = 'verifying';
    }
  }

  /**
   * Resolve the verification step. `ok` true → `complete`; false → `failed`
   * carrying `reason`. Only meaningful while `verifying`.
   */
  finishVerify(ok: boolean, reason = 'checksum mismatch'): void {
    if (this.phase !== 'verifying') {
      return;
    }
    if (ok) {
      this.phase = 'complete';
      this.error = null;
    } else {
      this.phase = 'failed';
      this.error = reason;
    }
  }

  /** Mark the download failed with `reason`. */
  fail(reason: string): void {
    if (this.phase === 'complete' || this.phase === 'cancelled') {
      return;
    }
    this.phase = 'failed';
    this.error = reason;
  }

  /** Cancel the download (user pressed Ctrl+C). Terminal except via `retry`. */
  cancel(): void {
    if (this.phase === 'complete') {
      return;
    }
    this.phase = 'cancelled';
  }

  /**
   * Reset a failed or cancelled download back to a fresh `downloading`-able
   * state, clearing samples and progress. No-op for other phases.
   */
  retry(): void {
    if (this.phase !== 'failed' && this.phase !== 'cancelled') {
      return;
    }
    this.phase = 'downloading';
    this.downloaded = 0;
    this.error = null;
    this.samples.length = 0;
  }

  /** The current derived snapshot. */
  snapshot(): DownloadState {
    const speed = this.currentSpeed();
    return {
      phase: this.phase,
      downloadedBytes: this.downloaded,
      totalBytes: this.total,
      percent: this.computePercent(),
      speedBytesPerSec: speed,
      etaSeconds: this.computeEta(speed),
      error: this.error,
    };
  }

  // -- internals ------------------------------------------------------------

  private pruneWindow(nowMs: number): void {
    const cutoff = nowMs - SPEED_WINDOW_MS;
    // Keep one sample at or before the cutoff so a delta can still be computed.
    while (this.samples.length > 1) {
      const second = this.samples[1];
      if (second !== undefined && second.atMs < cutoff) {
        this.samples.shift();
      } else {
        break;
      }
    }
  }

  private computePercent(): number {
    if (this.total <= 0) {
      return 0;
    }
    const raw = (this.downloaded / this.total) * 100;
    return Math.min(100, Math.max(0, Math.round(raw)));
  }

  private currentSpeed(): number {
    // Derive a rate from the window endpoints. `first` is the earliest sample in
    // the window and `last` the most recent; both are non-null once two distinct
    // samples exist. Fewer than two samples yields 0.
    let first: Sample | null = null;
    let last: Sample | null = null;
    for (const sample of this.samples) {
      if (first === null) {
        first = sample;
      } else {
        last = sample;
      }
    }
    if (first === null || last === null) {
      return 0;
    }
    const dtMs = last.atMs - first.atMs;
    const dBytes = last.bytes - first.bytes;
    if (dtMs <= 0 || dBytes <= 0) {
      return 0;
    }
    return (dBytes / dtMs) * 1000;
  }

  private computeEta(speed: number): number | null {
    if (this.total <= 0 || speed <= 0) {
      return null;
    }
    const remaining = this.total - this.downloaded;
    if (remaining <= 0) {
      return 0;
    }
    return Math.ceil(remaining / speed);
  }
}

// ---------------------------------------------------------------------------
// ModelDownloader boundary
// ---------------------------------------------------------------------------

export interface ModelDownloaderError {
  readonly kind: 'network' | 'checksum' | 'cancelled';
  readonly message: string;
}

/** A handle to an in-flight download, allowing cancellation. */
export interface DownloadHandle {
  /** Resolves when the download terminates (success or failure). */
  readonly done: Promise<Result<void, ModelDownloaderError>>;
  /** Request cancellation; the `done` promise resolves with a cancelled error. */
  cancel(): void;
}

/**
 * ModelDownloader boundary (Spec 08 §5.1). The production adapter resolves the
 * Gemma ONNX model via `@huggingface/transformers`; `FakeModelDownloader`
 * scripts progress deterministically.
 */
export interface ModelDownloader {
  /**
   * Begin downloading the model, invoking `onProgress` for each sample. Returns
   * a handle whose `done` promise carries the terminal result.
   */
  start(onProgress: (sample: ProgressSample) => void): DownloadHandle;
}

// ---------------------------------------------------------------------------
// In-memory fake
// ---------------------------------------------------------------------------

import { ok, err } from '../core/result.js';

type FakeOutcome =
  | { kind: 'success' }
  | { kind: 'error'; error: ModelDownloaderError };

/**
 * Deterministic in-memory ModelDownloader. Scripts a list of progress samples
 * and a terminal outcome; `start` emits the samples synchronously, then
 * resolves `done`. `cancel` short-circuits to a cancelled error.
 */
export class FakeModelDownloader implements ModelDownloader {
  private readonly samples: ProgressSample[];
  private readonly outcome: FakeOutcome;

  constructor(
    samples: ProgressSample[] = [],
    outcome: FakeOutcome = { kind: 'success' },
  ) {
    this.samples = samples;
    this.outcome = outcome;
  }

  start(onProgress: (sample: ProgressSample) => void): DownloadHandle {
    const state = { cancelled: false };
    const result = makeDeferred<Result<void, ModelDownloaderError>>();

    const outcome = this.outcome;
    const samples = this.samples;

    // Emit samples, then resolve on the next microtask so a synchronous cancel()
    // after start() can pre-empt the terminal outcome (deterministic ordering).
    for (const sample of samples) {
      onProgress(sample);
    }
    void Promise.resolve().then(() => {
      if (state.cancelled) {
        return;
      }
      result.resolve(
        outcome.kind === 'success' ? ok(undefined) : err(outcome.error),
      );
    });

    return {
      done: result.promise,
      cancel(): void {
        state.cancelled = true;
        result.resolve(
          err({ kind: 'cancelled', message: 'download cancelled' }),
        );
      },
    };
  }
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  /** Idempotent — only the first call settles the promise. */
  resolve(value: T): void;
}

/** A promise with an externally callable, idempotent `resolve`. */
function makeDeferred<T>(): Deferred<T> {
  // The Promise executor runs synchronously, so `settle` is assigned before
  // `makeDeferred` returns and is therefore always callable.
  let settle!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    settle = res;
  });
  let done = false;
  return {
    promise,
    resolve(value: T): void {
      if (done) {
        return;
      }
      done = true;
      settle(value);
    },
  };
}
