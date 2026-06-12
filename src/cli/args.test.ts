import { describe, it, expect } from 'vitest';
import { parseArgs } from './args.js';

describe('parseArgs', () => {
  it('defaults to launch with no options', () => {
    expect(parseArgs([])).toEqual({
      kind: 'launch',
      options: { noAgent: false },
    });
  });

  it.each(['version', '--version', '-v'])('parses %s', (a) => {
    expect(parseArgs([a])).toEqual({ kind: 'version' });
  });

  it.each(['help', '--help', '-h'])('parses %s', (a) => {
    expect(parseArgs([a])).toEqual({ kind: 'help' });
  });

  it.each(['bash', 'zsh', 'fish'] as const)('parses completion %s', (s) => {
    expect(parseArgs(['completion', s])).toEqual({
      kind: 'completion',
      shell: s,
    });
  });

  it('errors on completion with no shell', () => {
    expect(parseArgs(['completion'])).toEqual({
      kind: 'error',
      message: 'completion requires a shell: bash|zsh|fish',
    });
  });

  it('errors on completion with an unsupported shell', () => {
    const r = parseArgs(['completion', 'pwsh']);
    expect(r.kind).toBe('error');
  });

  it('parses launch options', () => {
    expect(
      parseArgs([
        '--context',
        'prod',
        '--namespace',
        'app',
        '--kubeconfig',
        '/k',
        '--no-agent',
      ]),
    ).toEqual({
      kind: 'launch',
      options: {
        context: 'prod',
        namespace: 'app',
        kubeconfig: '/k',
        noAgent: true,
      },
    });
  });

  it('errors when a value flag is missing its value', () => {
    expect(parseArgs(['--context']).kind).toBe('error');
    expect(parseArgs(['--namespace', '--no-agent']).kind).toBe('error');
  });

  it('errors on an unknown argument', () => {
    expect(parseArgs(['--bogus'])).toEqual({
      kind: 'error',
      message: 'unknown argument "--bogus"',
    });
  });
});
