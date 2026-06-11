import { describe, it, expect } from 'vitest';
import { HitTestRegistry } from './hit-testing.js';

describe('HitTestRegistry', () => {
  it('returns null when no regions are registered', () => {
    const reg = new HitTestRegistry();
    expect(reg.hitTest({ x: 5, y: 5 })).toBeNull();
  });

  it('returns null when point is outside the only region', () => {
    const reg = new HitTestRegistry();
    reg.register({ id: 'box', x: 0, y: 0, width: 10, height: 10, z: 1 });
    expect(reg.hitTest({ x: 15, y: 15 })).toBeNull();
  });

  it('returns the region id when point is inside', () => {
    const reg = new HitTestRegistry();
    reg.register({ id: 'box', x: 0, y: 0, width: 10, height: 10, z: 1 });
    expect(reg.hitTest({ x: 5, y: 5 })).toBe('box');
  });

  it('includes the top-left corner', () => {
    const reg = new HitTestRegistry();
    reg.register({ id: 'box', x: 5, y: 5, width: 10, height: 10, z: 1 });
    expect(reg.hitTest({ x: 5, y: 5 })).toBe('box');
  });

  it('excludes the right and bottom edges (half-open)', () => {
    const reg = new HitTestRegistry();
    reg.register({ id: 'box', x: 0, y: 0, width: 10, height: 10, z: 1 });
    expect(reg.hitTest({ x: 10, y: 5 })).toBeNull();
    expect(reg.hitTest({ x: 5, y: 10 })).toBeNull();
  });

  it('returns the region with highest z when regions overlap', () => {
    const reg = new HitTestRegistry();
    reg.register({ id: 'back', x: 0, y: 0, width: 20, height: 20, z: 1 });
    reg.register({ id: 'front', x: 5, y: 5, width: 10, height: 10, z: 2 });
    expect(reg.hitTest({ x: 7, y: 7 })).toBe('front');
  });

  it('returns the lower-z region when point is outside higher-z region', () => {
    const reg = new HitTestRegistry();
    reg.register({ id: 'back', x: 0, y: 0, width: 20, height: 20, z: 1 });
    reg.register({ id: 'front', x: 5, y: 5, width: 10, height: 10, z: 2 });
    expect(reg.hitTest({ x: 1, y: 1 })).toBe('back');
  });

  it('last-registered wins on equal z', () => {
    const reg = new HitTestRegistry();
    reg.register({ id: 'first', x: 0, y: 0, width: 10, height: 10, z: 1 });
    reg.register({ id: 'second', x: 0, y: 0, width: 10, height: 10, z: 1 });
    expect(reg.hitTest({ x: 5, y: 5 })).toBe('second');
  });

  it('clear resets all regions', () => {
    const reg = new HitTestRegistry();
    reg.register({ id: 'box', x: 0, y: 0, width: 10, height: 10, z: 1 });
    reg.clear();
    expect(reg.hitTest({ x: 5, y: 5 })).toBeNull();
  });

  it('can re-register regions after clear', () => {
    const reg = new HitTestRegistry();
    reg.register({ id: 'box', x: 0, y: 0, width: 10, height: 10, z: 1 });
    reg.clear();
    reg.register({ id: 'new-box', x: 0, y: 0, width: 10, height: 10, z: 1 });
    expect(reg.hitTest({ x: 5, y: 5 })).toBe('new-box');
  });
});
