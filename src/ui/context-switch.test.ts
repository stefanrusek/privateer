import { describe, it, expect } from 'vitest';
import {
  beginSwitch,
  onSync,
  onError,
  retryTarget,
  isError,
  type SwitchStatus,
} from './context-switch.js';

// ---------------------------------------------------------------------------
// beginSwitch
// ---------------------------------------------------------------------------

describe('beginSwitch', () => {
  it('enters the connecting phase for the target', () => {
    expect(beginSwitch('prod')).toEqual({ ctx: 'prod', phase: 'connecting' });
  });
});

// ---------------------------------------------------------------------------
// onSync — first successful sync clears connecting
// ---------------------------------------------------------------------------

describe('onSync', () => {
  it('clears connecting on the first sync for the same context', () => {
    expect(onSync(beginSwitch('prod'), 'prod')).toBeNull();
  });

  it('ignores a sync for a different context while connecting', () => {
    const status = beginSwitch('prod');
    expect(onSync(status, 'staging')).toBe(status);
  });

  it('is a no-op when idle', () => {
    expect(onSync(null, 'prod')).toBeNull();
  });

  it('does not dismiss an error banner on a stray sync', () => {
    const errStatus: SwitchStatus = {
      ctx: 'prod',
      phase: 'error',
      reason: 'unreachable',
    };
    expect(onSync(errStatus, 'prod')).toBe(errStatus);
  });
});

// ---------------------------------------------------------------------------
// onError — connecting → error
// ---------------------------------------------------------------------------

describe('onError', () => {
  it('transitions connecting → error for the matching context', () => {
    expect(onError(beginSwitch('prod'), 'prod', 'unreachable')).toEqual({
      ctx: 'prod',
      phase: 'error',
      reason: 'unreachable',
    });
  });

  it('ignores an error for a different context', () => {
    const status = beginSwitch('prod');
    expect(onError(status, 'staging', 'boom')).toBe(status);
  });

  it('is a no-op when idle', () => {
    expect(onError(null, 'prod', 'boom')).toBeNull();
  });

  it('keeps the existing error on a second failure', () => {
    const errStatus: SwitchStatus = {
      ctx: 'prod',
      phase: 'error',
      reason: 'first',
    };
    expect(onError(errStatus, 'prod', 'second')).toBe(errStatus);
  });
});

// ---------------------------------------------------------------------------
// retry flow
// ---------------------------------------------------------------------------

describe('retryTarget', () => {
  it('returns the context to retry while in error', () => {
    const errStatus: SwitchStatus = {
      ctx: 'prod',
      phase: 'error',
      reason: 'x',
    };
    expect(retryTarget(errStatus)).toBe('prod');
  });

  it('is null while connecting', () => {
    expect(retryTarget(beginSwitch('prod'))).toBeNull();
  });

  it('is null when idle', () => {
    expect(retryTarget(null)).toBeNull();
  });

  it('retry restarts the connecting phase via beginSwitch', () => {
    const errStatus: SwitchStatus = {
      ctx: 'prod',
      phase: 'error',
      reason: 'x',
    };
    const target = retryTarget(errStatus);
    expect(target).not.toBeNull();
    const retried = beginSwitch(target!);
    expect(retried).toEqual({ ctx: 'prod', phase: 'connecting' });
    // A subsequent sync now clears it.
    expect(onSync(retried, 'prod')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isError
// ---------------------------------------------------------------------------

describe('isError', () => {
  it('is false when idle', () => {
    expect(isError(null)).toBe(false);
  });

  it('is false while connecting', () => {
    expect(isError(beginSwitch('prod'))).toBe(false);
  });

  it('is true in the error phase', () => {
    expect(isError({ ctx: 'prod', phase: 'error', reason: 'x' })).toBe(true);
  });
});
