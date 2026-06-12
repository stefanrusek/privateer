import { describe, it, expect, vi } from 'vitest';
import { createApp } from './app.js';
import { VERSION } from './version.js';

function make(argv: readonly string[]) {
  const write = vi.fn();
  const launch = vi.fn();
  createApp({ argv, write, launch }).run();
  return { write, launch };
}

describe('createApp', () => {
  it('prints the version on `version`', () => {
    const { write, launch } = make(['version']);
    expect(write).toHaveBeenCalledWith(`p9r ${VERSION}`);
    expect(launch).not.toHaveBeenCalled();
  });

  it('prints help on `help`', () => {
    const { write } = make(['help']);
    expect(write.mock.calls[0]?.[0]).toContain('Privateer');
  });

  it('prints a completion script on `completion zsh`', () => {
    const { write } = make(['completion', 'zsh']);
    expect(write.mock.calls[0]?.[0]).toContain('#compdef p9r');
  });

  it('prints the error and help on a bad argument', () => {
    const { write, launch } = make(['--nope']);
    expect(write).toHaveBeenCalledWith('error: unknown argument "--nope"');
    expect(write.mock.calls[1]?.[0]).toContain('Usage');
    expect(launch).not.toHaveBeenCalled();
  });

  it('launches the TUI with parsed options by default', () => {
    const { launch } = make(['--namespace', 'app', '--no-agent']);
    expect(launch).toHaveBeenCalledWith({ namespace: 'app', noAgent: true });
  });

  it('does nothing before run() is called', () => {
    const write = vi.fn();
    const launch = vi.fn();
    createApp({ argv: ['version'], write, launch });
    expect(write).not.toHaveBeenCalled();
  });
});
