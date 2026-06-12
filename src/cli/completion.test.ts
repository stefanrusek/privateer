import { describe, it, expect } from 'vitest';
import { completionScript } from './completion.js';

describe('completionScript', () => {
  it('emits a bash completion function', () => {
    const s = completionScript('bash');
    expect(s).toContain('complete -F _p9r p9r');
    expect(s).toContain('--context');
  });

  it('emits a zsh compdef', () => {
    expect(completionScript('zsh')).toContain('#compdef p9r');
  });

  it('emits fish completions for subcommands and flags', () => {
    const s = completionScript('fish');
    expect(s).toContain("-a 'version'");
    expect(s).toContain("-l 'context'");
  });
});
