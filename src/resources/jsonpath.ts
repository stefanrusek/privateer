/**
 * Best-effort evaluator for the Kubernetes-JSONPath subset used by CRD
 * `additionalPrinterColumns[].jsonPath` (Spec 03 §7, ticket P9R-0018 story
 * 2). Kubernetes printer-column JSONPath is NOT RFC 9535 — it only ever
 * needs dot-separated field access and numeric bracket indexing (e.g.
 * `.status.phase`, `.spec.items[0].name`), optionally wrapped in `{...}` the
 * way `kubectl get -o jsonpath` requires. This module implements exactly
 * that subset. Any path this can't resolve returns `undefined` — callers
 * render that as "—", never throw.
 */

/** Split a (possibly `{...}`-wrapped) path into field/index segments. */
function tokenize(path: string): string[] | undefined {
  let raw = path.trim();
  if (raw.startsWith('{') && raw.endsWith('}')) {
    raw = raw.slice(1, -1);
  }
  if (!raw.startsWith('.')) {
    return undefined;
  }
  raw = raw.slice(1);
  if (raw.length === 0) {
    return [];
  }

  const tokens: string[] = [];
  // Split on '.' that isn't inside a '[...]' bracket, then further split
  // each part's trailing bracket indices.
  const parts = raw.split('.');
  for (const part of parts) {
    let field = part;
    const indices: string[] = [];
    for (;;) {
      const match = /\[(\d+)\]$/.exec(field);
      if (match?.[1] === undefined) {
        break;
      }
      indices.unshift(match[1]);
      field = field.slice(0, field.length - match[0].length);
    }
    if (field.length === 0 && indices.length === 0) {
      return undefined;
    }
    if (field.length > 0) {
      tokens.push(field);
    }
    tokens.push(...indices.map((i) => `[${i}]`));
  }
  return tokens;
}

/** Resolve one segment (field name or `[N]` index) against a value. */
function step(value: unknown, token: string): unknown {
  const indexMatch = /^\[(\d+)\]$/.exec(token);
  if (indexMatch?.[1] !== undefined) {
    if (!Array.isArray(value)) {
      return undefined;
    }
    return (value as unknown[])[Number(indexMatch[1])];
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return (value as Record<string, unknown>)[token];
}

/** Render a resolved JSON value as printer-column display text. */
function render(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}

/**
 * Evaluate a Kubernetes-JSONPath printer-column expression against a raw
 * object. Returns `undefined` on any failure (malformed path, missing
 * field, out-of-range index) — never throws.
 */
export function evalPrinterColumnPath(
  path: string,
  object: unknown,
): string | undefined {
  const tokens = tokenize(path);
  if (tokens === undefined) {
    return undefined;
  }
  let current: unknown = object;
  for (const token of tokens) {
    if (current === undefined) {
      return undefined;
    }
    current = step(current, token);
  }
  return render(current);
}
