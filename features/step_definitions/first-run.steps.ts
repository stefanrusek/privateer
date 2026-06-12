/**
 * Step definitions for features/07-agent/first-run.feature.
 *
 * Drives the DownloadManager state machine (Spec 04 §13 / Spec 07 §11.2) and
 * frame-tests FirstRunScreen via ink-testing-library. Step text is scoped with
 * "download" / "first-run screen" wording to avoid Cucumber ambiguity.
 */

import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { render } from 'ink-testing-library';
import React from 'react';
import { DownloadManager } from '../../src/model/download.js';
import { FirstRunScreen } from '../../src/ui/components/FirstRunScreen.js';
import type { DownloadState } from '../../src/model/download.js';

let manager: DownloadManager;
let frFrame = '';

Given('a fresh model download manager', function () {
  manager = new DownloadManager();
  frFrame = '';
});

Given('the download total is {int} bytes', function (total: number) {
  manager.setTotal(total);
});

When(
  'the download reports {int} bytes at {int}ms',
  function (bytes: number, atMs: number) {
    manager.report({ downloadedBytes: bytes, atMs });
  },
);

When('the download verifies successfully', function () {
  manager.beginVerify();
  manager.finishVerify(true);
});

When(
  'the download verification fails with {string}',
  function (reason: string) {
    manager.beginVerify();
    manager.finishVerify(false, reason);
  },
);

When('the download is cancelled', function () {
  manager.cancel();
});

When('the download fails with {string}', function (reason: string) {
  manager.fail(reason);
});

When('the download is retried', function () {
  manager.retry();
});

Then('the download percent is {int}', function (percent: number) {
  assert.strictEqual(manager.snapshot().percent, percent);
});

Then('the download phase is {string}', function (phase: string) {
  assert.strictEqual(manager.snapshot().phase, phase);
});

Then('the download speed is {int} bytes per second', function (speed: number) {
  assert.strictEqual(manager.snapshot().speedBytesPerSec, speed);
});

Then('the download eta is {int} seconds', function (eta: number) {
  assert.strictEqual(manager.snapshot().etaSeconds, eta);
});

Then('the download error is {string}', function (error: string) {
  assert.strictEqual(manager.snapshot().error, error);
});

// ---------------------------------------------------------------------------
// FirstRunScreen rendering
// ---------------------------------------------------------------------------

function renderState(state: DownloadState): void {
  const { lastFrame } = render(React.createElement(FirstRunScreen, { state }));
  frFrame = lastFrame() ?? '';
}

When(
  'I render the first-run screen downloading at {int} percent',
  function (percent: number) {
    renderState({
      phase: 'downloading',
      downloadedBytes: 690_000_000,
      totalBytes: 1_300_000_000,
      percent,
      speedBytesPerSec: 2_100_000,
      etaSeconds: 94,
      error: null,
    });
  },
);

When('I render the first-run screen completed', function () {
  renderState({
    phase: 'complete',
    downloadedBytes: 1_300_000_000,
    totalBytes: 1_300_000_000,
    percent: 100,
    speedBytesPerSec: 0,
    etaSeconds: 0,
    error: null,
  });
});

When(
  'I render the first-run screen failed with {string}',
  function (error: string) {
    renderState({
      phase: 'failed',
      downloadedBytes: 100_000_000,
      totalBytes: 1_300_000_000,
      percent: 8,
      speedBytesPerSec: 0,
      etaSeconds: null,
      error,
    });
  },
);

Then('the first-run screen contains {string}', function (text: string) {
  assert.ok(
    frFrame.includes(text),
    `expected first-run frame to contain "${text}", got:\n${frFrame}`,
  );
});
