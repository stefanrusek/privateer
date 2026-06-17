/**
 * yaml-apply.ts — the pure apply / confirm / conflict state machine for the
 * YAML editor's save flow (navigation-overhaul chunk 07 / B07).
 *
 * Spec: `specs/navigation-overhaul/07-yaml-editor.md` ("Save / confirm /
 * conflict flow" + "Pure modules" → `src/ui/yaml-apply.ts`). **The ENTIRE
 * transition logic lives here.** The controller (coverage-excluded) only
 * performs the side effects this reducer asks for — `kubeClient.replace` and
 * `kubeClient.get` — and feeds their results back in as events. If a transition
 * decision leaked into the controller it would become untestable.
 *
 * The "Save with confirm" step IS the diff review: `Ctrl+S` (validate, done by
 * the editor) hands a `newYaml` string to the controller, which opens this
 * machine in `diff`. Pressing `[Apply]`/Enter moves `diff → applying`; the
 * cluster result lands as `applied` (→ read mode), `conflict` (409, offering
 * reload-&-re-edit), or `error` (other failure, shown over the diff). From
 * `conflict`, `[Reload & re-edit]`/`r` performs a fresh `get` (`reloading`),
 * which lands the freshly fetched resource back into the editor, or surfaces an
 * error. `[Cancel]`/`Esc` and `[Discard]` leave the machine.
 *
 * `status` is an exhaustive discriminated union — every `switch` over it has no
 * `default`. The reducer is total: an event that does not apply to the current
 * status returns the state unchanged.
 */

/** The apply machine's status (exhaustive discriminated union). */
export type ApplyStatus =
  /** Reviewing the diff; nothing has touched the cluster. */
  | { readonly kind: 'diff' }
  /** A `replace` is in flight. */
  | { readonly kind: 'applying' }
  /** The replace failed with a non-409 error, shown over the diff. */
  | { readonly kind: 'error'; readonly message: string }
  /** The cluster returned 409; offering reload-&-re-edit or discard. */
  | { readonly kind: 'conflict' }
  /** A fresh `get` (for reload-&-re-edit) is in flight. */
  | { readonly kind: 'reloading' };

/** The side effect the controller should perform next, or `none`. */
export type ApplyEffect =
  | { readonly kind: 'none' }
  /** Call `kubeClient.replace`, then feed back `applyResolved`. */
  | { readonly kind: 'replace' }
  /** Call `kubeClient.get`, then feed back `reloadResolved`. */
  | { readonly kind: 'reload' };

/** The terminal outcome the controller acts on (mount/unmount the editor). */
export type ApplyOutcome =
  | { readonly kind: 'none' }
  /** Apply succeeded — return the tab to read mode. */
  | { readonly kind: 'applied' }
  /** Leave the flow, keeping the pending edits (return to edit mode). */
  | { readonly kind: 'cancelled' }
  /** Leave the flow, discarding the pending edits (return to read mode). */
  | { readonly kind: 'discarded' }
  /** Re-open the editor on freshly fetched YAML (reload-&-re-edit). */
  | { readonly kind: 'reloaded'; readonly yaml: string };

/** A reducer step: the next status plus the effect/outcome it triggers. */
export interface ApplyStep {
  readonly status: ApplyStatus;
  readonly effect: ApplyEffect;
  readonly outcome: ApplyOutcome;
}

/** The result of a `replace` call, fed back via {@link applyResolved}. */
export type ReplaceResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly conflict: true }
  | { readonly ok: false; readonly conflict: false; readonly message: string };

/** The result of a reload `get` call, fed back via {@link reloadResolved}. */
export type ReloadResult =
  | { readonly ok: true; readonly yaml: string }
  | { readonly ok: false; readonly message: string };

const NONE: ApplyEffect = { kind: 'none' };
const NO_OUTCOME: ApplyOutcome = { kind: 'none' };

/** The starting status when the editor hands a valid `newYaml` to the diff. */
export function initialApplyStatus(): ApplyStatus {
  return { kind: 'diff' };
}

/** Keep the current status; no effect, no outcome (a no-op step). */
function stay(status: ApplyStatus): ApplyStep {
  return { status, effect: NONE, outcome: NO_OUTCOME };
}

/**
 * `[Apply]` / Enter from the diff (or after a shown error): start the replace.
 * Ignored while a request is already in flight or after a conflict.
 */
export function pressApply(status: ApplyStatus): ApplyStep {
  switch (status.kind) {
    case 'diff':
    case 'error':
      return {
        status: { kind: 'applying' },
        effect: { kind: 'replace' },
        outcome: NO_OUTCOME,
      };
    case 'applying':
    case 'conflict':
    case 'reloading':
      return stay(status);
  }
}

/** The replace effect resolved: route to applied / conflict / error. */
export function applyResolved(
  status: ApplyStatus,
  result: ReplaceResult,
): ApplyStep {
  if (status.kind !== 'applying') {
    return stay(status);
  }
  if (result.ok) {
    return {
      status: { kind: 'diff' },
      effect: NONE,
      outcome: { kind: 'applied' },
    };
  }
  if (result.conflict) {
    return { status: { kind: 'conflict' }, effect: NONE, outcome: NO_OUTCOME };
  }
  return {
    status: { kind: 'error', message: result.message },
    effect: NONE,
    outcome: NO_OUTCOME,
  };
}

/**
 * `[Reload & re-edit]` / `r` from a conflict: fetch the fresh resource.
 * Ignored from any other status.
 */
export function pressReload(status: ApplyStatus): ApplyStep {
  if (status.kind !== 'conflict') {
    return stay(status);
  }
  return {
    status: { kind: 'reloading' },
    effect: { kind: 'reload' },
    outcome: NO_OUTCOME,
  };
}

/** The reload effect resolved: re-open the editor on the fresh YAML, or error. */
export function reloadResolved(
  status: ApplyStatus,
  result: ReloadResult,
): ApplyStep {
  if (status.kind !== 'reloading') {
    return stay(status);
  }
  if (result.ok) {
    return {
      status: { kind: 'diff' },
      effect: NONE,
      outcome: { kind: 'reloaded', yaml: result.yaml },
    };
  }
  return {
    status: { kind: 'error', message: result.message },
    effect: NONE,
    outcome: NO_OUTCOME,
  };
}

/**
 * `[Cancel]` / `Esc`:
 * - from the diff or a shown error → cancel (back to edit, keep edits);
 * - from a conflict → discard (back to read, throw edits away);
 * - while a request is in flight → ignored.
 */
export function pressCancel(status: ApplyStatus): ApplyStep {
  switch (status.kind) {
    case 'diff':
    case 'error':
      return { status, effect: NONE, outcome: { kind: 'cancelled' } };
    case 'conflict':
      return { status, effect: NONE, outcome: { kind: 'discarded' } };
    case 'applying':
    case 'reloading':
      return stay(status);
  }
}
