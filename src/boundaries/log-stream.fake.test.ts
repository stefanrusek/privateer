import { describe, it, expect } from 'vitest';
import { FakeLogStream } from './log-stream.fake.js';
import type { LogTailOptions } from './log-stream.js';

function baseOptions(over: Partial<LogTailOptions> = {}): LogTailOptions {
  return {
    namespace: 'default',
    pod: 'order-api',
    container: 'main',
    ...over,
  };
}

describe('FakeLogStream', () => {
  it('records tail calls and their options', () => {
    const stream = new FakeLogStream();
    stream.tail(baseOptions({ tailLines: 100 }), {
      onLine: () => undefined,
      onError: () => undefined,
    });
    expect(stream.tailCount).toBe(1);
    expect(stream.optionsAt(0)?.tailLines).toBe(100);
    expect(stream.lastOptions()?.pod).toBe('order-api');
  });

  it('returns undefined options for an out-of-range index', () => {
    const stream = new FakeLogStream();
    expect(stream.optionsAt(0)).toBeUndefined();
    expect(stream.lastOptions()).toBeUndefined();
  });

  it('delivers lines to the matching open stream', () => {
    const stream = new FakeLogStream();
    const lines: string[] = [];
    stream.tail(baseOptions(), {
      onLine: (l) => lines.push(l),
      onError: () => undefined,
    });
    stream.emitLine(0, 'hello');
    stream.emitLines(0, ['a', 'b']);
    expect(lines).toEqual(['hello', 'a', 'b']);
  });

  it('stops delivering lines after the stream is closed', () => {
    const stream = new FakeLogStream();
    const lines: string[] = [];
    const close = stream.tail(baseOptions(), {
      onLine: (l) => lines.push(l),
      onError: () => undefined,
    });
    close();
    expect(stream.isClosed(0)).toBe(true);
    stream.emitLine(0, 'ignored');
    expect(lines).toEqual([]);
  });

  it('reports a missing stream as closed', () => {
    const stream = new FakeLogStream();
    expect(stream.isClosed(5)).toBe(true);
  });

  it('emitLine on a missing index is a no-op', () => {
    const stream = new FakeLogStream();
    expect(() => {
      stream.emitLine(9, 'x');
    }).not.toThrow();
  });

  it('delivers an error and closes the stream', () => {
    const stream = new FakeLogStream();
    const errors: string[] = [];
    stream.tail(baseOptions(), {
      onLine: () => undefined,
      onError: (e) => errors.push(e.kind),
    });
    stream.emitError(0, { kind: 'network', message: 'drop' });
    expect(errors).toEqual(['network']);
    expect(stream.isClosed(0)).toBe(true);
  });

  it('does not re-deliver an error to a closed stream', () => {
    const stream = new FakeLogStream();
    const errors: string[] = [];
    const close = stream.tail(baseOptions(), {
      onLine: () => undefined,
      onError: (e) => errors.push(e.kind),
    });
    close();
    stream.emitError(0, { kind: 'closed', message: 'x' });
    expect(errors).toEqual([]);
  });

  it('emitError on a missing index is a no-op', () => {
    const stream = new FakeLogStream();
    expect(() => {
      stream.emitError(9, { kind: 'network', message: 'x' });
    }).not.toThrow();
  });

  it('tracks the previous and sinceSeconds flags', () => {
    const stream = new FakeLogStream();
    stream.tail(baseOptions({ previous: true, sinceSeconds: 900 }), {
      onLine: () => undefined,
      onError: () => undefined,
    });
    expect(stream.optionsAt(0)?.previous).toBe(true);
    expect(stream.optionsAt(0)?.sinceSeconds).toBe(900);
  });
});
