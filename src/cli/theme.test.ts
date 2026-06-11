import { describe, it, expect } from 'vitest';
import { selectTheme } from './theme.js';

describe('selectTheme', () => {
  it('returns the dark theme by default', () => {
    const t = selectTheme('dark');
    expect(t.name).toBe('dark');
    expect(t.foreground).toBe('white');
    expect(t.status.red).toBe('red');
  });

  it('returns the light theme', () => {
    const t = selectTheme('light');
    expect(t.name).toBe('light');
    expect(t.foreground).toBe('black');
    expect(t.status.grey).toBe('blackBright');
  });
});
