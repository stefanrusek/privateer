/**
 * Isolated test that mocks the age module to make formatAge throw, covering
 * the catch block in ageFromTimestamp (dispatcher.ts) that is otherwise unreachable.
 *
 * Uses vi.mock at module level with proper hoisting for stable isolation.
 */

import { describe, it, expect, vi } from 'vitest';

// Hoist the mock factory so it is evaluated before any imports
vi.mock('../resources/age.js', () => ({
  formatAge: vi.fn((_ts: string, _nowMs: number): string => {
    throw new Error('mocked formatAge error for catch block coverage');
  }),
}));

// Import after mock is in place
import { AgentToolDispatcher } from './dispatcher.js';
import { StateStore } from '../store/state-store.js';
import type { ResourceEvent, ResourceObject } from '../core/types.js';

const CONTEXT = 'test-ctx';
const NOW_MS = new Date('2026-06-10T13:00:00Z').getTime();

describe('ageFromTimestamp catch block via mocked formatAge', () => {
  it('returns empty string when formatAge throws (covers catch block at dispatcher.ts lines 354-355)', () => {
    const store = new StateStore((event: ResourceEvent): ResourceObject => {
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
    store.applyEvent(CONTEXT, {
      type: 'ADDED',
      apiVersion: 'v1',
      kind: 'Pod',
      namespace: 'default',
      name: 'test-pod',
      receivedAt: NOW_MS,
      object: {
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: {
          name: 'test-pod',
          namespace: 'default',
          creationTimestamp: '2026-06-01T00:00:00Z',
        },
      },
    });

    const dispatcher = new AgentToolDispatcher(store, CONTEXT, NOW_MS);
    // list_resources calls ageFromTimestamp, which calls mocked formatAge (throws)
    // The catch block returns '' instead of propagating
    const result = dispatcher.dispatch('list_resources', {
      kind: 'Pod',
    }) as { age: string }[];
    expect(result[0]?.age).toBe('');
  });
});
