/**
 * Log search over the buffered lines (Spec 05 §3.3 "Log search"). Search works
 * on buffered lines only — historical lines outside the current line limit are
 * not searched. `n` / `N` jump to the next / previous match (vim convention),
 * wrapping around the ends.
 *
 * A "match" is a line that contains the query as a case-insensitive substring.
 * The result tracks the indices of matching lines and a cursor into that list.
 */

export interface SearchState {
  /** The query string (empty means "no active search"). */
  query: string;
  /** Indices into the source line array that match `query`, ascending. */
  matches: number[];
  /**
   * Cursor into `matches`, or -1 when there is no current match (empty query
   * or zero matches).
   */
  current: number;
}

/** An empty / inactive search. */
export function emptySearch(): SearchState {
  return { query: '', matches: [], current: -1 };
}

/**
 * Compute the line indices in `lines` that contain `query` (case-insensitive).
 * An empty query yields no matches.
 */
export function findMatches(lines: readonly string[], query: string): number[] {
  if (query === '') {
    return [];
  }
  const needle = query.toLowerCase();
  const result: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line?.toLowerCase().includes(needle) === true) {
      result.push(i);
    }
  }
  return result;
}

/**
 * Start (or update) a search for `query` over `lines`. The cursor is placed on
 * the first match, or -1 if there are none.
 */
export function runSearch(
  lines: readonly string[],
  query: string,
): SearchState {
  const matches = findMatches(lines, query);
  return {
    query,
    matches,
    current: matches.length > 0 ? 0 : -1,
  };
}

/**
 * Advance to the next match (vim `n`), wrapping from the last back to the
 * first. A no-match state is returned unchanged.
 */
export function nextMatch(state: SearchState): SearchState {
  if (state.matches.length === 0) {
    return state;
  }
  const current = (state.current + 1) % state.matches.length;
  return { ...state, current };
}

/**
 * Move to the previous match (vim `N`), wrapping from the first back to the
 * last. A no-match state is returned unchanged.
 */
export function prevMatch(state: SearchState): SearchState {
  if (state.matches.length === 0) {
    return state;
  }
  const current =
    (state.current - 1 + state.matches.length) % state.matches.length;
  return { ...state, current };
}

/** The source-line index of the current match, or -1 if none. */
export function currentMatchLine(state: SearchState): number {
  if (state.current < 0) {
    return -1;
  }
  return state.matches[state.current] ?? -1;
}
