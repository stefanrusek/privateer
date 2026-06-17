/**
 * container-phase.ts — pure phase→color mapping for the Logs container dropdown
 * (navigation-overhaul chunk 06 / B06).
 *
 * Spec: `specs/navigation-overhaul/06-inline-logs-container-picker.md` ("The
 * container dropdown"). Each dropdown item shows a phase dot whose color reflects
 * the container's lifecycle state: running = green, waiting = yellow,
 * terminated = grey. Kept as a tiny, total, fully-covered function so the
 * dropdown item builder and any future consumer agree on the mapping.
 */

import type { ContainerPhase } from '../logs/container-picker.js';

/** An Ink color name used for the phase dot. */
export type InkColor = 'green' | 'yellow' | 'gray';

/**
 * Map a {@link ContainerPhase} to its dot color. The switch is exhaustive over
 * the discriminated phase union (running/waiting/terminated).
 */
export function containerPhaseColor(phase: ContainerPhase): InkColor {
  switch (phase) {
    case 'running':
      return 'green';
    case 'waiting':
      return 'yellow';
    case 'terminated':
      return 'gray';
  }
}
