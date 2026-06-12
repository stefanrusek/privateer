import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import {
  FirstRunScreen,
  formatBytes,
  formatSpeed,
  formatEta,
  progressBar,
} from './FirstRunScreen.js';
import type { DownloadState } from '../../model/download.js';

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

describe('formatBytes', () => {
  it('formats gigabytes with one decimal', () => {
    expect(formatBytes(1_300_000_000)).toBe('1.3GB');
  });

  it('formats megabytes as integers', () => {
    expect(formatBytes(690_000_000)).toBe('690MB');
  });

  it('formats kilobytes as integers', () => {
    expect(formatBytes(12_000)).toBe('12KB');
  });

  it('formats bytes below 1KB', () => {
    expect(formatBytes(512)).toBe('512B');
  });

  it('formats zero', () => {
    expect(formatBytes(0)).toBe('0B');
  });
});

describe('formatSpeed', () => {
  it('formats MB/s with one decimal', () => {
    expect(formatSpeed(2_100_000)).toBe('2.1 MB/s');
  });

  it('formats KB/s', () => {
    expect(formatSpeed(12_500)).toBe('12.5 KB/s');
  });

  it('formats B/s below 1KB', () => {
    expect(formatSpeed(800)).toBe('800 B/s');
  });
});

describe('formatEta', () => {
  it('estimates when null', () => {
    expect(formatEta(null)).toBe('estimating…');
  });

  it('formats sub-minute durations', () => {
    expect(formatEta(12)).toBe('~12s remaining');
  });

  it('formats minute+second durations', () => {
    expect(formatEta(94)).toBe('~1m 34s remaining');
  });

  it('formats an exact minute', () => {
    expect(formatEta(60)).toBe('~1m 0s remaining');
  });
});

describe('progressBar', () => {
  it('is all empty at 0 percent', () => {
    expect(progressBar(0, 4)).toBe('░░░░');
  });

  it('is all filled at 100 percent', () => {
    expect(progressBar(100, 4)).toBe('████');
  });

  it('is half filled at 50 percent', () => {
    expect(progressBar(50, 4)).toBe('██░░');
  });

  it('clamps percentages outside 0–100', () => {
    expect(progressBar(150, 4)).toBe('████');
    expect(progressBar(-10, 4)).toBe('░░░░');
  });

  it('uses a default width of 30', () => {
    expect(progressBar(100).length).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// Component rendering — one per phase
// ---------------------------------------------------------------------------

function state(overrides: Partial<DownloadState>): DownloadState {
  return {
    phase: 'downloading',
    downloadedBytes: 0,
    totalBytes: 1_300_000_000,
    percent: 0,
    speedBytesPerSec: 0,
    etaSeconds: null,
    error: null,
    ...overrides,
  };
}

describe('FirstRunScreen rendering', () => {
  it('renders the trust copy and skip hint while downloading', () => {
    const { lastFrame } = render(
      React.createElement(FirstRunScreen, {
        state: state({
          phase: 'downloading',
          downloadedBytes: 690_000_000,
          percent: 52,
          speedBytesPerSec: 2_100_000,
          etaSeconds: 94,
        }),
      }),
    );
    const frame = lastFrame();
    expect(frame).toContain('Nothing leaves your machine');
    expect(frame).toContain('--no-agent');
    expect(frame).toContain('Ctrl+C to cancel');
    expect(frame).toContain('52%');
    expect(frame).toContain('690MB / 1.3GB');
    expect(frame).toContain('2.1 MB/s');
    expect(frame).toContain('~1m 34s remaining');
  });

  it('renders the idle phase as a progress view', () => {
    const { lastFrame } = render(
      React.createElement(FirstRunScreen, { state: state({ phase: 'idle' }) }),
    );
    expect(lastFrame()).toContain('0%');
  });

  it('renders the verifying phase', () => {
    const { lastFrame } = render(
      React.createElement(FirstRunScreen, {
        state: state({ phase: 'verifying' }),
      }),
    );
    expect(lastFrame()).toContain('Verifying checksum');
  });

  it('renders the completion message', () => {
    const { lastFrame } = render(
      React.createElement(FirstRunScreen, {
        state: state({ phase: 'complete', percent: 100 }),
      }),
    );
    expect(lastFrame()).toContain('Model ready');
  });

  it('renders the failure message and retry prompt', () => {
    const { lastFrame } = render(
      React.createElement(FirstRunScreen, {
        state: state({ phase: 'failed', error: 'network error' }),
      }),
    );
    const frame = lastFrame();
    expect(frame).toContain('network error');
    expect(frame).toContain('retry');
  });

  it('renders a fallback message when failed with no error string', () => {
    const { lastFrame } = render(
      React.createElement(FirstRunScreen, {
        state: state({ phase: 'failed', error: null }),
      }),
    );
    expect(lastFrame()).toContain('unknown error');
  });

  it('renders the cancelled message', () => {
    const { lastFrame } = render(
      React.createElement(FirstRunScreen, {
        state: state({ phase: 'cancelled' }),
      }),
    );
    expect(lastFrame()).toContain('cancelled');
  });

  it('uses the default model name', () => {
    const { lastFrame } = render(
      React.createElement(FirstRunScreen, { state: state({}) }),
    );
    expect(lastFrame()).toContain('Gemma 4 E2B (quantized)');
  });

  it('renders a custom model name', () => {
    const { lastFrame } = render(
      React.createElement(FirstRunScreen, {
        state: state({}),
        modelName: 'Gemma 4 E4B',
      }),
    );
    expect(lastFrame()).toContain('Gemma 4 E4B');
  });
});
