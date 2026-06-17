/**
 * context-switch.ts — pure switch-status state machine (navigation-overhaul
 * chunk 08 / B08).
 *
 * Spec: `specs/002-navigation-overhaul/08-context-switching-polish.md` §3
 * ("Connecting / error feedback") and "Where the logic lives".
 *
 * Switching kube context is no longer assumed instant. While a switch is in
 * flight the header shows a transient status; on the first successful stream
 * sync it clears, and on a connection failure it surfaces a persistent banner
 * with [Retry] / [Switch context]. This module owns that machine — purely and
 * event-driven (driven by the existing stream/connection signals), so it needs
 * **no timer**. Were a connect timeout ever added it would come through the
 * injected `Clock` boundary, never an ambient `Date.now()`; today it does not.
 *
 * `SwitchStatus` is a discriminated union; every consumer `switch`es it
 * exhaustively with no `default`.
 */

/** The status of an in-flight (or just-failed) context switch. */
export type SwitchStatus =
  | { readonly ctx: string; readonly phase: 'connecting' }
  | { readonly ctx: string; readonly phase: 'error'; readonly reason: string }
  | null;

/**
 * Begin (or restart) a switch to `ctx`: the header enters the `connecting`
 * state. Used both on first pick and on [Retry].
 */
export function beginSwitch(ctx: string): SwitchStatus {
  return { ctx, phase: 'connecting' };
}

/**
 * The first successful stream sync arrived. Clears the status to `null` — but
 * only while we are still `connecting` to the same context: a stray sync after
 * an error (or for an unrelated context) must not silently dismiss the error
 * banner. Idempotent once cleared.
 */
export function onSync(status: SwitchStatus, ctx: string): SwitchStatus {
  if (status === null) {
    return null;
  }
  switch (status.phase) {
    case 'connecting':
      return status.ctx === ctx ? null : status;
    case 'error':
      return status;
  }
}

/**
 * A connection failure for the switch in flight. Transitions `connecting` →
 * `error` (carrying the reason) for the matching context; an error for some
 * other context, or while idle, is ignored so a late failure from a previous
 * attempt cannot clobber the current state.
 */
export function onError(
  status: SwitchStatus,
  ctx: string,
  reason: string,
): SwitchStatus {
  if (status === null) {
    return null;
  }
  switch (status.phase) {
    case 'connecting':
      return status.ctx === ctx ? { ctx, phase: 'error', reason } : status;
    case 'error':
      return status;
  }
}

/**
 * The context the user should retry, if the switch is currently in the error
 * state; otherwise `null`. Lets the controller re-run `startStreams` for the
 * right target without duplicating the discriminated-union check.
 */
export function retryTarget(status: SwitchStatus): string | null {
  if (status === null) {
    return null;
  }
  switch (status.phase) {
    case 'connecting':
      return null;
    case 'error':
      return status.ctx;
  }
}

/** Whether a banner (error) should be shown for `status`. */
export function isError(status: SwitchStatus): boolean {
  if (status === null) {
    return false;
  }
  switch (status.phase) {
    case 'connecting':
      return false;
    case 'error':
      return true;
  }
}
