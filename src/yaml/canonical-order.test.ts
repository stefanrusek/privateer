import { describe, expect, it } from 'vitest';
import { canonicalKeyOrder } from './canonical-order.js';

describe('canonicalKeyOrder', () => {
  it('reorders apiVersion, kind, metadata first and status last', () => {
    const obj = {
      metadata: { name: 'my-cfg' },
      data: { a: '1' },
      kind: 'ConfigMap',
      apiVersion: 'v1',
    };
    const result = canonicalKeyOrder(obj);
    expect(Object.keys(result)).toEqual([
      'apiVersion',
      'kind',
      'metadata',
      'data',
    ]);
  });

  it('keeps status last when present, other middle keys in their original relative order', () => {
    const obj = {
      status: { phase: 'Running' },
      spec: { containers: [] },
      kind: 'Pod',
      apiVersion: 'v1',
      metadata: { name: 'p' },
    };
    const result = canonicalKeyOrder(obj);
    expect(Object.keys(result)).toEqual([
      'apiVersion',
      'kind',
      'metadata',
      'spec',
      'status',
    ]);
  });

  it('returns non-object input unchanged (null, array, primitive)', () => {
    expect(canonicalKeyOrder(null)).toBeNull();
    expect(canonicalKeyOrder([1, 2, 3])).toEqual([1, 2, 3]);
    expect(canonicalKeyOrder(5)).toBe(5);
  });

  it('is a no-op on an already-canonical object', () => {
    const obj = {
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: {},
      spec: {},
      status: {},
    };
    expect(Object.keys(canonicalKeyOrder(obj))).toEqual(Object.keys(obj));
  });

  it('handles an object with only some canonical keys present', () => {
    const obj = { data: { x: '1' }, kind: 'ConfigMap' };
    expect(Object.keys(canonicalKeyOrder(obj))).toEqual(['kind', 'data']);
  });
});
