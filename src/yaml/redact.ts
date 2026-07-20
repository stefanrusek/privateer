/**
 * Secret value masking + reveal.
 * Spec 04 §6.1 / P9R-0012: for Kubernetes Secret resources, `.data` (and
 * `.stringData`, though the server never returns it on read) values are
 * masked by default with a fixed-width mask — the mask must not leak the
 * value's length — and can be revealed to their *decoded* plaintext (UTF-8
 * when decodable, otherwise a `<binary, N bytes>` placeholder). Masking is
 * display-only: the edit buffer always carries the real base64.
 *
 * Spec review-01 M1: this module is a display concern only. The agent's hard
 * redaction boundary (no reveal path via the agent) lives separately in
 * `src/agent/dispatcher.ts` and is untouched by reveal.
 */

import jsYaml from 'js-yaml';

/** Fixed-width mask rendered regardless of the underlying value's length. */
export const SECRET_MASK = '••••••••';

/**
 * If the YAML string represents a Kubernetes Secret (kind: Secret),
 * replace all values in `.data` and `.stringData` with the fixed-width
 * {@link SECRET_MASK}. Returns the modified YAML string, or the original if
 * it is not a Secret (or not parseable YAML).
 *
 * Preserves the keys and overall structure; only scalar values are replaced.
 */
export function maskSecret(yaml: string): string {
  return transformSecretValues(yaml, () => SECRET_MASK);
}

/**
 * If the YAML string represents a Kubernetes Secret, replace all values in
 * `.data` and `.stringData` with their *decoded* form: UTF-8 plaintext when
 * the bytes decode cleanly, otherwise `<binary, N bytes>`. Returns the
 * original string if it is not a Secret (or not parseable YAML).
 */
export function revealSecret(yaml: string): string {
  return transformSecretValues(yaml, decodeBase64Value);
}

function transformSecretValues(
  yaml: string,
  transform: (value: string) => string,
): string {
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

  const transformed = transformDoc(doc, transform);
  return jsYaml.dump(transformed, { lineWidth: -1, indent: 2 });
}

function isSecret(doc: unknown): doc is Record<string, unknown> {
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    return false;
  }
  const obj = doc as Record<string, unknown>;
  return obj.kind === 'Secret';
}

function transformDoc(
  doc: Record<string, unknown>,
  transform: (value: string) => string,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...doc };

  const dataKey = 'data';
  if (hasStringMap(result, dataKey)) {
    result[dataKey] = transformStringMap(
      result[dataKey] as Record<string, string>,
      transform,
    );
  }

  const stringDataKey = 'stringData';
  if (hasStringMap(result, stringDataKey)) {
    result[stringDataKey] = transformStringMap(
      result[stringDataKey] as Record<string, string>,
      transform,
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

function transformStringMap(
  map: Record<string, string>,
  transform: (value: string) => string,
): Record<string, string> {
  const transformed: Record<string, string> = {};
  for (const [key, value] of Object.entries(map)) {
    transformed[key] = transform(value);
  }
  return transformed;
}

/**
 * Decode a base64 `data:` value to UTF-8 plaintext when it decodes cleanly,
 * else fall back to a `<binary, N bytes>` placeholder that discloses only
 * the byte length, never the bytes themselves.
 */
function decodeBase64Value(base64: string): string {
  const bytes = Buffer.from(base64, 'base64');
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    return decoder.decode(bytes);
  } catch {
    return `<binary, ${String(bytes.length)} bytes>`;
  }
}
