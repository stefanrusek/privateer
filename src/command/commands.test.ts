/**
 * Tests for the bang-command parser.
 */

import { describe, it, expect } from 'vitest';
import { parseBangCommand } from './commands.js';
import { KIND_ALIASES } from './aliases.js';

describe('parseBangCommand', () => {
  // Not a bang command
  it('returns null for non-! input', () => {
    expect(parseBangCommand('pods')).toBeNull();
    expect(parseBangCommand('')).toBeNull();
    expect(parseBangCommand('show pods')).toBeNull();
  });

  // !ctx
  it('"!ctx" returns ctx command', () => {
    expect(parseBangCommand('!ctx')).toEqual({ kind: 'ctx' });
  });

  it('"!CTX" (uppercase) returns ctx command', () => {
    expect(parseBangCommand('!CTX')).toEqual({ kind: 'ctx' });
  });

  // !q / !quit
  it('"!q" returns quit command', () => {
    expect(parseBangCommand('!q')).toEqual({ kind: 'quit' });
  });

  it('"!quit" returns quit command', () => {
    expect(parseBangCommand('!quit')).toEqual({ kind: 'quit' });
  });

  it('"!QUIT" (uppercase) returns quit command', () => {
    expect(parseBangCommand('!QUIT')).toEqual({ kind: 'quit' });
  });

  // !ns <name>
  it('"!ns default" returns ns command', () => {
    expect(parseBangCommand('!ns default')).toEqual({
      kind: 'ns',
      namespace: 'default',
    });
  });

  it('"!ns kube-system" returns ns command', () => {
    expect(parseBangCommand('!ns kube-system')).toEqual({
      kind: 'ns',
      namespace: 'kube-system',
    });
  });

  it('"!ns" alone (no argument) navigates to Namespace via alias', () => {
    const result = parseBangCommand('!ns');
    expect(result).toEqual({
      kind: 'navigate',
      action: { action: 'navigate', resource: 'Namespace' },
    });
  });

  it('"!ns " (trailing space, no name) returns unknown', () => {
    const result = parseBangCommand('!ns ');
    expect(result?.kind).toBe('unknown');
  });

  // !<resource> — table-driven
  it.each([...KIND_ALIASES.entries()])('"!%s" → navigate %s', (alias, kind) => {
    const result = parseBangCommand(`!${alias}`);
    expect(result).toEqual({
      kind: 'navigate',
      action: { action: 'navigate', resource: kind },
    });
  });

  // Case-insensitive resource
  it('"!PODS" (uppercase) → navigate Pod', () => {
    expect(parseBangCommand('!PODS')).toEqual({
      kind: 'navigate',
      action: { action: 'navigate', resource: 'Pod' },
    });
  });

  it('"!Deploy" (mixed case) → navigate Deployment', () => {
    expect(parseBangCommand('!Deploy')).toEqual({
      kind: 'navigate',
      action: { action: 'navigate', resource: 'Deployment' },
    });
  });

  // Unknown
  it('"!unknown" returns unknown command', () => {
    const result = parseBangCommand('!unknown');
    expect(result).toEqual({ kind: 'unknown', raw: '!unknown' });
  });

  it('"!xyz123" returns unknown command', () => {
    const result = parseBangCommand('!xyz123');
    expect(result?.kind).toBe('unknown');
  });
});
