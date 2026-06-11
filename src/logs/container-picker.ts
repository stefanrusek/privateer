/**
 * Container selection state matrix for logs (Spec 05 §3.1). Given a pod body,
 * derive the picker options and an auto-selection decision:
 *
 * - Single running container → open directly, no picker.
 * - Multiple containers → picker; default to the single running container if
 *   only one runs, otherwise the first running container.
 * - All terminated (post-mortem) → picker with all greyed, no default.
 * - Init containers shown after regular containers, labeled `(init)`.
 * - A "previous instance" entry is offered for any container whose
 *   `restartCount > 0` (Spec 05 §3.3 "Previous container logs").
 *
 * This module reads only the structural shape it needs from the Kubernetes
 * pod body; unknown / missing fields degrade gracefully.
 */

import type { KubernetesObject } from '../core/types.js';

/** Lifecycle state of a container, driving the picker indicator color. */
export type ContainerPhase = 'running' | 'waiting' | 'terminated';

export interface ContainerOption {
  /** Container name as passed to the logs API. */
  name: string;
  /** Label shown in the picker (name, plus "(init)" for init containers). */
  label: string;
  phase: ContainerPhase;
  /** True for init containers (shown after regular ones). */
  isInit: boolean;
  /** Whether a previous terminated instance exists (restartCount > 0). */
  hasPrevious: boolean;
}

export interface PickerResult {
  /** Regular containers first, then init containers (Spec 05 §3.1). */
  options: ContainerOption[];
  /**
   * Index into `options` to auto-select, or -1 when there is no default
   * (multiple running, or all terminated).
   */
  defaultIndex: number;
  /**
   * When exactly one container is running and it is the only option that
   * matters, the caller may skip the picker entirely. True only for the
   * "single running container" case (Spec 05 §3.1).
   */
  autoOpen: boolean;
}

interface RawStatus {
  name?: unknown;
  state?: unknown;
  restartCount?: unknown;
}

function phaseFromState(state: unknown): ContainerPhase {
  if (state === null || typeof state !== 'object') {
    return 'waiting';
  }
  const s = state as Record<string, unknown>;
  if (s.running !== undefined) {
    return 'running';
  }
  if (s.terminated !== undefined) {
    return 'terminated';
  }
  return 'waiting';
}

function readStatuses(value: unknown): RawStatus[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (s): s is RawStatus => s !== null && typeof s === 'object',
  );
}

function toOptions(statuses: RawStatus[], isInit: boolean): ContainerOption[] {
  const result: ContainerOption[] = [];
  for (const s of statuses) {
    if (typeof s.name !== 'string') {
      continue;
    }
    const restartCount =
      typeof s.restartCount === 'number' ? s.restartCount : 0;
    result.push({
      name: s.name,
      label: isInit ? `${s.name} (init)` : s.name,
      phase: phaseFromState(s.state),
      isInit,
      hasPrevious: restartCount > 0,
    });
  }
  return result;
}

/**
 * Derive the container picker model from a pod body. Regular containers are
 * listed before init containers; the default selection and auto-open flag
 * follow the §3.1 matrix.
 */
export function buildContainerPicker(pod: KubernetesObject): PickerResult {
  const rawStatus: unknown = pod.status;
  const status: Record<string, unknown> =
    rawStatus !== null && typeof rawStatus === 'object'
      ? (rawStatus as Record<string, unknown>)
      : {};

  const regular = toOptions(readStatuses(status.containerStatuses), false);
  const init = toOptions(readStatuses(status.initContainerStatuses), true);
  const options = [...regular, ...init];

  // Index of the first running container, or -1 if none are running.
  const firstRunning = options.findIndex((o) => o.phase === 'running');
  const runningCount = options.filter((o) => o.phase === 'running').length;

  // No running container (all terminated / waiting) → no default (Spec 05 §3.1).
  if (firstRunning < 0) {
    return { options, defaultIndex: -1, autoOpen: false };
  }

  // Single running container that is the only container → open directly,
  // no picker (Spec 05 §3.1).
  if (runningCount === 1 && options.length === 1) {
    return { options, defaultIndex: firstRunning, autoOpen: true };
  }

  // Otherwise show the picker, defaulting to the first running container
  // (the single running one, or the first of several).
  return { options, defaultIndex: firstRunning, autoOpen: false };
}
