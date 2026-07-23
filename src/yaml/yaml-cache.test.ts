import { describe, expect, it } from 'vitest';
import { resolveDetailYaml, shouldFetchFullYaml } from './yaml-cache.js';

describe('resolveDetailYaml', () => {
  it('returns the fallback when there is no cache', () => {
    expect(resolveDetailYaml(null, 'a', 'fallback')).toBe('fallback');
  });

  it('returns the fallback when the cache is for a different uid', () => {
    expect(resolveDetailYaml({ uid: 'b', yaml: 'full' }, 'a', 'fallback')).toBe(
      'fallback',
    );
  });

  it('returns the cached yaml when the cache matches the uid', () => {
    expect(resolveDetailYaml({ uid: 'a', yaml: 'full' }, 'a', 'fallback')).toBe(
      'full',
    );
  });

  it('returns the fallback when uid is empty even if the cache uid is empty', () => {
    expect(resolveDetailYaml({ uid: '', yaml: 'full' }, '', 'fallback')).toBe(
      'fallback',
    );
  });
});

describe('shouldFetchFullYaml', () => {
  it('is false when uid is empty (no detail open)', () => {
    expect(shouldFetchFullYaml(null, null, '')).toBe(false);
  });

  it('is true when there is no cache and nothing in flight', () => {
    expect(shouldFetchFullYaml(null, null, 'a')).toBe(true);
  });

  it('is false when a fetch for this uid is already in flight', () => {
    expect(shouldFetchFullYaml(null, 'a', 'a')).toBe(false);
  });

  it('is true when a different uid is in flight', () => {
    expect(shouldFetchFullYaml(null, 'b', 'a')).toBe(true);
  });

  it('is false when the cache already holds this uid', () => {
    expect(shouldFetchFullYaml({ uid: 'a', yaml: 'full' }, null, 'a')).toBe(
      false,
    );
  });

  it('is true when the cache holds a different uid', () => {
    expect(shouldFetchFullYaml({ uid: 'b', yaml: 'full' }, null, 'a')).toBe(
      true,
    );
  });
});
