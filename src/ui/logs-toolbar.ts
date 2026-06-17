/**
 * logs-toolbar.ts — pure item builders + accelerator map for the Logs toolbar
 * (navigation-overhaul chunk 06 / B06).
 *
 * Spec: `specs/002-navigation-overhaul/06-inline-logs-container-picker.md`.
 *
 * The Logs toolbar's `[Co̲ntainer ▾]` and `[NNN l̲ines ▾]` controls are chunk-04
 * `<DropdownButton>`s. The *specifics* of what those dropdowns list — phase
 * dots, `(init)` labels, the current-container marker, the line-limit options —
 * are pure, fully-covered builders here so the glue in `src/adapters/live/`
 * stays a thin wiring of refs/effects. The accelerator map is the single source
 * of truth for the toolbar's trigger letters, read by both the controller (key
 * routing) and the chunk-09 help overlay (so the advertised key never drifts).
 */

import type { ContainerOption } from '../logs/container-picker.js';
import { LINE_OPTIONS, type LineOptionId } from '../logs/line-options.js';
import { containerPhaseColor, type InkColor } from './container-phase.js';

/** Glyph shown before each container, colored by phase. */
const PHASE_DOT = '●';
/** Marker appended to the currently streamed container. */
const CURRENT_MARKER = '✓';

/**
 * A dropdown item enriched for the Logs container list: the `{ id, label }`
 * shape the `<DropdownButton>` consumes, plus the phase-dot color and a
 * current-container flag for a richer renderer. `label` already folds in the
 * phase dot, the (init) suffix, and the current marker so a plain-label overlay
 * still shows them.
 */
export interface LogsContainerItem {
  /** Stable id (the container name). */
  id: string;
  /** Display label: `● name [(init)] [✓]`. */
  label: string;
  /** Phase-dot color (green/yellow/gray). */
  dotColor: InkColor;
  /** True for the currently streamed container. */
  current: boolean;
}

/** A line-limit dropdown item. */
export interface LogsLineLimitItem {
  /** The {@link LineOptionId}. */
  id: LineOptionId;
  /** Display label (e.g. "Last 100 lines"). */
  label: string;
  /** True for the currently selected limit. */
  current: boolean;
}

/**
 * Build the container dropdown items from the picker options. Each item carries
 * a phase dot (color via {@link containerPhaseColor}), the option's `label`
 * (which already includes `(init)` for init containers), and a `✓` marker on the
 * container matching `currentName`.
 */
export function buildContainerItems(
  options: readonly ContainerOption[],
  currentName: string,
): LogsContainerItem[] {
  return options.map((option) => {
    const current = option.name === currentName;
    const marker = current ? ` ${CURRENT_MARKER}` : '';
    return {
      id: option.name,
      label: `${PHASE_DOT} ${option.label}${marker}`,
      dotColor: containerPhaseColor(option.phase),
      current,
    };
  });
}

/**
 * Build the line-limit dropdown items from the canonical {@link LINE_OPTIONS},
 * marking the one matching `current`.
 */
export function buildLineLimitItems(
  current: LineOptionId,
): LogsLineLimitItem[] {
  return LINE_OPTIONS.map((option) => ({
    id: option.id,
    label: option.label,
    current: option.id === current,
  }));
}

/**
 * The Logs toolbar control ids — stable registry ids for the measured widgets
 * and the keys of {@link LOGS_TOOLBAR_ACCELERATORS}.
 */
export type LogsToolbarId =
  | 'logs.container'
  | 'logs.lineLimit'
  | 'logs.pause'
  | 'logs.timestamps'
  | 'logs.wrap'
  | 'logs.download';

/**
 * The accelerator key for each toolbar control. The container dropdown opens
 * with `o` (a letter in "C**o**ntainer"; plain `c` is reserved for the chunk-08
 * context switcher), the line-limit with `l`; the toggles use their leading
 * letter. This map is the single source of truth shared by the controller's key
 * routing and the chunk-09 help overlay.
 */
export const LOGS_TOOLBAR_ACCELERATORS: Readonly<
  Record<LogsToolbarId, string>
> = {
  'logs.container': 'o',
  'logs.lineLimit': 'l',
  'logs.pause': 'p',
  'logs.timestamps': 't',
  'logs.wrap': 'w',
  'logs.download': 'd',
};
