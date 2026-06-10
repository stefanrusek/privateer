import { describe, it, expect, vi } from 'vitest';
import { createApp } from './app.js';
import { VERSION } from './version.js';

describe('createApp', () => {
  it('prints the version on the `version` command', () => {
    const write = vi.fn();
    createApp({ argv: ['version'], write }).run();
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(`p9r ${VERSION}`);
  });

  it('prints a placeholder banner when no command is given', () => {
    const write = vi.fn();
    createApp({ argv: [], write }).run();
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(
      'p9r — Privateer (TUI not yet implemented)',
    );
  });

  it('does not write anything before run() is called', () => {
    const write = vi.fn();
    createApp({ argv: ['version'], write });
    expect(write).not.toHaveBeenCalled();
  });
});
