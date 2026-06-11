/**
 * FirstRunScreen — full-screen blocking model-download UI (Spec 04 §13).
 *
 * Prop-driven from a {@link DownloadState}: progress bar, `MB / total`, rolling
 * speed, ETA, the "Nothing leaves your machine" trust copy, and the Ctrl+C /
 * --no-agent hints. Renders distinct completion and failure states. All
 * formatting is pure and unit-tested; rendering is frame-tested.
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { DownloadState } from '../../model/download.js';

// ---------------------------------------------------------------------------
// Formatting helpers (pure)
// ---------------------------------------------------------------------------

const BYTES_PER_KB = 1000;
const BYTES_PER_MB = BYTES_PER_KB * 1000;
const BYTES_PER_GB = BYTES_PER_MB * 1000;

/** Human-readable byte size, e.g. `690MB`, `1.3GB`. */
export function formatBytes(bytes: number): string {
  if (bytes >= BYTES_PER_GB) {
    return `${(bytes / BYTES_PER_GB).toFixed(1)}GB`;
  }
  if (bytes >= BYTES_PER_MB) {
    return `${String(Math.round(bytes / BYTES_PER_MB))}MB`;
  }
  if (bytes >= BYTES_PER_KB) {
    return `${String(Math.round(bytes / BYTES_PER_KB))}KB`;
  }
  return `${String(Math.round(bytes))}B`;
}

/** Transfer rate, e.g. `2.1 MB/s`. */
export function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec >= BYTES_PER_MB) {
    return `${(bytesPerSec / BYTES_PER_MB).toFixed(1)} MB/s`;
  }
  if (bytesPerSec >= BYTES_PER_KB) {
    return `${(bytesPerSec / BYTES_PER_KB).toFixed(1)} KB/s`;
  }
  return `${String(Math.round(bytesPerSec))} B/s`;
}

/** Coarse duration, e.g. `~1m 34s remaining`, `~12s remaining`. */
export function formatEta(etaSeconds: number | null): string {
  if (etaSeconds === null) {
    return 'estimating…';
  }
  if (etaSeconds < 60) {
    return `~${String(etaSeconds)}s remaining`;
  }
  const minutes = Math.floor(etaSeconds / 60);
  const seconds = etaSeconds % 60;
  return `~${String(minutes)}m ${String(seconds)}s remaining`;
}

/** A fixed-width unicode progress bar for `percent` (0–100) over `width` cells. */
export function progressBar(percent: number, width = 30): string {
  const clamped = Math.min(100, Math.max(0, percent));
  const filled = Math.round((clamped / 100) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface FirstRunScreenProps {
  readonly state: DownloadState;
  /** Model display name (Spec 04 §13 — e.g. "Gemma 4 E2B (quantized)"). */
  readonly modelName?: string;
}

const DEFAULT_MODEL_NAME = 'Gemma 4 E2B (quantized)';

export function FirstRunScreen({
  state,
  modelName = DEFAULT_MODEL_NAME,
}: FirstRunScreenProps): React.ReactElement {
  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text bold>privateer</Text>
      <Box height={1} />
      <Text>Downloading AI model for the command bar agent.</Text>
      <Text>This is a one-time setup (~1.3GB).</Text>
      <Box height={1} />
      <Text>{modelName}</Text>
      <FirstRunBody state={state} />
      <Box height={1} />
      <Text dimColor>The model runs locally. Nothing leaves your machine.</Text>
      <Box height={1} />
      <Text dimColor>Ctrl+C to cancel · Run with --no-agent to skip</Text>
    </Box>
  );
}

function FirstRunBody({
  state,
}: {
  readonly state: DownloadState;
}): React.ReactElement {
  switch (state.phase) {
    case 'complete':
      return <Text color="green">✓ Model ready</Text>;
    case 'failed':
      return (
        <Box flexDirection="column">
          <Text color="red">
            ✗ Download failed: {state.error ?? 'unknown error'}
          </Text>
          <Text>Press r to retry.</Text>
        </Box>
      );
    case 'cancelled':
      return <Text color="yellow">Download cancelled.</Text>;
    case 'verifying':
      return <Text>Verifying checksum…</Text>;
    case 'idle':
    case 'downloading':
      return <DownloadProgress state={state} />;
  }
}

function DownloadProgress({
  state,
}: {
  readonly state: DownloadState;
}): React.ReactElement {
  const sizeLabel = `${formatBytes(state.downloadedBytes)} / ${formatBytes(
    state.totalBytes,
  )}`;
  return (
    <Box flexDirection="column">
      <Text>
        {progressBar(state.percent)} {String(state.percent)}% {sizeLabel}
      </Text>
      <Text dimColor>
        {formatSpeed(state.speedBytesPerSec)} · {formatEta(state.etaSeconds)}
      </Text>
    </Box>
  );
}
