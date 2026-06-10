import { describe, it, expect, vi } from 'vitest';
import { main } from './main.js';
import { VERSION } from './version.js';

describe('main (composition root)', () => {
  it('wires the app and routes the `version` command to the writer', () => {
    const write = vi.fn();
    main(['version'], write);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(`p9r ${VERSION}`);
  });

  it('constructs successfully with the default production sink and argv', () => {
    const spy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    expect(() => {
      main();
    }).not.toThrow();
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });
});
