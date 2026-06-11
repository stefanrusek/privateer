import { describe, it, expect } from 'vitest';
import { tokenizeLine } from './highlight.js';
import type { Token, TokenType } from './highlight.js';

function types(tokens: Token[]): TokenType[] {
  return tokens.map((t) => t.type);
}

function texts(tokens: Token[]): string[] {
  return tokens.map((t) => t.text);
}

function joined(tokens: Token[]): string {
  return tokens.map((t) => t.text).join('');
}

describe('tokenizeLine', () => {
  it('handles empty line as plain', () => {
    const tokens = tokenizeLine('');
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.type).toBe('plain');
  });

  it('handles comment line as plain', () => {
    const tokens = tokenizeLine('# this is a comment');
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.type).toBe('plain');
  });

  it('handles indented comment as plain', () => {
    const tokens = tokenizeLine('  # indented comment');
    expect(joined(tokens)).toBe('  # indented comment');
    // All tokens may be plain or split; the joined text must match
  });

  it('tokenizes a key with string value', () => {
    const tokens = tokenizeLine('name: order-api');
    const t = types(tokens);
    expect(t).toContain('key');
    // key text
    const keyToken = tokens.find((tok) => tok.type === 'key');
    expect(keyToken?.text).toBe('name');
  });

  it('tokenizes a key with no value (bare mapping key)', () => {
    const tokens = tokenizeLine('metadata:');
    const t = types(tokens);
    expect(t).toContain('key');
    expect(t).toContain('punctuation');
    const keyToken = tokens.find((tok) => tok.type === 'key');
    expect(keyToken?.text).toBe('metadata');
  });

  it('tokenizes a number value', () => {
    const tokens = tokenizeLine('replicas: 3');
    const numToken = tokens.find((tok) => tok.type === 'number');
    expect(numToken?.text).toBe('3');
  });

  it('tokenizes a negative number value', () => {
    const tokens = tokenizeLine('offset: -5');
    const numToken = tokens.find((tok) => tok.type === 'number');
    expect(numToken?.text).toBe('-5');
  });

  it('tokenizes a float value', () => {
    const tokens = tokenizeLine('ratio: 1.5');
    const numToken = tokens.find((tok) => tok.type === 'number');
    expect(numToken?.text).toBe('1.5');
  });

  it('tokenizes boolean true', () => {
    const tokens = tokenizeLine('enabled: true');
    const boolToken = tokens.find((tok) => tok.type === 'boolean');
    expect(boolToken?.text).toBe('true');
  });

  it('tokenizes boolean false', () => {
    const tokens = tokenizeLine('disabled: false');
    const boolToken = tokens.find((tok) => tok.type === 'boolean');
    expect(boolToken?.text).toBe('false');
  });

  it('tokenizes boolean yes/no', () => {
    const yesTokens = tokenizeLine('enabled: yes');
    expect(yesTokens.find((t) => t.type === 'boolean')?.text).toBe('yes');
    const noTokens = tokenizeLine('enabled: no');
    expect(noTokens.find((t) => t.type === 'boolean')?.text).toBe('no');
  });

  it('tokenizes boolean on/off', () => {
    const onTokens = tokenizeLine('feature: on');
    expect(onTokens.find((t) => t.type === 'boolean')?.text).toBe('on');
    const offTokens = tokenizeLine('feature: off');
    expect(offTokens.find((t) => t.type === 'boolean')?.text).toBe('off');
  });

  it('tokenizes null value', () => {
    const tokens = tokenizeLine('field: null');
    const nullToken = tokens.find((tok) => tok.type === 'null');
    expect(nullToken?.text).toBe('null');
  });

  it('tokenizes tilde as null', () => {
    const tokens = tokenizeLine('field: ~');
    const nullToken = tokens.find((tok) => tok.type === 'null');
    expect(nullToken?.text).toBe('~');
  });

  it('tokenizes double-quoted string', () => {
    const tokens = tokenizeLine('name: "hello world"');
    const strToken = tokens.find((tok) => tok.type === 'string');
    expect(strToken?.text).toBe('"hello world"');
  });

  it('tokenizes single-quoted string', () => {
    const tokens = tokenizeLine("name: 'hello world'");
    const strToken = tokens.find((tok) => tok.type === 'string');
    expect(strToken?.text).toBe("'hello world'");
  });

  it('preserves indentation as plain tokens', () => {
    const tokens = tokenizeLine('  name: value');
    expect(tokens[0]?.type).toBe('plain');
    expect(tokens[0]?.text).toBe('  ');
  });

  it('handles document separator as punctuation', () => {
    const tokens = tokenizeLine('---');
    expect(tokens[0]?.type).toBe('punctuation');
    expect(tokens[0]?.text).toBe('---');
  });

  it('handles document end marker as punctuation', () => {
    const tokens = tokenizeLine('...');
    expect(tokens[0]?.type).toBe('punctuation');
    expect(tokens[0]?.text).toBe('...');
  });

  it('handles list item with string value', () => {
    const tokens = tokenizeLine('- value');
    expect(types(tokens)).toContain('punctuation');
    const punc = tokens.find((t) => t.type === 'punctuation');
    expect(punc?.text).toBe('- ');
  });

  it('handles list item with no value', () => {
    const tokens = tokenizeLine('-');
    expect(types(tokens)).toContain('punctuation');
  });

  it('handles list item with boolean value', () => {
    const tokens = tokenizeLine('- true');
    const boolToken = tokens.find((t) => t.type === 'boolean');
    expect(boolToken?.text).toBe('true');
  });

  it('handles list item with null value', () => {
    const tokens = tokenizeLine('- null');
    const nullToken = tokens.find((t) => t.type === 'null');
    expect(nullToken?.text).toBe('null');
  });

  it('handles list item with number value', () => {
    const tokens = tokenizeLine('- 42');
    const numToken = tokens.find((t) => t.type === 'number');
    expect(numToken?.text).toBe('42');
  });

  it('handles block scalar indicator |', () => {
    const tokens = tokenizeLine('data: |');
    const punc = tokens.filter((t) => t.type === 'punctuation');
    // `: ` and `|`
    expect(punc.length).toBeGreaterThan(0);
    expect(texts(tokens)).toContain('|');
  });

  it('handles anchor as plain', () => {
    const tokens = tokenizeLine('&anchor');
    expect(types(tokens)).toContain('plain');
  });

  it('handles alias as plain', () => {
    const tokens = tokenizeLine('*alias');
    expect(types(tokens)).toContain('plain');
  });

  it('preserves full text when joined', () => {
    const lines = [
      'apiVersion: apps/v1',
      'kind: Deployment',
      'metadata:',
      '  name: order-api',
      '  replicas: 3',
      '  enabled: true',
      '  value: null',
      '# comment',
      '',
    ];
    for (const line of lines) {
      expect(joined(tokenizeLine(line))).toBe(line);
    }
  });

  it('handles plain key value (no quotes, not a special type)', () => {
    const tokens = tokenizeLine('image: nginx:latest');
    const keyToken = tokens.find((t) => t.type === 'key');
    expect(keyToken?.text).toBe('image');
  });

  it('handles quoted key', () => {
    const tokens = tokenizeLine('"special-key": value');
    const keyToken = tokens.find((t) => t.type === 'key');
    expect(keyToken?.text).toBe('"special-key"');
  });

  it('handles single-quoted key', () => {
    const tokens = tokenizeLine("'my key': value");
    const keyToken = tokens.find((t) => t.type === 'key');
    expect(keyToken?.text).toBe("'my key'");
  });

  it('handles block scalar >-', () => {
    const tokens = tokenizeLine('note: >-');
    expect(texts(tokens)).toContain('>-');
  });

  it('handles key with empty value (null)', () => {
    const tokens = tokenizeLine('field: ');
    // After the `: `, there's an empty value → null token or no extra token
    const nullToken = tokens.find((t) => t.type === 'null');
    expect(nullToken).toBeDefined();
  });

  it('handles block scalar > indicator in value position', () => {
    const tokens = tokenizeLine('content: >');
    expect(texts(tokens)).toContain('>');
    const puncToken = tokens.filter((t) => t.type === 'punctuation');
    expect(puncToken.some((t) => t.text === '>')).toBe(true);
  });

  it('handles block scalar |- indicator', () => {
    const tokens = tokenizeLine('content: |-');
    expect(texts(tokens)).toContain('|-');
  });

  it('handles inline comment as plain value token', () => {
    // A bare `#` in value position (after colon stripping) is treated as plain
    const tokens = tokenizeLine('  #inline');
    // The indented comment-like content should be joined correctly
    expect(joined(tokens)).toBe('  #inline');
  });

  it('handles value with leading whitespace in list item', () => {
    // Value after list `- ` that has additional whitespace
    const tokens = tokenizeLine('-  value');
    expect(joined(tokens)).toBe('-  value');
  });

  it('handles unclosed quoted key gracefully', () => {
    // A quoted key without a closing quote — falls through to plain value
    const tokens = tokenizeLine('"unclosed key');
    expect(joined(tokens)).toBe('"unclosed key');
  });

  it('handles quoted key not followed by colon — falls through to value', () => {
    // A quoted string that isn't a key (no `:` after it)
    const tokens = tokenizeLine('"just a value"');
    expect(joined(tokens)).toBe('"just a value"');
    // Should be parsed as a string value since no `: ` follows
    const strToken = tokens.find((t) => t.type === 'string');
    expect(strToken).toBeDefined();
  });

  it('handles double-quoted key with escaped quote', () => {
    // "key\"name": value — the escaped quote in the key
    const tokens = tokenizeLine('"key\\"name": value');
    // The key text should include the escaped quote
    expect(joined(tokens)).toBe('"key\\"name": value');
  });

  it('handles value token with trailing whitespace', () => {
    // value with trailing space (trailWs branch in parseValueTokens)
    const tokens = tokenizeLine('key: value  ');
    expect(joined(tokens)).toBe('key: value  ');
  });

  it('handles single-quoted key followed by colon-only', () => {
    const tokens = tokenizeLine("'my-key':");
    const keyToken = tokens.find((t) => t.type === 'key');
    expect(keyToken?.text).toBe("'my-key'");
  });

  it('handles value that starts with comment char after key', () => {
    // key: #comment — the `#comment` is the value (plain)
    const tokens = tokenizeLine('key: #comment');
    expect(joined(tokens)).toBe('key: #comment');
  });
});
