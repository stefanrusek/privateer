import { describe, it, expect, vi } from 'vitest';
import { ContextModel } from './context-model.js';
import { FakeKubeClient } from '../boundaries/kube-client.fake.js';

describe('ContextModel', () => {
  function makeClient(contexts: string[], current: string): FakeKubeClient {
    return new FakeKubeClient({
      contexts: contexts.map((n) => ({ name: n, cluster: n, user: n })),
      currentContext: current,
    });
  }

  it('lists available contexts', () => {
    const client = makeClient(['prod', 'staging'], 'prod');
    const model = new ContextModel(client, vi.fn());
    expect(model.listContexts()).toEqual(['prod', 'staging']);
  });

  it('returns the current context', () => {
    const client = makeClient(['prod', 'staging'], 'staging');
    const model = new ContextModel(client, vi.fn());
    expect(model.currentContext()).toBe('staging');
  });

  it('switches context and emits reinit signal', () => {
    const client = makeClient(['prod', 'staging'], 'prod');
    const onReinit = vi.fn();
    const model = new ContextModel(client, onReinit);
    const result = model.switchContext('staging');
    expect(result.ok).toBe(true);
    expect(model.currentContext()).toBe('staging');
    expect(onReinit).toHaveBeenCalledOnce();
  });

  it('switching to current context does not emit reinit', () => {
    const client = makeClient(['prod', 'staging'], 'prod');
    const onReinit = vi.fn();
    const model = new ContextModel(client, onReinit);
    const result = model.switchContext('prod');
    expect(result.ok).toBe(true);
    expect(onReinit).not.toHaveBeenCalled();
  });

  it('switching to unknown context returns error and does not change state', () => {
    const client = makeClient(['prod', 'staging'], 'prod');
    const onReinit = vi.fn();
    const model = new ContextModel(client, onReinit);
    const result = model.switchContext('unknown');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe('unknown context: unknown');
    }
    expect(model.currentContext()).toBe('prod');
    expect(onReinit).not.toHaveBeenCalled();
  });
});
