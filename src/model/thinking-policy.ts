/**
 * Thinking-mode policy (Spec 07 §11.1).
 *
 * Pure classifier over a raw query: thinking is OFF for navigation/filter
 * intents (latency-sensitive), ON for diagnostic "what's wrong / why" queries.
 *
 * The heuristic mirrors the fast-path's intuition: question words and
 * diagnostic verbs signal reasoning is worthwhile; otherwise we assume a cheap
 * navigation intent and keep thinking off.
 */

/** Question/diagnostic words that warrant thinking mode. */
const DIAGNOSTIC_WORDS = new Set([
  'what',
  'why',
  'how',
  'which',
  'diagnose',
  'wrong',
  'broken',
  'failing',
  'crashing',
  'erroring',
  'error',
  'errors',
  'unhealthy',
  'degraded',
  'investigate',
  'explain',
  'cause',
  'reason',
]);

/**
 * Decide whether thinking mode should be enabled for `query`.
 *
 * Rules (first match wins):
 *  1. Empty/whitespace → off (nothing to reason about).
 *  2. Any diagnostic word present → on.
 *  3. Otherwise → off (navigation/filter intent, latency-sensitive).
 *
 * Diagnostic words are detected anywhere in the query, so "show me what's
 * broken" enables thinking even though it opens with a navigation verb.
 */
export function shouldThink(query: string): boolean {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return false;
  }

  const tokens = trimmed
    .toLowerCase()
    .split(/[^a-z0-9']+/)
    .filter((t) => t.length > 0);

  for (const token of tokens) {
    if (DIAGNOSTIC_WORDS.has(token)) {
      return true;
    }
  }

  // No diagnostic signal — assume a latency-sensitive navigation/filter intent.
  return false;
}
