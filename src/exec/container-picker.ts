/**
 * Container selection logic for exec (Spec 05 §4.1).
 * Mirrors the logs container-selection rules: auto-select a single running
 * container; show a picker for multiple containers or all-terminated cases.
 */

/** Coarse phase of a container as reported by Kubernetes. */
export type ContainerPhase = 'running' | 'waiting' | 'terminated';

/** One entry in the container picker. */
export interface ContainerEntry {
  name: string;
  phase: ContainerPhase;
  /** True for init containers (shown after regular containers). */
  init: boolean;
}

/** Result of the container-selection decision. */
export type ContainerSelection =
  | { kind: 'autoSelected'; container: string }
  | {
      kind: 'picker';
      entries: ContainerEntry[];
      defaultContainer: string | null;
    };

/**
 * Decide whether to auto-select or show a picker.
 *
 * Rules (Spec 05 §4.1, mirrors §3.1):
 * - Single running container → auto-select it.
 * - Multiple containers (running or otherwise) → show picker.
 * - All terminated → show picker with null default.
 */
export function selectContainer(entries: ContainerEntry[]): ContainerSelection {
  if (entries.length === 0) {
    return { kind: 'picker', entries: [], defaultContainer: null };
  }

  const running = entries.filter((e) => e.phase === 'running');

  const firstRunning = running[0];
  if (
    running.length === 1 &&
    entries.length === 1 &&
    firstRunning !== undefined
  ) {
    return { kind: 'autoSelected', container: firstRunning.name };
  }

  // Determine default: first running container, or null if all terminated.
  const defaultContainer =
    firstRunning !== undefined ? firstRunning.name : null;

  return { kind: 'picker', entries, defaultContainer };
}
