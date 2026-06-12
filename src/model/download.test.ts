import { describe, it, expect } from 'vitest';
import {
  DownloadManager,
  FakeModelDownloader,
  SPEED_WINDOW_MS,
} from './download.js';
import type { ProgressSample } from './download.js';

// ---------------------------------------------------------------------------
// DownloadManager — phases
// ---------------------------------------------------------------------------

describe('DownloadManager phases', () => {
  it('starts idle with zeroed state', () => {
    const m = new DownloadManager(1000);
    const s = m.snapshot();
    expect(s.phase).toBe('idle');
    expect(s.downloadedBytes).toBe(0);
    expect(s.totalBytes).toBe(1000);
    expect(s.percent).toBe(0);
    expect(s.speedBytesPerSec).toBe(0);
    expect(s.etaSeconds).toBe(null);
    expect(s.error).toBe(null);
  });

  it('first report moves to downloading', () => {
    const m = new DownloadManager(1000);
    m.report({ downloadedBytes: 250, atMs: 1000 });
    const s = m.snapshot();
    expect(s.phase).toBe('downloading');
    expect(s.percent).toBe(25);
  });

  it('clamps negative downloaded bytes to zero', () => {
    const m = new DownloadManager(1000);
    m.report({ downloadedBytes: -50, atMs: 1000 });
    expect(m.snapshot().downloadedBytes).toBe(0);
  });

  it('setTotal updates the denominator and clamps negatives', () => {
    const m = new DownloadManager(0);
    m.setTotal(2000);
    m.report({ downloadedBytes: 500, atMs: 1000 });
    expect(m.snapshot().percent).toBe(25);
    m.setTotal(-5);
    expect(m.snapshot().totalBytes).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Percent
// ---------------------------------------------------------------------------

describe('DownloadManager percent', () => {
  it('is 0 when total is unknown', () => {
    const m = new DownloadManager(0);
    m.report({ downloadedBytes: 500, atMs: 1000 });
    expect(m.snapshot().percent).toBe(0);
  });

  it('rounds to nearest integer', () => {
    const m = new DownloadManager(3);
    m.report({ downloadedBytes: 1, atMs: 1000 });
    expect(m.snapshot().percent).toBe(33);
  });

  it('clamps above 100', () => {
    const m = new DownloadManager(1000);
    m.report({ downloadedBytes: 2000, atMs: 1000 });
    expect(m.snapshot().percent).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Speed (rolling 5s)
// ---------------------------------------------------------------------------

describe('DownloadManager speed', () => {
  it('is 0 with a single sample', () => {
    const m = new DownloadManager(1000);
    m.report({ downloadedBytes: 100, atMs: 1000 });
    expect(m.snapshot().speedBytesPerSec).toBe(0);
  });

  it('averages bytes per second across samples', () => {
    const m = new DownloadManager(10_000_000);
    m.report({ downloadedBytes: 1_000_000, atMs: 1000 });
    m.report({ downloadedBytes: 3_000_000, atMs: 2000 });
    expect(m.snapshot().speedBytesPerSec).toBe(2_000_000);
  });

  it('drops samples older than the 5s window, keeping an anchor', () => {
    const m = new DownloadManager(100_000_000);
    // Three early samples then a late one that pushes the window forward.
    m.report({ downloadedBytes: 0, atMs: 0 });
    m.report({ downloadedBytes: 1_000_000, atMs: 500 });
    m.report({ downloadedBytes: 2_000_000, atMs: 1000 });
    // now=8000 → cutoff=3000. Samples at 0 and 500 are dropped (their successor
    // is still < cutoff); the 1000 sample stays as the anchor.
    m.report({ downloadedBytes: 12_000_000, atMs: 8000 });
    // window [1000:2M, 8000:12M] → 10M / 7s ≈ 1_428_571 B/s
    expect(m.snapshot().speedBytesPerSec).toBeCloseTo(1_428_571, 0);
  });

  it('keeps the anchor sample just before the cutoff for delta computation', () => {
    const m = new DownloadManager(100_000_000);
    m.report({ downloadedBytes: 0, atMs: 0 });
    m.report({ downloadedBytes: 2_000_000, atMs: 1000 });
    m.report({ downloadedBytes: 12_000_000, atMs: 6000 });
    // now=6000 → cutoff=1000. sample[1] at 1000 is NOT < 1000, so the 0-sample
    // anchor stays. window [0:0, 6000:12M] → 12M / 6s = 2,000,000 B/s
    expect(m.snapshot().speedBytesPerSec).toBe(2_000_000);
  });

  it('is 0 when timestamps do not advance', () => {
    const m = new DownloadManager(1000);
    m.report({ downloadedBytes: 100, atMs: 1000 });
    m.report({ downloadedBytes: 200, atMs: 1000 });
    expect(m.snapshot().speedBytesPerSec).toBe(0);
  });

  it('is 0 when byte count does not advance', () => {
    const m = new DownloadManager(1000);
    m.report({ downloadedBytes: 100, atMs: 1000 });
    m.report({ downloadedBytes: 100, atMs: 2000 });
    expect(m.snapshot().speedBytesPerSec).toBe(0);
  });

  it('exposes the 5s window constant', () => {
    expect(SPEED_WINDOW_MS).toBe(5000);
  });
});

// ---------------------------------------------------------------------------
// ETA
// ---------------------------------------------------------------------------

describe('DownloadManager eta', () => {
  it('is null when speed is zero', () => {
    const m = new DownloadManager(1000);
    m.report({ downloadedBytes: 100, atMs: 1000 });
    expect(m.snapshot().etaSeconds).toBe(null);
  });

  it('is null when total is unknown', () => {
    const m = new DownloadManager(0);
    m.report({ downloadedBytes: 1_000_000, atMs: 1000 });
    m.report({ downloadedBytes: 2_000_000, atMs: 2000 });
    expect(m.snapshot().etaSeconds).toBe(null);
  });

  it('is remaining bytes over speed, rounded up', () => {
    const m = new DownloadManager(5_000_000);
    m.report({ downloadedBytes: 1_000_000, atMs: 1000 });
    m.report({ downloadedBytes: 2_000_000, atMs: 2000 });
    // speed 1M/s, remaining 3M → 3s
    expect(m.snapshot().etaSeconds).toBe(3);
  });

  it('is 0 when fully downloaded', () => {
    const m = new DownloadManager(2_000_000);
    m.report({ downloadedBytes: 1_000_000, atMs: 1000 });
    m.report({ downloadedBytes: 2_000_000, atMs: 2000 });
    expect(m.snapshot().etaSeconds).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Verify / complete / fail
// ---------------------------------------------------------------------------

describe('DownloadManager verify', () => {
  it('beginVerify from downloading enters verifying', () => {
    const m = new DownloadManager(1000);
    m.report({ downloadedBytes: 1000, atMs: 1000 });
    m.beginVerify();
    expect(m.snapshot().phase).toBe('verifying');
  });

  it('beginVerify from idle enters verifying', () => {
    const m = new DownloadManager(1000);
    m.beginVerify();
    expect(m.snapshot().phase).toBe('verifying');
  });

  it('beginVerify is a no-op from a terminal phase', () => {
    const m = new DownloadManager(1000);
    m.fail('boom');
    m.beginVerify();
    expect(m.snapshot().phase).toBe('failed');
  });

  it('reports are ignored while verifying', () => {
    const m = new DownloadManager(1000);
    m.report({ downloadedBytes: 500, atMs: 1000 });
    m.beginVerify();
    m.report({ downloadedBytes: 900, atMs: 2000 });
    const s = m.snapshot();
    expect(s.phase).toBe('verifying');
    expect(s.downloadedBytes).toBe(500);
  });

  it('finishVerify(true) completes', () => {
    const m = new DownloadManager(1000);
    m.report({ downloadedBytes: 1000, atMs: 1000 });
    m.beginVerify();
    m.finishVerify(true);
    expect(m.snapshot().phase).toBe('complete');
    expect(m.snapshot().error).toBe(null);
  });

  it('finishVerify(false) fails with default reason', () => {
    const m = new DownloadManager(1000);
    m.report({ downloadedBytes: 1000, atMs: 1000 });
    m.beginVerify();
    m.finishVerify(false);
    expect(m.snapshot().phase).toBe('failed');
    expect(m.snapshot().error).toBe('checksum mismatch');
  });

  it('finishVerify(false) carries a custom reason', () => {
    const m = new DownloadManager(1000);
    m.beginVerify();
    m.finishVerify(false, 'bad digest');
    expect(m.snapshot().error).toBe('bad digest');
  });

  it('finishVerify is a no-op when not verifying', () => {
    const m = new DownloadManager(1000);
    m.report({ downloadedBytes: 500, atMs: 1000 });
    m.finishVerify(true);
    expect(m.snapshot().phase).toBe('downloading');
  });
});

describe('DownloadManager fail', () => {
  it('fail sets failed + error', () => {
    const m = new DownloadManager(1000);
    m.fail('network error');
    expect(m.snapshot().phase).toBe('failed');
    expect(m.snapshot().error).toBe('network error');
  });

  it('fail is a no-op once complete', () => {
    const m = new DownloadManager(1000);
    m.beginVerify();
    m.finishVerify(true);
    m.fail('too late');
    expect(m.snapshot().phase).toBe('complete');
  });

  it('fail is a no-op once cancelled', () => {
    const m = new DownloadManager(1000);
    m.cancel();
    m.fail('too late');
    expect(m.snapshot().phase).toBe('cancelled');
  });

  it('reports are ignored once failed', () => {
    const m = new DownloadManager(1000);
    m.fail('boom');
    m.report({ downloadedBytes: 999, atMs: 5 });
    expect(m.snapshot().downloadedBytes).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Cancel / retry
// ---------------------------------------------------------------------------

describe('DownloadManager cancel and retry', () => {
  it('cancel moves to cancelled', () => {
    const m = new DownloadManager(1000);
    m.report({ downloadedBytes: 500, atMs: 1000 });
    m.cancel();
    expect(m.snapshot().phase).toBe('cancelled');
  });

  it('cancel is a no-op once complete', () => {
    const m = new DownloadManager(1000);
    m.beginVerify();
    m.finishVerify(true);
    m.cancel();
    expect(m.snapshot().phase).toBe('complete');
  });

  it('reports are ignored once cancelled', () => {
    const m = new DownloadManager(1000);
    m.cancel();
    m.report({ downloadedBytes: 700, atMs: 1 });
    expect(m.snapshot().downloadedBytes).toBe(0);
  });

  it('retry from failed resets to downloading at 0%', () => {
    const m = new DownloadManager(1000);
    m.report({ downloadedBytes: 400, atMs: 1000 });
    m.fail('network error');
    m.retry();
    const s = m.snapshot();
    expect(s.phase).toBe('downloading');
    expect(s.percent).toBe(0);
    expect(s.downloadedBytes).toBe(0);
    expect(s.error).toBe(null);
  });

  it('retry from cancelled resets to downloading', () => {
    const m = new DownloadManager(1000);
    m.cancel();
    m.retry();
    expect(m.snapshot().phase).toBe('downloading');
  });

  it('retry clears prior speed samples', () => {
    const m = new DownloadManager(10_000_000);
    m.report({ downloadedBytes: 1_000_000, atMs: 1000 });
    m.report({ downloadedBytes: 3_000_000, atMs: 2000 });
    m.fail('boom');
    m.retry();
    // single fresh sample → speed 0
    m.report({ downloadedBytes: 500_000, atMs: 3000 });
    expect(m.snapshot().speedBytesPerSec).toBe(0);
  });

  it('retry is a no-op from downloading', () => {
    const m = new DownloadManager(1000);
    m.report({ downloadedBytes: 400, atMs: 1000 });
    m.retry();
    expect(m.snapshot().downloadedBytes).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// FakeModelDownloader
// ---------------------------------------------------------------------------

describe('FakeModelDownloader', () => {
  it('emits scripted samples and resolves ok by default', async () => {
    const samples: ProgressSample[] = [
      { downloadedBytes: 100, atMs: 1 },
      { downloadedBytes: 200, atMs: 2 },
    ];
    const seen: ProgressSample[] = [];
    const dl = new FakeModelDownloader(samples);
    const handle = dl.start((s) => seen.push(s));
    const result = await handle.done;
    expect(seen).toEqual(samples);
    expect(result.ok).toBe(true);
  });

  it('resolves with the scripted error outcome', async () => {
    const dl = new FakeModelDownloader([], {
      kind: 'error',
      error: { kind: 'network', message: 'down' },
    });
    const handle = dl.start(() => undefined);
    const result = await handle.done;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('network');
      expect(result.error.message).toBe('down');
    }
  });

  it('cancel before start completes yields a cancelled error', async () => {
    const dl = new FakeModelDownloader([{ downloadedBytes: 1, atMs: 1 }]);
    const handle = dl.start(() => undefined);
    handle.cancel();
    const result = await handle.done;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('cancelled');
    }
  });

  it('default-constructed fake resolves ok with no samples', async () => {
    const dl = new FakeModelDownloader();
    const seen: ProgressSample[] = [];
    const handle = dl.start((s) => seen.push(s));
    const result = await handle.done;
    expect(seen).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('cancel after the download already settled does not change the result', async () => {
    const dl = new FakeModelDownloader();
    const handle = dl.start(() => undefined);
    // Let the success microtask settle `done` first.
    const result = await handle.done;
    expect(result.ok).toBe(true);
    // A late cancel is a no-op — the promise stays resolved as ok.
    handle.cancel();
    const again = await handle.done;
    expect(again.ok).toBe(true);
  });
});
