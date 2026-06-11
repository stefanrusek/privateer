/**
 * AgentAction — the discriminated union of actions the agent (fast-path or
 * model) can dispatch to the UI layer.
 *
 * Spec 07 §6 — exactly these five variants, no more.
 */

export type AgentAction =
  | { action: 'navigate'; resource: string }
  | { action: 'filter'; namespace?: string; search?: string }
  | { action: 'answer'; text: string }
  | { action: 'multi'; steps: AgentAction[] }
  | { action: 'unknown'; raw: string };

/** The complete set of discriminant values for AgentAction (runtime constant). */
export const AGENT_ACTION_TYPES = [
  'navigate',
  'filter',
  'answer',
  'multi',
  'unknown',
] as const satisfies readonly AgentAction['action'][];
