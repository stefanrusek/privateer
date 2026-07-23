import { describe, it, expect } from 'vitest';
import { evalPrinterColumnPath } from './jsonpath.js';

describe('evalPrinterColumnPath', () => {
  it('resolves a simple dotted field path', () => {
    expect(
      evalPrinterColumnPath('.status.phase', { status: { phase: 'Ready' } }),
    ).toBe('Ready');
  });

  it('resolves a {}-wrapped path', () => {
    expect(
      evalPrinterColumnPath('{.status.phase}', { status: { phase: 'Ready' } }),
    ).toBe('Ready');
  });

  it('resolves numeric array indexing', () => {
    expect(
      evalPrinterColumnPath('.spec.items[0].name', {
        spec: { items: [{ name: 'first' }, { name: 'second' }] },
      }),
    ).toBe('first');
  });

  it('renders numbers as strings', () => {
    expect(
      evalPrinterColumnPath('.spec.replicas', { spec: { replicas: 3 } }),
    ).toBe('3');
  });

  it('renders booleans as strings', () => {
    expect(
      evalPrinterColumnPath('.spec.paused', { spec: { paused: true } }),
    ).toBe('true');
  });

  it('renders null as empty string', () => {
    expect(
      evalPrinterColumnPath('.status.value', { status: { value: null } }),
    ).toBe('');
  });

  it('renders nested objects as JSON', () => {
    expect(
      evalPrinterColumnPath('.status.ref', { status: { ref: { name: 'x' } } }),
    ).toBe('{"name":"x"}');
  });

  it('returns undefined for a missing field', () => {
    expect(
      evalPrinterColumnPath('.status.missing', { status: {} }),
    ).toBeUndefined();
  });

  it('returns undefined when traversing through a missing intermediate', () => {
    expect(
      evalPrinterColumnPath('.status.a.b', { status: {} }),
    ).toBeUndefined();
  });

  it('returns undefined for an out-of-range array index', () => {
    expect(
      evalPrinterColumnPath('.spec.items[5].name', { spec: { items: [] } }),
    ).toBeUndefined();
  });

  it('returns undefined when indexing a non-array', () => {
    expect(
      evalPrinterColumnPath('.spec.items[0]', { spec: { items: {} } }),
    ).toBeUndefined();
  });

  it('returns undefined when a field is accessed on a non-object', () => {
    expect(
      evalPrinterColumnPath('.spec.items.name', { spec: { items: 'x' } }),
    ).toBeUndefined();
  });

  it('returns undefined for a path not starting with "."', () => {
    expect(evalPrinterColumnPath('status.phase', {})).toBeUndefined();
  });

  it('returns undefined for an empty path', () => {
    expect(evalPrinterColumnPath('', {})).toBeUndefined();
  });

  it('returns the object itself for the root path "."', () => {
    expect(evalPrinterColumnPath('.', { a: 1 })).toBe('{"a":1}');
  });

  it('returns undefined when the root object is undefined', () => {
    expect(evalPrinterColumnPath('.status.phase', undefined)).toBeUndefined();
  });

  it('returns undefined for a malformed bracket segment', () => {
    expect(
      evalPrinterColumnPath('.spec.items[abc]', { spec: {} }),
    ).toBeUndefined();
  });

  it('returns undefined for a path with an empty segment (double dot)', () => {
    expect(
      evalPrinterColumnPath('.status..phase', { status: { phase: 'x' } }),
    ).toBeUndefined();
  });
});
