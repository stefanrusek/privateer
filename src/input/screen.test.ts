import { describe, it, expect } from 'vitest';
import { ENTER_ALT_SCREEN, LEAVE_ALT_SCREEN, SHOW_CURSOR } from './screen.js';

describe('alternate-screen control strings', () => {
  it('ENTER_ALT_SCREEN switches into the alternate buffer', () => {
    expect(ENTER_ALT_SCREEN).toBe('\x1b[?1049h');
  });

  it('LEAVE_ALT_SCREEN switches back to the primary buffer', () => {
    expect(LEAVE_ALT_SCREEN).toBe('\x1b[?1049l');
  });

  it('SHOW_CURSOR makes the text cursor visible', () => {
    expect(SHOW_CURSOR).toBe('\x1b[?25h');
  });
});
