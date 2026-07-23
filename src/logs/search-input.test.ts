import { describe, expect, it } from 'vitest';
import { routeLogsSearchKey, type LogsSearchKeyFlags } from './search-input.js';

const NO_MODS: LogsSearchKeyFlags = {
  escape: false,
  return: false,
  backspace: false,
  delete: false,
  ctrl: false,
  meta: false,
};

function key(over: Partial<LogsSearchKeyFlags> = {}): LogsSearchKeyFlags {
  return { ...NO_MODS, ...over };
}

describe('routeLogsSearchKey', () => {
  it('opens the bar on "/" while closed', () => {
    expect(
      routeLogsSearchKey('/', key(), { focused: false, query: '' }),
    ).toEqual({ kind: 'open' });
  });

  it('passes other keys through while closed and inactive', () => {
    for (const input of ['p', 't', 'w', 'P', 'd', 'o', 'l', 'n', 'N']) {
      expect(
        routeLogsSearchKey(input, key(), { focused: false, query: '' }),
      ).toEqual({ kind: 'pass-through' });
    }
  });

  // The reported bug: every Logs-tab hotkey letter, typed while the search bar
  // is focused, must be captured as query text — never fall through.
  it.each(['p', 't', 'w', 'P', 'd', 'o', 'l', 'n', 'N', 'q', 'A', 'S', 'S'])(
    'captures %s exclusively while focused instead of letting it fall through',
    (input) => {
      const result = routeLogsSearchKey(input, key(), {
        focused: true,
        query: 'PAS',
      });
      expect(result.kind).not.toBe('pass-through');
      expect(result).toEqual({ kind: 'append', query: `PAS${input}` });
    },
  );

  it('reproduces the exact regression: typing "PASS" while focused appends every character', () => {
    let state = { focused: true, query: '' };
    for (const ch of 'PASS') {
      const result = routeLogsSearchKey(ch, key(), state);
      expect(result.kind).toBe('append');
      if (result.kind === 'append') {
        state = { ...state, query: result.query };
      }
    }
    expect(state.query).toBe('PASS');
  });

  it('appends printable text while focused', () => {
    expect(
      routeLogsSearchKey('x', key(), { focused: true, query: 'ab' }),
    ).toEqual({ kind: 'append', query: 'abx' });
  });

  it('backspaces on backspace while focused', () => {
    expect(
      routeLogsSearchKey('', key({ backspace: true }), {
        focused: true,
        query: 'abc',
      }),
    ).toEqual({ kind: 'backspace', query: 'ab' });
  });

  it('backspaces on delete while focused', () => {
    expect(
      routeLogsSearchKey('', key({ delete: true }), {
        focused: true,
        query: 'abc',
      }),
    ).toEqual({ kind: 'backspace', query: 'ab' });
  });

  it('commits on Enter while focused, keeping the query implicit to the caller', () => {
    expect(
      routeLogsSearchKey('', key({ return: true }), {
        focused: true,
        query: 'retry',
      }),
    ).toEqual({ kind: 'commit' });
  });

  it('closes and clears on Esc while focused', () => {
    expect(
      routeLogsSearchKey('', key({ escape: true }), {
        focused: true,
        query: 'retry',
      }),
    ).toEqual({ kind: 'close' });
  });

  it('ignores a bare ctrl chord while focused without leaking to hotkeys', () => {
    expect(
      routeLogsSearchKey('p', key({ ctrl: true }), {
        focused: true,
        query: 'a',
      }),
    ).toEqual({ kind: 'ignored' });
  });

  it('ignores a bare meta chord while focused without leaking to hotkeys', () => {
    expect(
      routeLogsSearchKey('p', key({ meta: true }), {
        focused: true,
        query: 'a',
      }),
    ).toEqual({ kind: 'ignored' });
  });

  it('ignores empty input while focused', () => {
    expect(
      routeLogsSearchKey('', key(), { focused: true, query: 'a' }),
    ).toEqual({ kind: 'ignored' });
  });

  it('clears an active (committed) search on Esc when not focused', () => {
    expect(
      routeLogsSearchKey('', key({ escape: true }), {
        focused: false,
        query: 'retry',
      }),
    ).toEqual({ kind: 'clear-active' });
  });

  it('does not clear when Esc is pressed with no active search', () => {
    expect(
      routeLogsSearchKey('', key({ escape: true }), {
        focused: false,
        query: '',
      }),
    ).toEqual({ kind: 'pass-through' });
  });

  it('lets n/N pass through when a committed search is active (not focused)', () => {
    expect(
      routeLogsSearchKey('n', key(), { focused: false, query: 'retry' }),
    ).toEqual({ kind: 'pass-through' });
    expect(
      routeLogsSearchKey('N', key(), { focused: false, query: 'retry' }),
    ).toEqual({ kind: 'pass-through' });
  });
});
