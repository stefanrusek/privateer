/**
 * Errors-as-values (Spec 08 §6.4). Expected failures — 403, 409, stream drop,
 * port-in-use — are returned as typed `Result`s rather than thrown, so every
 * error path is a constructible test input.
 */
export type Result<T, E> = Ok<T> | Err<E>;

export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}
