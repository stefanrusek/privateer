import { describe, it, expect } from 'vitest';
import { runLoop } from './loop.js';
import { FixtureEngine } from '../boundaries/inference-engine.fake.js';
import { FakeClock } from '../boundaries/clock.fake.js';
import { StateStore } from '../store/state-store.js';
import { AgentToolDispatcher } from './dispatcher.js';
import type { ResourceEvent, ResourceObject } from '../core/types.js';
import type {
  ChatMessage,
  InferenceEngine,
  InferenceRequest,
} from '../boundaries/inference-engine.js';
import type { Result } from '../core/result.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CONTEXT = 'test-ctx';
const NOW_MS = new Date('2026-06-10T13:00:00Z').getTime();

function makeStore(): StateStore {
  return new StateStore((event: ResourceEvent): ResourceObject => {
    const meta = event.object.metadata ?? {};
    return {
      uid: `${event.namespace ?? '~'}/${event.name}`,
      kind: event.kind,
      apiVersion: event.apiVersion,
      name: event.name,
      namespace: event.namespace,
      labels: meta.labels ?? {},
      annotations: meta.annotations ?? {},
      creationTimestamp: '2026-06-01T00:00:00Z',
      resourceVersion: '1',
      status: { color: 'green', label: 'Running' },
      raw: event.object,
    };
  });
}

function makeDispatcher(store?: StateStore): AgentToolDispatcher {
  return new AgentToolDispatcher(store ?? makeStore(), CONTEXT, NOW_MS);
}

function makeMessages(): ChatMessage[] {
  return [
    { role: 'system', content: 'You are Privateer.' },
    { role: 'user', content: 'show me erroring pods' },
  ];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runLoop', () => {
  it('returns action from immediate answer', async () => {
    const engine = new FixtureEngine();
    engine.pushAnswer('{"action":"navigate","resource":"Pod"}');

    const result = await runLoop({
      engine,
      dispatcher: makeDispatcher(),
      clock: new FakeClock(),
      messages: makeMessages(),
      thinking: false,
    });

    expect(result.kind).toBe('action');
    if (result.kind === 'action') {
      expect(result.action).toEqual({ action: 'navigate', resource: 'Pod' });
    }
  });

  it('passes a custom tool subset to the engine when provided', async () => {
    const seen: InferenceRequest[] = [];
    const engine: InferenceEngine = {
      generate(request: InferenceRequest) {
        seen.push(request);
        const result: Awaited<ReturnType<InferenceEngine['generate']>> = {
          ok: true,
          value: {
            toolCalls: [],
            content: '{"action":"navigate","resource":"Pod"}',
          },
        };
        return Promise.resolve(result);
      },
    };

    const tools = [
      {
        name: 'list_resources',
        description: 'subset',
        parameters: {},
      },
    ];
    const result = await runLoop({
      engine,
      dispatcher: makeDispatcher(),
      clock: new FakeClock(),
      messages: makeMessages(),
      thinking: false,
      tools,
    });

    expect(result.kind).toBe('action');
    expect(seen[0]?.tools).toEqual(tools);
  });

  it('returns parseError when model emits invalid JSON', async () => {
    const engine = new FixtureEngine();
    engine.pushAnswer('not valid json at all');

    const result = await runLoop({
      engine,
      dispatcher: makeDispatcher(),
      clock: new FakeClock(),
      messages: makeMessages(),
      thinking: false,
    });

    expect(result.kind).toBe('parseError');
    if (result.kind === 'parseError') {
      expect(result.raw).toBe('not valid json at all');
    }
  });

  it('returns error on engine failure', async () => {
    const engine = new FixtureEngine();
    engine.pushError({ kind: 'runtimeError', message: 'model crashed' });

    const result = await runLoop({
      engine,
      dispatcher: makeDispatcher(),
      clock: new FakeClock(),
      messages: makeMessages(),
      thinking: false,
    });

    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.message).toBe('model crashed');
    }
  });

  it('returns error on fixture exhausted', async () => {
    const engine = new FixtureEngine();
    // No steps pushed — fixture will be exhausted immediately

    const result = await runLoop({
      engine,
      dispatcher: makeDispatcher(),
      clock: new FakeClock(),
      messages: makeMessages(),
      thinking: false,
    });

    expect(result.kind).toBe('error');
  });

  it('resolves tool calls and continues to final answer', async () => {
    const store = makeStore();
    store.applyEvent(CONTEXT, {
      type: 'ADDED',
      apiVersion: 'v1',
      kind: 'Pod',
      namespace: 'default',
      name: 'pod-a',
      receivedAt: NOW_MS,
      object: {
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: {
          name: 'pod-a',
          namespace: 'default',
          creationTimestamp: '2026-06-01T00:00:00Z',
        },
      },
    });

    const engine = new FixtureEngine();
    engine.pushToolCalls([
      {
        id: 'call-1',
        name: 'list_resources',
        arguments: '{"kind":"Pod"}',
      },
    ]);
    engine.pushAnswer('{"action":"answer","text":"Found 1 pod."}');

    const toolCallNames: string[] = [];
    const result = await runLoop({
      engine,
      dispatcher: makeDispatcher(store),
      clock: new FakeClock(),
      messages: makeMessages(),
      thinking: false,
      onToolCall: (name) => {
        toolCallNames.push(name);
      },
    });

    expect(result.kind).toBe('action');
    if (result.kind === 'action') {
      expect(result.action).toEqual({ action: 'answer', text: 'Found 1 pod.' });
    }
    expect(toolCallNames).toContain('list_resources');
    // Tool result should be in messages sent to model
    expect(engine.requests).toHaveLength(2);
    const secondRequest = engine.requests[1];
    expect(secondRequest?.messages).toHaveLength(4); // system + user + assistant (with tool calls) + tool result
  });

  it('handles tool call with invalid JSON arguments gracefully', async () => {
    const engine = new FixtureEngine();
    engine.pushToolCalls([
      {
        id: 'call-1',
        name: 'list_resources',
        arguments: '{invalid json}',
      },
    ]);
    engine.pushAnswer('{"action":"answer","text":"Done."}');

    const result = await runLoop({
      engine,
      dispatcher: makeDispatcher(),
      clock: new FakeClock(),
      messages: makeMessages(),
      thinking: false,
    });

    // Should recover and continue to answer
    expect(result.kind).toBe('action');
  });

  it('handles unknown tool gracefully', async () => {
    const engine = new FixtureEngine();
    engine.pushToolCalls([
      {
        id: 'call-1',
        name: 'nonexistent_tool',
        arguments: '{}',
      },
    ]);
    engine.pushAnswer('{"action":"answer","text":"Done."}');

    const result = await runLoop({
      engine,
      dispatcher: makeDispatcher(),
      clock: new FakeClock(),
      messages: makeMessages(),
      thinking: false,
    });

    // Should recover — error captured in tool result, model sees error and gives answer
    expect(result.kind).toBe('action');
  });

  it('stops after MAX_ROUNDS (5) tool calls', async () => {
    const engine = new FixtureEngine();
    // Push 5 rounds of tool calls (no final answer)
    for (let i = 0; i < 5; i++) {
      engine.pushToolCalls([
        {
          id: `call-${String(i)}`,
          name: 'list_resources',
          arguments: '{"kind":"Pod"}',
        },
      ]);
    }

    const result = await runLoop({
      engine,
      dispatcher: makeDispatcher(),
      clock: new FakeClock(),
      messages: makeMessages(),
      thinking: false,
    });

    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.message).toContain('Maximum tool call rounds exceeded');
    }
  });

  it('honors a custom timeoutMs override', async () => {
    const clock = new FakeClock(0);
    const pending: { resolve: (() => void) | null } = { resolve: null };
    const slowEngine: InferenceEngine = {
      generate(_req: InferenceRequest): Promise<Result<never, never>> {
        return new Promise<Result<never, never>>((res) => {
          pending.resolve = () => {
            res({
              ok: false,
              error: { kind: 'cancelled', message: 'done' } as never,
            });
          };
        });
      },
    };

    const loopPromise = runLoop({
      engine: slowEngine,
      dispatcher: makeDispatcher(),
      clock,
      messages: makeMessages(),
      thinking: false,
      timeoutMs: 45_000,
    });

    // The default 15s mark must NOT fire with the longer budget…
    clock.advance(15_001);
    // …but the custom 45s mark must.
    clock.advance(30_000);

    const result = await loopPromise;
    expect(result.kind).toBe('timeout');
    pending.resolve?.();
  });

  it('returns timeout when clock fires at 15s', async () => {
    const clock = new FakeClock(0);

    // Holds the resolve function for the slow engine's pending promise
    const pending: { resolve: (() => void) | null } = { resolve: null };
    const slowEngine: InferenceEngine = {
      generate(_req: InferenceRequest): Promise<Result<never, never>> {
        return new Promise<Result<never, never>>((res) => {
          pending.resolve = () => {
            res({
              ok: false,
              error: { kind: 'cancelled', message: 'done' } as never,
            });
          };
        });
      },
    };

    const loopPromise = runLoop({
      engine: slowEngine,
      dispatcher: makeDispatcher(),
      clock,
      messages: makeMessages(),
      thinking: false,
    });

    // Advance clock past the 15s timeout
    clock.advance(15_001);

    const result = await loopPromise;
    expect(result.kind).toBe('timeout');

    // Resolve the blocked engine promise so no dangling async
    const fn = pending.resolve;
    if (fn !== null) {
      fn();
    }
  });

  it('passes thinking flag to engine', async () => {
    const engine = new FixtureEngine();
    engine.pushAnswer('{"action":"answer","text":"OK"}');

    await runLoop({
      engine,
      dispatcher: makeDispatcher(),
      clock: new FakeClock(),
      messages: makeMessages(),
      thinking: true,
    });

    expect(engine.requests[0]?.thinking).toBe(true);
  });

  it('returns timeout when timedOut fires during generate and is checked after await', async () => {
    // The engine advances the clock past the timeout during generate(),
    // so after the generate() resolves, timedOut=true and the post-await check fires.
    const clock = new FakeClock(0);
    const advancingEngine: InferenceEngine = {
      generate(_req: InferenceRequest): Promise<Result<never, never>> {
        // Advance past the 15s timeout synchronously during generate
        clock.advance(20_000);
        return Promise.resolve({
          ok: true,
          value: {
            toolCalls: [],
            content: '{"action":"answer","text":"Done."}',
          },
        }) as unknown as Promise<Result<never, never>>;
      },
    };

    const result = await runLoop({
      engine: advancingEngine,
      dispatcher: makeDispatcher(),
      clock,
      messages: makeMessages(),
      thinking: false,
    });

    // timedOut was set during generate; post-await check fires → timeout
    expect(result.kind).toBe('timeout');
  });

  it('cancels timeout after successful completion', async () => {
    const clock = new FakeClock(0);
    const engine = new FixtureEngine();
    engine.pushAnswer('{"action":"answer","text":"OK"}');

    await runLoop({
      engine,
      dispatcher: makeDispatcher(),
      clock,
      messages: makeMessages(),
      thinking: false,
    });

    // After completion, no pending timers should remain
    expect(clock.pendingCount()).toBe(0);
  });

  it('truncates very large tool results', async () => {
    const store = makeStore();
    // Add many pods to make the result large
    for (let i = 0; i < 60; i++) {
      store.applyEvent(CONTEXT, {
        type: 'ADDED',
        apiVersion: 'v1',
        kind: 'Pod',
        namespace: 'default',
        name: `pod-${String(i).padStart(3, '0')}`,
        receivedAt: NOW_MS,
        object: {
          apiVersion: 'v1',
          kind: 'Pod',
          metadata: {
            name: `pod-${String(i).padStart(3, '0')}`,
            namespace: 'default',
            creationTimestamp: '2026-06-01T00:00:00Z',
          },
        },
      });
    }

    const engine = new FixtureEngine();
    engine.pushToolCalls([
      {
        id: 'call-1',
        name: 'list_resources',
        arguments: '{"kind":"Pod","limit":50}',
      },
    ]);
    engine.pushAnswer('{"action":"answer","text":"OK"}');

    await runLoop({
      engine,
      dispatcher: makeDispatcher(store),
      clock: new FakeClock(),
      messages: makeMessages(),
      thinking: false,
    });

    // Find the tool result message
    const secondReq = engine.requests[1];
    const toolMsg = secondReq?.messages.find((m) => m.role === 'tool');
    expect(toolMsg).toBeDefined();
    // Content should be at most MAX_RESULT_CHARS + truncation marker
    if (toolMsg !== undefined) {
      expect(toolMsg.content.length).toBeLessThanOrEqual(2500);
    }
  });

  it('calls onToolCall for each tool call', async () => {
    const engine = new FixtureEngine();
    engine.pushToolCalls([
      { id: 'call-1', name: 'list_resources', arguments: '{"kind":"Pod"}' },
      {
        id: 'call-2',
        name: 'count_resources',
        arguments: '{"kind":"Deployment"}',
      },
    ]);
    engine.pushAnswer('{"action":"answer","text":"Done."}');

    const calls: { name: string; params: Record<string, unknown> }[] = [];
    await runLoop({
      engine,
      dispatcher: makeDispatcher(),
      clock: new FakeClock(),
      messages: makeMessages(),
      thinking: false,
      onToolCall: (name, params) => {
        calls.push({ name, params });
      },
    });

    expect(calls).toHaveLength(2);
    expect(calls[0]?.name).toBe('list_resources');
    expect(calls[1]?.name).toBe('count_resources');
  });

  it('does not call onToolCall when no onToolCall provided', async () => {
    const engine = new FixtureEngine();
    engine.pushToolCalls([
      { id: 'call-1', name: 'list_resources', arguments: '{"kind":"Pod"}' },
    ]);
    engine.pushAnswer('{"action":"answer","text":"Done."}');

    // Should not throw when onToolCall is undefined
    const result = await runLoop({
      engine,
      dispatcher: makeDispatcher(),
      clock: new FakeClock(),
      messages: makeMessages(),
      thinking: false,
    });

    expect(result.kind).toBe('action');
  });

  it('handles dispatcher throwing non-Error value (covers unknown error branch)', async () => {
    // Exercises line 116: `e instanceof Error ? e.message : 'unknown error'`
    // by using a dispatcher that throws a non-Error value.
    const engine = new FixtureEngine();
    engine.pushToolCalls([{ id: 'call-1', name: 'any_tool', arguments: '{}' }]);
    engine.pushAnswer('{"action":"answer","text":"Done."}');

    // A dispatcher that throws a non-Error value (object, not Error instance)
    const throwingDispatcher = {
      dispatch(_name: string, _params: Record<string, unknown>): unknown {
        const nonError: unknown = { code: 42 };
        throw nonError;
      },
    } as unknown as AgentToolDispatcher;

    const result = await runLoop({
      engine,
      dispatcher: throwingDispatcher,
      clock: new FakeClock(),
      messages: makeMessages(),
      thinking: false,
    });

    // The error is captured in toolResult and passed back to the model
    expect(result.kind).toBe('action');
    // Verify the second request has a tool result with 'unknown error'
    const secondReq = engine.requests[1];
    const toolMsg = secondReq?.messages.find((m) => m.role === 'tool');
    expect(toolMsg?.content).toContain('unknown error');
  });
});
