import { describe, it, expect } from 'vitest';
import { ok, err, type Result } from './result.js';

describe('Result', () => {
  it('constructs an Ok carrying a value', () => {
    const r = ok(42);
    expect(r.ok).toBe(true);
    expect(r.value).toBe(42);
  });

  it('constructs an Err carrying an error', () => {
    const r = err('boom');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('boom');
  });

  it('narrows on the discriminant', () => {
    const collapse = (r: Result<number, string>): number | string =>
      r.ok ? r.value : r.error;
    expect(collapse(ok(1))).toBe(1);
    expect(collapse(err('x'))).toBe('x');
  });
});
