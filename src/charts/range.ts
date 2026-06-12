/**
 * Range selector model (Spec 06 §4.1).
 *
 * Defines available time ranges: 20m / 1h / 4h / 1d / 2d.
 * Default: 1h. Selection persisted per resource type per session.
 * Pure functions only — no side effects.
 */

/** Available time range labels. */
export type RangeLabel = '20m' | '1h' | '4h' | '1d' | '2d';

/** Duration in milliseconds for each range. */
const RANGE_MS: Readonly<Record<RangeLabel, number>> = {
  '20m': 20 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
  '2d': 2 * 24 * 60 * 60 * 1000,
};

/** Ordered list of all available range labels. */
export const ALL_RANGES: readonly RangeLabel[] = [
  '20m',
  '1h',
  '4h',
  '1d',
  '2d',
];

/** Default range label. */
export const DEFAULT_RANGE: RangeLabel = '1h';

/** Range selector model — immutable value type. */
export interface RangeSelectorModel {
  /** Currently selected range. */
  readonly selected: RangeLabel;
  /** All available options in display order. */
  readonly options: readonly RangeLabel[];
}

/**
 * Create a fresh range selector with the default selection.
 */
export function createRangeSelector(): RangeSelectorModel {
  return {
    selected: DEFAULT_RANGE,
    options: ALL_RANGES,
  };
}

/**
 * Return a new range selector model with the given label selected.
 * If the label is not a valid option, returns the model unchanged.
 */
export function selectRange(
  model: RangeSelectorModel,
  label: RangeLabel,
): RangeSelectorModel {
  if (!ALL_RANGES.includes(label)) {
    return model;
  }
  return { ...model, selected: label };
}

/**
 * Return the duration in milliseconds for the given range label.
 */
export function rangeDurationMs(label: RangeLabel): number {
  return RANGE_MS[label];
}

/**
 * Given a range selector model and a "now" time (epoch ms), return the
 * start time for the currently selected range.
 */
export function rangeStartMs(model: RangeSelectorModel, nowMs: number): number {
  return nowMs - rangeDurationMs(model.selected);
}
