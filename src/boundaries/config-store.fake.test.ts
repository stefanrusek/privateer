import { describe, it, expect, vi } from 'vitest';
import { InMemoryConfigStore, InMemoryFileSink } from './config-store.fake.js';

describe('InMemoryConfigStore', () => {
  it('loads the initial config', async () => {
    const store = new InMemoryConfigStore({ theme: 'dark' });
    const res = await store.load();
    expect(res.ok && res.value).toEqual({ theme: 'dark' });
  });

  it('merges saved patches into the config', async () => {
    const store = new InMemoryConfigStore({ theme: 'dark' });
    await store.save({ refreshInterval: 30 });
    const res = await store.load();
    expect(res.ok && res.value).toEqual({ theme: 'dark', refreshInterval: 30 });
  });

  it('notifies watchers on external edits and stops after unwatch', () => {
    const store = new InMemoryConfigStore();
    const handler = vi.fn();
    const unwatch = store.watch(handler);
    store.externalEdit({ theme: 'light' });
    expect(handler).toHaveBeenCalledWith({ theme: 'light' });
    unwatch();
    store.externalEdit({ theme: 'dark' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('can simulate a parse failure on load', async () => {
    const store = new InMemoryConfigStore();
    store.failNextLoad();
    const res = await store.load();
    expect(!res.ok && res.error.kind).toBe('parseError');
  });
});

describe('InMemoryFileSink', () => {
  it('writes and reads back a file', async () => {
    const sink = new InMemoryFileSink();
    await sink.write('/tmp/a.txt', 'hello');
    const res = await sink.read('/tmp/a.txt');
    expect(res.ok && res.value).toBe('hello');
  });

  it('appends lines, creating the file on first append', async () => {
    const sink = new InMemoryFileSink();
    await sink.appendLine('/h', 'one');
    await sink.appendLine('/h', 'two');
    const res = await sink.read('/h');
    expect(res.ok && res.value).toBe('one\ntwo\n');
  });

  it('reports notFound when reading a missing file', async () => {
    const res = await new InMemoryFileSink().read('/missing');
    expect(!res.ok && res.error.kind).toBe('notFound');
  });
});
