import { describe, it, expect } from 'vitest';
import { containerPhaseColor } from './container-phase.js';

describe('containerPhaseColor', () => {
  it('maps running to green', () => {
    expect(containerPhaseColor('running')).toBe('green');
  });

  it('maps waiting to yellow', () => {
    expect(containerPhaseColor('waiting')).toBe('yellow');
  });

  it('maps terminated to gray', () => {
    expect(containerPhaseColor('terminated')).toBe('gray');
  });
});
