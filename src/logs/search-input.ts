/**
 * Pure keystroke router for the Logs tab's inline search bar (P9R-0004).
 *
 * The reported bug was keystroke fall-through: while the search bar was
 * open, typed characters (e.g. the `P` in "PASS") were being interpreted as
 * Logs-tab hotkeys (`P` toggles previous-instance logs) instead of being
 * appended to the query. This module is the single source of truth for that
 * routing decision — the controller (`src/adapters/live/controller.ts`, which
 * is thin, uncovered wiring per CLAUDE.md) only interprets the result, so the
 * exclusive-capture guarantee is unit-tested here rather than only reachable
 * by driving a live TUI.
 *
 * Contract: whenever `state.focused` is true, every keystroke is consumed —
 * the result is never `pass-through`. Only when the bar is closed can a key
 * fall through to the rest of the Logs-tab hotkey table.
 */

/** The subset of Ink's key flags this router cares about. */
export interface LogsSearchKeyFlags {
  readonly escape: boolean;
  readonly return: boolean;
  readonly backspace: boolean;
  readonly delete: boolean;
  readonly ctrl: boolean;
  readonly meta: boolean;
}

export interface LogsSearchInputState {
  /** Whether the search bar currently has exclusive input focus. */
  readonly focused: boolean;
  /** The query typed so far (persists after commit, for `n`/`N` and highlight). */
  readonly query: string;
}

export type LogsSearchKeyResult =
  /** `/` while closed: open the bar with exclusive capture. */
  | { readonly kind: 'open' }
  /** Esc while typing: close the bar and clear the query entirely. */
  | { readonly kind: 'close' }
  /** Enter while typing: keep the query, drop focus, commit the search. */
  | { readonly kind: 'commit' }
  /** A printable character while typing: append it to the query. */
  | { readonly kind: 'append'; readonly query: string }
  /** Backspace/Delete while typing: drop the last character. */
  | { readonly kind: 'backspace'; readonly query: string }
  /** A key while typing that is neither text nor a recognized control (e.g. a
   *  bare ctrl/meta chord): consumed but no state change — still exclusive. */
  | { readonly kind: 'ignored' }
  /** Esc while an already-committed search is active (bar closed, query set):
   *  clears the active search and its highlights. */
  | { readonly kind: 'clear-active' }
  /** Not a search key at all — the caller may route it to Logs-tab hotkeys. */
  | { readonly kind: 'pass-through' };

/**
 * Decide how a keystroke should be routed while the Logs tab is focused.
 * See the module doc for the exclusive-capture contract.
 */
export function routeLogsSearchKey(
  input: string,
  key: LogsSearchKeyFlags,
  state: LogsSearchInputState,
): LogsSearchKeyResult {
  if (state.focused) {
    if (key.escape) {
      return { kind: 'close' };
    }
    if (key.return) {
      return { kind: 'commit' };
    }
    if (key.backspace || key.delete) {
      return { kind: 'backspace', query: state.query.slice(0, -1) };
    }
    if (input.length >= 1 && !key.ctrl && !key.meta) {
      return { kind: 'append', query: state.query + input };
    }
    // Any other keystroke (bare ctrl/meta chord, empty input) is still
    // consumed — the bar retains exclusive focus either way.
    return { kind: 'ignored' };
  }
  if (input === '/') {
    return { kind: 'open' };
  }
  if (key.escape && state.query !== '') {
    return { kind: 'clear-active' };
  }
  return { kind: 'pass-through' };
}
