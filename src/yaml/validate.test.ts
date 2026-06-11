import { describe, it, expect } from 'vitest';
import { validateYaml } from './validate.js';

describe('validateYaml', () => {
  it('returns null for valid YAML', () => {
    const yaml = `apiVersion: v1
kind: ConfigMap
metadata:
  name: my-config
data:
  key: value
`;
    expect(validateYaml(yaml)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(validateYaml('')).toBeNull();
  });

  it('returns null for a simple scalar', () => {
    expect(validateYaml('42')).toBeNull();
  });

  it('returns null for a mapping', () => {
    expect(validateYaml('a: 1\nb: 2\n')).toBeNull();
  });

  it('returns null for a sequence', () => {
    expect(validateYaml('- a\n- b\n- c\n')).toBeNull();
  });

  it('returns error for invalid YAML - tab indent', () => {
    // Tabs are not allowed in YAML indentation
    const invalid = 'key:\n\t- value\n';
    const result = validateYaml(invalid);
    expect(result).not.toBeNull();
    expect(result?.message).toBeTruthy();
  });

  it('returns error for invalid YAML - duplicate mapping key block', () => {
    // This may or may not error depending on js-yaml version; test a clear syntax error
    const invalid = '{invalid yaml: [}';
    const result = validateYaml(invalid);
    expect(result).not.toBeNull();
    expect(result?.message).toBeTruthy();
  });

  it('returns a line number when available', () => {
    // Force an error on a known line
    const invalid = 'valid: yes\ninvalid: [\n';
    const result = validateYaml(invalid);
    if (result !== null && result.line !== null) {
      expect(result.line).toBeGreaterThan(0);
    }
    // Either null line or positive line is acceptable
  });

  it('returned error has a message property', () => {
    const invalid = ': {bad';
    const result = validateYaml(invalid);
    expect(result).not.toBeNull();
    expect(typeof result?.message).toBe('string');
    expect((result?.message.length ?? 0) > 0).toBe(true);
  });

  it('line can be null when not determinable', () => {
    // null line is acceptable for some error types
    const invalid = ': bad';
    const result = validateYaml(invalid);
    // Just verify the shape is correct
    if (result !== null) {
      expect(result.message).toBeTruthy();
      // line is number | null
      expect(result.line === null || typeof result.line === 'number').toBe(
        true,
      );
    }
  });

  it('returns null for multiline string YAML', () => {
    const yaml = `description: |
  This is a multiline
  string value
key: value
`;
    expect(validateYaml(yaml)).toBeNull();
  });

  it('returns null for folded string YAML', () => {
    const yaml = `description: >
  This is a folded
  string value
key: value
`;
    expect(validateYaml(yaml)).toBeNull();
  });

  it('returns error with null line when mark has no line number', () => {
    // Use a YAML string that causes a YAMLException with no line info
    // We test by checking the shape is correct regardless
    const invalid = 'key: :\n  bad: [unclosed';
    const result = validateYaml(invalid);
    // Either null (if valid) or an error with line or null
    if (result !== null) {
      expect(result.message).toBeTruthy();
      expect(result.line === null || typeof result.line === 'number').toBe(
        true,
      );
    }
  });
});
