import type { AppState } from '../ui/types.js';

export interface InitialStateInput {
  context: string;
  namespace: string;
  contexts: readonly string[];
  namespaces: readonly string[];
}

/**
 * Build the initial UI state for a launch (pure). The Health/Overview view is
 * the default landing (Spec 06 §5.1); the sidebar holds focus; default split
 * ratios match Spec 02 §2.
 */
export function initialAppState(input: InitialStateInput): AppState {
  return {
    context: input.context,
    namespace: input.namespace,
    allNamespaces: input.namespaces,
    allContexts: input.contexts,
    activeKind: 'Overview',
    search: '',
    mode: 'normal',
    focus: 'sidebar',
    collapsedCategories: new Set(),
    badgeCounts: new Map(),
    dimmedKinds: new Set(),
    forbiddenKinds: new Set(),
    showDetail: false,
    contextSwitcherOpen: false,
    helpOpen: false,
    sidebarRatio: 0.2,
    verticalRatio: 0.6,
    hints: ['Space agent', '/ search', '? help', 'q quit'],
    headerFocus: null,
  };
}
