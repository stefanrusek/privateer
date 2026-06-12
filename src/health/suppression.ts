/**
 * Rule suppression — honors p9r.io/suppress-rules annotation (Spec 06 §6.7).
 *
 * When a resource has `p9r.io/suppress-rules: "RES-001,REL-001"`, those rule
 * IDs are suppressed for that resource: they show as `○ suppressed`.
 */

const SUPPRESS_ANNOTATION = 'p9r.io/suppress-rules';

/**
 * Parse the suppression annotation value into a Set of rule IDs.
 * Returns an empty set if the annotation is absent or empty.
 */
export function parseSuppressedRules(
  annotations: Record<string, string>,
): ReadonlySet<string> {
  const raw = annotations[SUPPRESS_ANNOTATION];
  if (raw === undefined || raw.trim().length === 0) {
    return new Set();
  }
  return new Set(
    raw
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0),
  );
}

/**
 * Returns true if `ruleId` is suppressed by the given annotations.
 */
export function isRuleSuppressed(
  annotations: Record<string, string>,
  ruleId: string,
): boolean {
  return parseSuppressedRules(annotations).has(ruleId);
}
