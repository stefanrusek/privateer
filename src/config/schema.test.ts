import { describe, it, expect } from 'vitest';
import { parseConfig } from './schema.js';

describe('parseConfig', () => {
  it('applies defaults for an empty config', () => {
    expect(parseConfig({})).toEqual({
      ui: {
        mouseSupport: true,
        refreshInterval: 30,
        idleStreamTimeout: 300,
        theme: 'dark',
      },
      hiddenResources: [],
      lagThresholds: { warning: 10_000, critical: 10_000 },
      agentModel: 'gemma-4-E2B-it-onnx',
      agentTimeoutSeconds: 15,
    });
  });

  it('reads provided values', () => {
    const c = parseConfig({
      activeContext: 'prod',
      prometheus: { url: 'http://p:9090' },
      ui: {
        mouseSupport: false,
        refreshInterval: 15,
        idleStreamTimeout: 60,
        theme: 'light',
      },
      hiddenResources: ['Events', 42],
      lagThresholds: { warning: 5, critical: 9 },
      agent: { model: 'gemma-4-E4B-it-onnx', timeoutSeconds: 60 },
    });
    expect(c.activeContext).toBe('prod');
    expect(c.prometheusUrl).toBe('http://p:9090');
    expect(c.ui).toEqual({
      mouseSupport: false,
      refreshInterval: 15,
      idleStreamTimeout: 60,
      theme: 'light',
    });
    expect(c.hiddenResources).toEqual(['Events']);
    expect(c.lagThresholds).toEqual({ warning: 5, critical: 9 });
    expect(c.agentModel).toBe('gemma-4-E4B-it-onnx');
    expect(c.agentTimeoutSeconds).toBe(60);
  });

  it('ignores malformed types and non-string optional fields', () => {
    const c = parseConfig({
      activeContext: 123,
      prometheus: 'nope',
      ui: 'bad',
      hiddenResources: 'nope',
      lagThresholds: null,
    });
    expect(c.activeContext).toBeUndefined();
    expect(c.prometheusUrl).toBeUndefined();
    expect(c.ui.refreshInterval).toBe(30);
    expect(c.hiddenResources).toEqual([]);
    expect(c.lagThresholds).toEqual({ warning: 10_000, critical: 10_000 });
  });

  it('rejects non-finite numbers', () => {
    const c = parseConfig({ ui: { refreshInterval: Number.NaN } });
    expect(c.ui.refreshInterval).toBe(30);
  });
});
