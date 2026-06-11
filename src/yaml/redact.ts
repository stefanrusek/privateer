/**
 * Secret value redaction.
 * Spec 04 §6.1: For Kubernetes Secret resources, replace `.data` and `.stringData`
 * values with `[redacted]`. Only activates when kind is Secret.
 * Spec review-01 M1: redaction is a hard boundary — no reveal path via agent.
 */

import jsYaml from 'js-yaml';

/**
 * If the YAML string represents a Kubernetes Secret (kind: Secret),
 * replace all values in `.data` and `.stringData` with `[redacted]`.
 * Returns the modified YAML string, or the original if it is not a Secret.
 *
 * Preserves the keys and overall structure; only scalar values are replaced.
 */
export function redactSecret(yaml: string): string {
  let doc: unknown;
  try {
    doc = jsYaml.load(yaml);
  } catch {
    // If YAML is invalid, return as-is — validation is elsewhere
    return yaml;
  }

  if (!isSecret(doc)) {
    return yaml;
  }

  const redacted = redactDoc(doc);
  return jsYaml.dump(redacted, { lineWidth: -1, indent: 2 });
}

function isSecret(doc: unknown): doc is Record<string, unknown> {
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    return false;
  }
  const obj = doc as Record<string, unknown>;
  return obj.kind === 'Secret';
}

function redactDoc(doc: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...doc };

  const dataKey = 'data';
  if (hasStringMap(result, dataKey)) {
    result[dataKey] = redactStringMap(
      result[dataKey] as Record<string, string>,
    );
  }

  const stringDataKey = 'stringData';
  if (hasStringMap(result, stringDataKey)) {
    result[stringDataKey] = redactStringMap(
      result[stringDataKey] as Record<string, string>,
    );
  }

  return result;
}

function hasStringMap(obj: Record<string, unknown>, key: string): boolean {
  const val = obj[key];
  return (
    val !== null &&
    val !== undefined &&
    typeof val === 'object' &&
    !Array.isArray(val)
  );
}

function redactStringMap(map: Record<string, string>): Record<string, string> {
  const redacted: Record<string, string> = {};
  for (const key of Object.keys(map)) {
    redacted[key] = '[redacted]';
  }
  return redacted;
}
