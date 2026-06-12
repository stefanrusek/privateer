/**
 * Unit tests for suppression.ts (Spec 06 §6.7).
 */
import { describe, it, expect } from 'vitest';
import { parseSuppressedRules, isRuleSuppressed } from './suppression.js';

describe('parseSuppressedRules', () => {
  it('returns empty set when annotation absent', () => {
    const result = parseSuppressedRules({});
    expect(result.size).toBe(0);
  });

  it('returns empty set when annotation is empty string', () => {
    const result = parseSuppressedRules({ 'p9r.io/suppress-rules': '' });
    expect(result.size).toBe(0);
  });

  it('parses single rule ID', () => {
    const result = parseSuppressedRules({ 'p9r.io/suppress-rules': 'RES-001' });
    expect(result.has('RES-001')).toBe(true);
    expect(result.size).toBe(1);
  });

  it('parses multiple rule IDs', () => {
    const result = parseSuppressedRules({
      'p9r.io/suppress-rules': 'RES-001,REL-001',
    });
    expect(result.has('RES-001')).toBe(true);
    expect(result.has('REL-001')).toBe(true);
    expect(result.size).toBe(2);
  });

  it('trims whitespace around IDs', () => {
    const result = parseSuppressedRules({
      'p9r.io/suppress-rules': 'RES-001 , REL-001 , SEC-001',
    });
    expect(result.has('RES-001')).toBe(true);
    expect(result.has('REL-001')).toBe(true);
    expect(result.has('SEC-001')).toBe(true);
    expect(result.size).toBe(3);
  });

  it('ignores empty segments after split', () => {
    const result = parseSuppressedRules({
      'p9r.io/suppress-rules': 'RES-001,,',
    });
    expect(result.size).toBe(1);
    expect(result.has('RES-001')).toBe(true);
  });
});

describe('isRuleSuppressed', () => {
  it('returns false when annotation absent', () => {
    expect(isRuleSuppressed({}, 'RES-001')).toBe(false);
  });

  it('returns true for suppressed rule', () => {
    expect(
      isRuleSuppressed(
        { 'p9r.io/suppress-rules': 'RES-001,REL-001' },
        'RES-001',
      ),
    ).toBe(true);
  });

  it('returns false for non-suppressed rule', () => {
    expect(
      isRuleSuppressed({ 'p9r.io/suppress-rules': 'RES-001' }, 'REL-001'),
    ).toBe(false);
  });

  it('returns false when rule is not in list', () => {
    expect(
      isRuleSuppressed(
        { 'p9r.io/suppress-rules': 'RES-001,RES-002' },
        'SEC-001',
      ),
    ).toBe(false);
  });
});
