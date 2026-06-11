/**
 * Line-limit and since options for the log stream (Spec 05 §3.3 "Line limit /
 * since picker"). Changing the selection restarts the stream from the new
 * offset; this module maps a selected option to the concrete stream parameters
 * (`tailLines` / `sinceSeconds`) the LogStream boundary understands.
 */

/** The identifier of a picker option (stable, used as a key). */
export type LineOptionId =
  | 'last-100'
  | 'last-500'
  | 'last-1000'
  | 'last-5000'
  | 'all'
  | 'since-15m'
  | 'since-1h'
  | 'since-6h'
  | 'since-24h';

export interface LineOption {
  id: LineOptionId;
  /** Label shown in the dropdown (Spec 05 §3.3). */
  label: string;
  /** Label shown on the toolbar button when selected (e.g. "100 lines"). */
  buttonLabel: string;
}

/** The ordered set of picker options, default first (Spec 05 §3.3). */
export const LINE_OPTIONS: readonly LineOption[] = [
  { id: 'last-100', label: 'Last 100 lines', buttonLabel: '100 lines' },
  { id: 'last-500', label: 'Last 500 lines', buttonLabel: '500 lines' },
  { id: 'last-1000', label: 'Last 1000 lines', buttonLabel: '1000 lines' },
  { id: 'last-5000', label: 'Last 5000 lines', buttonLabel: '5000 lines' },
  { id: 'all', label: 'All available', buttonLabel: 'All' },
  { id: 'since-15m', label: 'Since 15 minutes', buttonLabel: '15m' },
  { id: 'since-1h', label: 'Since 1 hour', buttonLabel: '1h' },
  { id: 'since-6h', label: 'Since 6 hours', buttonLabel: '6h' },
  { id: 'since-24h', label: 'Since 24 hours', buttonLabel: '24h' },
];

/** The default selection — last 100 lines (Spec 05 §3.3). */
export const DEFAULT_LINE_OPTION: LineOptionId = 'last-100';

/** Stream parameters derived from a selected option. */
export interface StreamParams {
  /** Max lines to retrieve initially, or undefined for "all". */
  tailLines?: number;
  /** Only return logs newer than this many seconds, or undefined. */
  sinceSeconds?: number;
}

const TAIL_LINES: Partial<Record<LineOptionId, number>> = {
  'last-100': 100,
  'last-500': 500,
  'last-1000': 1000,
  'last-5000': 5000,
};

const SINCE_SECONDS: Partial<Record<LineOptionId, number>> = {
  'since-15m': 15 * 60,
  'since-1h': 60 * 60,
  'since-6h': 6 * 60 * 60,
  'since-24h': 24 * 60 * 60,
};

/** Look up a line option by id, or undefined if unknown. */
export function findLineOption(id: LineOptionId): LineOption | undefined {
  return LINE_OPTIONS.find((o) => o.id === id);
}

/**
 * Map a selected option to concrete stream parameters. `tailLines` is set for
 * the "last N" options; `sinceSeconds` for the "since" options; `all` yields an
 * empty params object (the whole available log).
 */
export function streamParamsFor(id: LineOptionId): StreamParams {
  const tail = TAIL_LINES[id];
  if (tail !== undefined) {
    return { tailLines: tail };
  }
  const since = SINCE_SECONDS[id];
  if (since !== undefined) {
    return { sinceSeconds: since };
  }
  return {};
}
