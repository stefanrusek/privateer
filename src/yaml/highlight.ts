/**
 * YAML syntax tokenizer for line-by-line highlighting.
 * Spec 04 §6.1: keys=blue, strings=green, numbers=yellow, booleans=cyan, null=grey.
 *
 * This is a line-at-a-time tokenizer — good enough for TUI display without
 * pulling in a full parser. Works on a single pre-split line of YAML.
 */

export type TokenType =
  | 'key'
  | 'string'
  | 'number'
  | 'boolean'
  | 'null'
  | 'punctuation'
  | 'plain';

export interface Token {
  type: TokenType;
  text: string;
}

/** A number literal: integer or float, optionally signed, optionally scientific. */
const NUMBER_RE = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

/** YAML booleans per YAML 1.1 core schema (what most k8s tooling expects). */
const BOOLEAN_VALUES = new Set(['true', 'false', 'yes', 'no', 'on', 'off']);

/** Classify a bare (unquoted) scalar value token. */
function classifyValue(text: string): TokenType {
  const lower = text.toLowerCase();
  if (lower === 'null' || lower === '~' || text === '') {
    return 'null';
  }
  if (BOOLEAN_VALUES.has(lower)) {
    return 'boolean';
  }
  if (NUMBER_RE.test(text)) {
    return 'number';
  }
  return 'plain';
}

/**
 * Tokenize a single line of YAML into displayable tokens.
 *
 * Handles:
 * - Indentation (plain)
 * - Comment lines (plain)
 * - Sequence indicator `- ` (punctuation + value tokens)
 * - Key/value pairs `key: value` (key + punctuation + value)
 * - Bare mapping keys `key:` (key + punctuation)
 * - Quoted strings (single and double)
 * - Anchors/aliases (&anchor, *alias) as plain
 */
export function tokenizeLine(line: string): Token[] {
  const tokens: Token[] = [];

  if (line.trim() === '' || line.trim().startsWith('#')) {
    tokens.push({ type: 'plain', text: line });
    return tokens;
  }

  // Extract leading whitespace. Line is non-blank (checked above) so
  // trimStart() is safe and will yield a non-empty `rest`.
  const rest = line.trimStart();
  const indent = line.slice(0, line.length - rest.length);

  if (indent.length > 0) {
    tokens.push({ type: 'plain', text: indent });
  }

  // YAML document markers
  if (rest === '---' || rest === '...') {
    tokens.push({ type: 'punctuation', text: rest });
    return tokens;
  }

  // List item: `- ` or `-\n`
  let content = rest;
  if (content.startsWith('- ') || content === '-') {
    const dashPart = content === '-' ? '-' : '- ';
    tokens.push({ type: 'punctuation', text: dashPart });
    content = content.slice(dashPart.length);
    if (content === '') {
      return tokens;
    }
  }

  // Try to parse as a key: value pair
  // Key can be quoted or unquoted, followed by `: ` or `:`
  const keyValueResult = parseKeyValue(content);
  if (keyValueResult !== null) {
    const { keyTokens, colonPart, valuePart } = keyValueResult;
    tokens.push(...keyTokens);
    tokens.push({ type: 'punctuation', text: colonPart });
    // Emit null token for an explicit empty value (e.g. "key: " with trailing space)
    if (valuePart !== '' || colonPart === ': ') {
      tokens.push(...parseValueTokens(valuePart));
    }
    return tokens;
  }

  // Bare value (array item value, continuation, etc.)
  tokens.push(...parseValueTokens(content));
  return tokens;
}

interface KeyValueResult {
  keyTokens: Token[];
  colonPart: string;
  valuePart: string;
}

/** Parse `key: value` or `"key": value` etc. Returns null if not a key/value line. */
function parseKeyValue(content: string): KeyValueResult | null {
  // Try quoted key first
  if (content.startsWith('"') || content.startsWith("'")) {
    const quote = content[0] as '"' | "'";
    const closeIdx = findClosingQuote(content, 1, quote);
    if (closeIdx === -1) {
      return null;
    }
    const keyText = content.slice(0, closeIdx + 1);
    const after = content.slice(closeIdx + 1);
    if (after.startsWith(': ') || after === ':') {
      const colonPart = after.startsWith(': ') ? ': ' : ':';
      const valuePart = after.slice(colonPart.length);
      return {
        keyTokens: [{ type: 'key', text: keyText }],
        colonPart,
        valuePart,
      };
    }
    return null;
  }

  // Unquoted key: everything up to `: ` or `:` at end of line
  // Key must not start with special chars that indicate it's a value
  const colonSpaceIdx = content.indexOf(': ');
  const colonEndIdx = content.endsWith(':') ? content.length - 1 : -1;

  if (colonSpaceIdx !== -1) {
    const keyText = content.slice(0, colonSpaceIdx);
    // A valid YAML key should not itself look like a list marker or anchor in this context
    if (keyText.length > 0 && !keyText.includes(': ')) {
      return {
        keyTokens: [{ type: 'key', text: keyText }],
        colonPart: ': ',
        valuePart: content.slice(colonSpaceIdx + 2),
      };
    }
  }

  if (colonEndIdx !== -1) {
    const keyText = content.slice(0, colonEndIdx);
    if (keyText.length > 0) {
      return {
        keyTokens: [{ type: 'key', text: keyText }],
        colonPart: ':',
        valuePart: '',
      };
    }
  }

  return null;
}

/** Find the closing quote character, respecting escapes for double-quoted strings. */
function findClosingQuote(
  str: string,
  startIdx: number,
  quote: '"' | "'",
): number {
  let i = startIdx;
  while (i < str.length) {
    if (str[i] === quote) {
      if (quote === '"' && i > startIdx && str[i - 1] === '\\') {
        i++;
        continue;
      }
      return i;
    }
    i++;
  }
  return -1;
}

/** Tokenize a value portion of a YAML line. */
function parseValueTokens(value: string): Token[] {
  const trimmed = value.trim();

  if (trimmed === '') {
    return [{ type: 'null', text: value }];
  }

  // Leading/trailing whitespace — keep it as plain but classify the core
  const leadWs = value.slice(0, value.length - value.trimStart().length);
  const trailWs = value.slice(value.trimEnd().length);
  const core = value.trimStart().trimEnd();

  const coreTokens = parseCoreSingleValue(core);
  const result: Token[] = [];
  if (leadWs) {
    result.push({ type: 'plain', text: leadWs });
  }
  result.push(...coreTokens);
  if (trailWs) {
    result.push({ type: 'plain', text: trailWs });
  }
  return result;
}

/** Parse the core (trimmed) value. Must be non-empty — callers pre-check. */
function parseCoreSingleValue(value: string): Token[] {
  // Quoted string
  if (value.startsWith('"') || value.startsWith("'")) {
    return [{ type: 'string', text: value }];
  }

  // Block scalar indicators
  if (value === '|' || value === '>' || value === '|-' || value === '>-') {
    return [{ type: 'punctuation', text: value }];
  }

  // Anchor or alias
  if (value.startsWith('&') || value.startsWith('*')) {
    return [{ type: 'plain', text: value }];
  }

  // Comment (shouldn't normally appear here, but handle defensively)
  if (value.startsWith('#')) {
    return [{ type: 'plain', text: value }];
  }

  const type = classifyValue(value);
  return [{ type, text: value }];
}
