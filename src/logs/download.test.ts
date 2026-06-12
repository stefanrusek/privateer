import { describe, it, expect } from 'vitest';
import {
  formatTimestamp,
  buildDownloadPath,
  tildePath,
  downloadLogs,
} from './download.js';
import { InMemoryFileSink } from '../boundaries/config-store.fake.js';
import { FakeClock } from '../boundaries/clock.fake.js';
import type { FileSink, FileSinkError } from '../boundaries/config-store.js';
import { type Result, err } from '../core/result.js';

const TS = new Date('2026-06-10T14:22:09Z').getTime();
const HOME = '/Users/alice';

describe('formatTimestamp', () => {
  it('formats epoch ms as YYYYMMDD-HHMMSS in UTC', () => {
    expect(formatTimestamp(TS)).toBe('20260610-142209');
  });

  it('zero-pads single-digit fields', () => {
    const t = new Date('2026-01-02T03:04:05Z').getTime();
    expect(formatTimestamp(t)).toBe('20260102-030405');
  });
});

describe('buildDownloadPath', () => {
  it('builds the Downloads path with pod, container, and timestamp', () => {
    expect(buildDownloadPath(HOME, 'order-api-7d9f', 'order-api', TS)).toBe(
      '/Users/alice/Downloads/p9r-logs-order-api-7d9f-order-api-20260610-142209.txt',
    );
  });
});

describe('tildePath', () => {
  it('replaces the home prefix with a tilde', () => {
    expect(tildePath(HOME, '/Users/alice/Downloads/x.txt')).toBe(
      '~/Downloads/x.txt',
    );
  });

  it('returns the full path when it is not under home', () => {
    expect(tildePath(HOME, '/tmp/x.txt')).toBe('/tmp/x.txt');
  });
});

describe('downloadLogs', () => {
  it('writes joined lines with a trailing newline and returns the path', async () => {
    const sink = new InMemoryFileSink();
    const clock = new FakeClock(TS);
    const result = await downloadLogs(
      sink,
      HOME,
      'order-api',
      'main',
      ['line one', 'line two'],
      clock.now(),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.path).toBe(
        '/Users/alice/Downloads/p9r-logs-order-api-main-20260610-142209.txt',
      );
      expect(result.value.displayPath).toBe(
        '~/Downloads/p9r-logs-order-api-main-20260610-142209.txt',
      );
      expect(sink.files.get(result.value.path)).toBe('line one\nline two\n');
    }
  });

  it('writes an empty string for an empty buffer', async () => {
    const sink = new InMemoryFileSink();
    const result = await downloadLogs(sink, HOME, 'p', 'c', [], TS);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(sink.files.get(result.value.path)).toBe('');
    }
  });

  it('propagates a FileSink write error', async () => {
    const failing: FileSink = {
      write: (): Promise<Result<void, FileSinkError>> =>
        Promise.resolve(err({ kind: 'writeError', message: 'disk full' })),
      appendLine: (): Promise<Result<void, FileSinkError>> =>
        Promise.resolve(err({ kind: 'writeError', message: 'n/a' })),
      read: (): Promise<Result<string, FileSinkError>> =>
        Promise.resolve(err({ kind: 'notFound', message: 'n/a' })),
    };
    const result = await downloadLogs(failing, HOME, 'p', 'c', ['x'], TS);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('writeError');
    }
  });
});
