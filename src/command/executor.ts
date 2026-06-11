/**
 * Action executor — pure reducer that maps an AgentAction onto a UI intent.
 *
 * Spec 07 §6: navigate/filter/multi are supported. answer/unknown are not
 * handled here (they go to the AgentTab display path).
 *
 * All functions are pure — no Ink, no side-effects, no I/O.
 */

import type { AgentAction } from './action.js';

// ---------------------------------------------------------------------------
// UI intent (plain data — no framework dependencies)
// ---------------------------------------------------------------------------

/**
 * Represents the current UI navigation state that can be derived from
 * dispatching an AgentAction.
 */
export interface UiIntent {
  /** Currently selected resource kind in the sidebar */
  kind: string;
  /** Active namespace filter (empty string = all namespaces) */
  namespace: string;
  /** Active text search filter (empty string = no filter) */
  search: string;
}

// ---------------------------------------------------------------------------
// Executor
// ---------------------------------------------------------------------------

/**
 * Apply a navigate action to the current state.
 * Clears search on navigation (spec: navigate clears search filter).
 */
function applyNavigate(
  state: UiIntent,
  action: AgentAction & { action: 'navigate' },
): UiIntent {
  return {
    kind: action.resource,
    namespace: state.namespace,
    search: '',
  };
}

/**
 * Apply a filter action to the current state.
 * Only fields present (non-undefined) in the action are updated.
 */
function applyFilter(
  state: UiIntent,
  action: AgentAction & { action: 'filter' },
): UiIntent {
  return {
    kind: state.kind,
    namespace: action.namespace ?? state.namespace,
    search: action.search ?? state.search,
  };
}

/**
 * Execute an AgentAction as a pure reducer.
 *
 * - `navigate` → selects kind, clears search
 * - `filter`   → updates namespace and/or search
 * - `multi`    → applies steps in sequence
 * - `answer`/`unknown` → state unchanged (handled by AgentTab, not here)
 */
export function executeAction(state: UiIntent, action: AgentAction): UiIntent {
  switch (action.action) {
    case 'navigate':
      return applyNavigate(state, action);
    case 'filter':
      return applyFilter(state, action);
    case 'multi':
      return action.steps.reduce((s, step) => executeAction(s, step), state);
    case 'answer':
      return state;
    case 'unknown':
      return state;
  }
}
