import { describe, it, expect } from 'vitest';
import {
  buildKubectlExecArgs,
  isCommandNotFoundError,
  extractMissingExecutable,
  describeExecFailure,
  DEFAULT_SHELL,
  FALLBACK_SHELL,
} from './exec-command.js';

describe('DEFAULT_SHELL / FALLBACK_SHELL', () => {
  it('are the expected shells', () => {
    expect(DEFAULT_SHELL).toBe('/bin/bash');
    expect(FALLBACK_SHELL).toBe('/bin/sh');
  });
});

describe('buildKubectlExecArgs', () => {
  it('execs the default shell directly, without an sh -c wrapper', () => {
    expect(
      buildKubectlExecArgs('ns', 'pod', 'container', '/bin/bash', true),
    ).toEqual([
      'exec',
      '-it',
      '-n',
      'ns',
      'pod',
      '-c',
      'container',
      '--',
      '/bin/bash',
    ]);
  });

  it('wraps a user-entered command through sh -c', () => {
    expect(
      buildKubectlExecArgs('ns', 'pod', 'container', 'ls -la | wc -l', false),
    ).toEqual([
      'exec',
      '-it',
      '-n',
      'ns',
      'pod',
      '-c',
      'container',
      '--',
      'sh',
      '-c',
      'ls -la | wc -l',
    ]);
  });
});

describe('isCommandNotFoundError', () => {
  it('detects the OCI runtime "executable file not found" diagnostic', () => {
    expect(
      isCommandNotFoundError(
        'OCI runtime exec failed: exec failed: unable to start container process: exec: "sh": executable file not found in $PATH: unknown',
      ),
    ).toBe(true);
  });

  it('is false for unrelated errors', () => {
    expect(isCommandNotFoundError('Error from server (Forbidden): ...')).toBe(
      false,
    );
    expect(isCommandNotFoundError('')).toBe(false);
  });
});

describe('extractMissingExecutable', () => {
  it('pulls the missing executable name out of the stderr text', () => {
    expect(
      extractMissingExecutable(
        'exec: "sh": executable file not found in $PATH: unknown',
      ),
    ).toBe('sh');
  });

  it('returns undefined when the pattern does not match', () => {
    expect(extractMissingExecutable('Error from server (Forbidden)')).toBe(
      undefined,
    );
  });
});

describe('describeExecFailure', () => {
  it('produces a friendly message for a missing executable', () => {
    expect(
      describeExecFailure(
        'OCI runtime exec failed: exec failed: unable to start container process: exec: "sh": executable file not found in $PATH: unknown',
      ),
    ).toBe(
      'exec failed: "sh" not found in container — try a different command',
    );
  });

  it('falls back to the first stderr line, stripping a kubectl "error:" prefix', () => {
    expect(
      describeExecFailure(
        'error: Forbidden: exec is disallowed by policy\nmore detail on line two',
      ),
    ).toBe('exec failed: Forbidden: exec is disallowed by policy');
  });

  it('falls back to "unknown error" when stderr is blank', () => {
    expect(describeExecFailure('   ')).toBe('exec failed: unknown error');
  });
});
