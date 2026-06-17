import { describe, it, expect } from 'vitest';
import {
  nextRegion,
  regionOrder,
  clampIndex,
  REGION_ORDER_WITH_DETAIL,
  REGION_ORDER_NO_DETAIL,
} from './navigation.js';
import type { FocusRegion } from './types.js';

describe('regionOrder', () => {
  it('includes detail when visible', () => {
    expect(regionOrder(true)).toEqual(['sidebar', 'list', 'detail']);
  });

  it('omits detail when hidden', () => {
    expect(regionOrder(false)).toEqual(['sidebar', 'list']);
  });
});

describe('nextRegion forward', () => {
  it('cycles sidebar → list → detail → sidebar with detail', () => {
    const o = REGION_ORDER_WITH_DETAIL;
    expect(nextRegion(o, 'sidebar', false)).toBe('list');
    expect(nextRegion(o, 'list', false)).toBe('detail');
    expect(nextRegion(o, 'detail', false)).toBe('sidebar');
  });

  it('cycles sidebar → list → sidebar without detail', () => {
    const o = REGION_ORDER_NO_DETAIL;
    expect(nextRegion(o, 'sidebar', false)).toBe('list');
    expect(nextRegion(o, 'list', false)).toBe('sidebar');
  });
});

describe('nextRegion reverse', () => {
  it('cycles backward with detail', () => {
    const o = REGION_ORDER_WITH_DETAIL;
    expect(nextRegion(o, 'sidebar', true)).toBe('detail');
    expect(nextRegion(o, 'detail', true)).toBe('list');
    expect(nextRegion(o, 'list', true)).toBe('sidebar');
  });

  it('cycles backward without detail', () => {
    const o = REGION_ORDER_NO_DETAIL;
    expect(nextRegion(o, 'sidebar', true)).toBe('list');
    expect(nextRegion(o, 'list', true)).toBe('sidebar');
  });
});

describe('nextRegion with a region outside the cycle', () => {
  it('forward lands on the first element', () => {
    expect(nextRegion(REGION_ORDER_WITH_DETAIL, 'commandbar', false)).toBe(
      'sidebar',
    );
  });

  it('reverse lands on the last element', () => {
    expect(nextRegion(REGION_ORDER_WITH_DETAIL, 'commandbar', true)).toBe(
      'detail',
    );
    expect(nextRegion(REGION_ORDER_NO_DETAIL, 'commandbar', true)).toBe('list');
  });

  it('returns current for an empty order', () => {
    expect(nextRegion([] as readonly FocusRegion[], 'sidebar', false)).toBe(
      'sidebar',
    );
  });
});

describe('clampIndex', () => {
  it('steps forward within bounds', () => {
    expect(clampIndex(0, 1, 3)).toBe(1);
    expect(clampIndex(1, 1, 3)).toBe(2);
  });

  it('steps backward within bounds', () => {
    expect(clampIndex(2, -1, 3)).toBe(1);
  });

  it('clamps at the bottom', () => {
    expect(clampIndex(0, -1, 3)).toBe(0);
  });

  it('clamps at the top', () => {
    expect(clampIndex(2, 1, 3)).toBe(2);
  });

  it('returns 0 for an empty list', () => {
    expect(clampIndex(0, 1, 0)).toBe(0);
    expect(clampIndex(5, -1, 0)).toBe(0);
  });
});
