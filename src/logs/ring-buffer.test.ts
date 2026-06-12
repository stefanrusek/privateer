import { describe, it, expect } from 'vitest';
import { RingBuffer } from './ring-buffer.js';

describe('RingBuffer', () => {
  it('defaults to a capacity of 10000', () => {
    const buf = new RingBuffer();
    expect(buf.capacity).toBe(10_000);
  });

  it('starts empty', () => {
    const buf = new RingBuffer(3);
    expect(buf.size).toBe(0);
    expect(buf.toArray()).toEqual([]);
  });

  it('retains lines below capacity without eviction', () => {
    const buf = new RingBuffer(3);
    expect(buf.push('a')).toBe(false);
    expect(buf.push('b')).toBe(false);
    expect(buf.size).toBe(2);
    expect(buf.toArray()).toEqual(['a', 'b']);
  });

  it('evicts the oldest line when over capacity', () => {
    const buf = new RingBuffer(2);
    buf.push('a');
    buf.push('b');
    expect(buf.push('c')).toBe(true);
    expect(buf.toArray()).toEqual(['b', 'c']);
    expect(buf.size).toBe(2);
  });

  it('pushAll appends in order and evicts as needed', () => {
    const buf = new RingBuffer(2);
    buf.pushAll(['a', 'b', 'c', 'd']);
    expect(buf.toArray()).toEqual(['c', 'd']);
  });

  it('clear empties the buffer', () => {
    const buf = new RingBuffer(3);
    buf.pushAll(['a', 'b']);
    buf.clear();
    expect(buf.size).toBe(0);
    expect(buf.toArray()).toEqual([]);
  });

  it('toArray returns a copy, not the internal array', () => {
    const buf = new RingBuffer(3);
    buf.push('a');
    const snapshot = buf.toArray();
    snapshot.push('mutated');
    expect(buf.toArray()).toEqual(['a']);
  });

  it('rejects a non-integer capacity', () => {
    expect(() => new RingBuffer(2.5)).toThrow(RangeError);
  });

  it('rejects a zero capacity', () => {
    expect(() => new RingBuffer(0)).toThrow(RangeError);
  });

  it('rejects a negative capacity', () => {
    expect(() => new RingBuffer(-1)).toThrow(RangeError);
  });
});
