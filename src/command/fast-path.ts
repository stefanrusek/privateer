/**
 * Deterministic intent parser — fast path before any LLM inference.
 *
 * Spec 07 §8: case-insensitive, unambiguous full matches only.
 * NEVER produces an `answer` action. Question words fall through.
 *
 * Pattern table (case-insensitive):
 *  (show|go to|open) <alias>              → navigate
 *  <alias> in <namespace>                 → multi [navigate, filter namespace]
 *  (erroring|crashing|failing|broken) <alias>? → multi [navigate Pod, filter search=error]
 *  <alias>                                → navigate
 *  bare known-namespace name              → filter namespace
 */

import type { AgentAction } from './action.js';
import { resolveKind } from './aliases.js';

/** Words that indicate a question — cause fall-through */
const QUESTION_WORDS = new Set([
  'what',
  'why',
  'how',
  'which',
  'where',
  'when',
  'who',
  'whose',
  'whom',
]);

/** Words that indicate a comparative — cause fall-through */
const COMPARATIVE_WORDS = new Set([
  'more',
  'fewer',
  'less',
  'most',
  'least',
  'greater',
  'smaller',
  'than',
  'compared',
]);

/** Error-state modifier words */
const ERROR_MODIFIERS = new Set(['erroring', 'crashing', 'failing', 'broken']);

/** Navigation verb prefixes */
const NAV_VERBS_SINGLE = new Set(['show', 'open']);

/**
 * The result of a fast-path parse.
 * `null` means no match — fall through to the model.
 */
export type FastPathResult = AgentAction | null;

/**
 * Parse a natural-language query against the fast-path pattern table.
 *
 * @param query - Raw user input (may be any case)
 * @param knownNamespaces - Optional set of known namespace names for the
 *   "bare namespace name → filter" pattern
 * @returns An AgentAction or null if no unambiguous match
 */
export function parseFastPath(
  query: string,
  knownNamespaces: ReadonlySet<string> = new Set(),
): FastPathResult {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const lower = trimmed.toLowerCase();
  const tokens = lower.split(/\s+/);

  // Gate: any question word or comparative → fall through immediately
  for (const token of tokens) {
    if (QUESTION_WORDS.has(token) || COMPARATIVE_WORDS.has(token)) {
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Pattern 1: "(show|open) <alias>" — two tokens, NAV_VERBS_SINGLE first
  // ---------------------------------------------------------------------------
  if (tokens.length === 2) {
    const [verb, alias] = tokens;
    if (
      verb !== undefined &&
      alias !== undefined &&
      NAV_VERBS_SINGLE.has(verb)
    ) {
      const kind = resolveKind(alias);
      if (kind !== undefined) {
        return { action: 'navigate', resource: kind };
      }
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Pattern 2: "go to <alias>" — three tokens
  // ---------------------------------------------------------------------------
  if (tokens.length === 3) {
    const [t0, t1, t2] = tokens;
    if (
      t0 !== undefined &&
      t1 !== undefined &&
      t2 !== undefined &&
      t0 === 'go' &&
      t1 === 'to'
    ) {
      const kind = resolveKind(t2);
      if (kind !== undefined) {
        return { action: 'navigate', resource: kind };
      }
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Pattern 3: "<alias> in <namespace>" — three tokens with 'in' as middle
  // ---------------------------------------------------------------------------
  if (tokens.length === 3) {
    const [aliasToken, maybeIn, ns] = tokens;
    if (
      aliasToken !== undefined &&
      maybeIn !== undefined &&
      ns !== undefined &&
      maybeIn === 'in'
    ) {
      const kind = resolveKind(aliasToken);
      if (kind !== undefined) {
        return {
          action: 'multi',
          steps: [
            { action: 'navigate', resource: kind },
            { action: 'filter', namespace: ns },
          ],
        };
      }
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Pattern 4: "(erroring|crashing|failing|broken) <alias>?" — one or two tokens
  // ---------------------------------------------------------------------------
  if (tokens.length === 1) {
    const [firstToken] = tokens;
    if (firstToken !== undefined && ERROR_MODIFIERS.has(firstToken)) {
      return {
        action: 'multi',
        steps: [
          { action: 'navigate', resource: 'Pod' },
          { action: 'filter', search: 'error' },
        ],
      };
    }
  }

  if (tokens.length === 2) {
    const [firstToken, secondToken] = tokens;
    if (
      firstToken !== undefined &&
      secondToken !== undefined &&
      ERROR_MODIFIERS.has(firstToken)
    ) {
      // Two tokens: second must resolve to a kind; error modifier always → Pod
      const kind = resolveKind(secondToken);
      if (kind !== undefined) {
        return {
          action: 'multi',
          steps: [
            { action: 'navigate', resource: 'Pod' },
            { action: 'filter', search: 'error' },
          ],
        };
      }
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Pattern 5: bare "<alias>" — single token
  // ---------------------------------------------------------------------------
  if (tokens.length === 1) {
    const token = tokens[0];
    if (token !== undefined) {
      // Check alias first (kinds take priority over namespaces)
      const kind = resolveKind(token);
      if (kind !== undefined) {
        return { action: 'navigate', resource: kind };
      }

      // Check known namespaces
      if (knownNamespaces.has(token)) {
        return { action: 'filter', namespace: token };
      }
    }
  }

  // No unambiguous match — fall through to model
  return null;
}
