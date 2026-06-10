import { describe, it, expect } from 'vitest';
import { FixtureEngine } from './inference-engine.fake.js';
import type { InferenceRequest } from './inference-engine.js';

const request: InferenceRequest = {
  messages: [{ role: 'user', content: 'hi' }],
  tools: [],
  thinking: false,
};

describe('FixtureEngine', () => {
  it('replays queued answer responses in order and records requests', async () => {
    const engine = new FixtureEngine().pushAnswer('first').pushAnswer('second');
    const a = await engine.generate(request);
    const b = await engine.generate(request);
    expect(a.ok && a.value.content).toBe('first');
    expect(b.ok && b.value.content).toBe('second');
    expect(engine.requests).toHaveLength(2);
  });

  it('replays a tool-call response', async () => {
    const engine = new FixtureEngine().pushToolCalls([
      { id: '1', name: 'list_resources', arguments: '{"kind":"Pod"}' },
    ]);
    const res = await engine.generate(request);
    expect(res.ok && res.value.toolCalls[0]?.name).toBe('list_resources');
  });

  it('replays a scripted error', async () => {
    const engine = new FixtureEngine().pushError({
      kind: 'cancelled',
      message: 'timeout',
    });
    const res = await engine.generate(request);
    expect(!res.ok && res.error.kind).toBe('cancelled');
  });

  it('errors when the fixture queue is exhausted', async () => {
    const engine = new FixtureEngine();
    const res = await engine.generate(request);
    expect(!res.ok && res.error.kind).toBe('runtimeError');
  });

  it('accepts steps via the constructor', async () => {
    const engine = new FixtureEngine([
      { kind: 'response', response: { toolCalls: [], content: 'ctor' } },
    ]);
    const res = await engine.generate(request);
    expect(res.ok && res.value.content).toBe('ctor');
  });
});
