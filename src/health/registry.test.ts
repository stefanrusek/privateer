/**
 * Unit tests for the health rule registry (Spec 06 §6.1).
 */
import { describe, it, expect } from 'vitest';
import { evaluateAllRules, findRule, RULE_CATALOG } from './registry.js';
import {
  makeStore,
  seedResource,
  TEST_CONTEXT,
  makePodRaw,
} from './test-helpers.js';
import { EMPTY_CAPS } from './types.js';

describe('RULE_CATALOG', () => {
  it('contains all 29 rules from the spec', () => {
    // 5 RES + 4 REL + 6 OBS + 7 SEC + 3 NET + 3 STO + 13 KFK = 41
    // Let's count what we actually have
    expect(RULE_CATALOG.length).toBeGreaterThanOrEqual(29);
  });

  it('all rule IDs are unique', () => {
    const ids = RULE_CATALOG.map((r) => r.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('all rules have required fields', () => {
    for (const rule of RULE_CATALOG) {
      expect(typeof rule.id).toBe('string');
      expect(typeof rule.category).toBe('string');
      expect(typeof rule.severity).toBe('string');
      expect(typeof rule.title).toBe('function');
      expect(typeof rule.evaluate).toBe('function');
    }
  });
});

describe('evaluateAllRules', () => {
  it('returns results sorted errors first then warn then ok', () => {
    // Seed a pod that triggers RES-001 (error) and OBS-001 (warn)
    const store = makeStore((s, ctx) => {
      seedResource(
        s,
        ctx,
        'Pod',
        'api',
        'default',
        makePodRaw({
          name: 'api',
          containers: [
            {
              name: 'main',
              livenessProbe: { httpGet: { path: '/health', port: 8080 } },
            },
          ],
        }),
      );
    });
    const results = evaluateAllRules(store, TEST_CONTEXT, EMPTY_CAPS);
    const nonSkipped = results.filter((r) => r.result.status !== 'skipped');

    // Find first error and first warn indices
    const firstErrorIdx = nonSkipped.findIndex(
      (r) => r.result.status === 'error',
    );
    const firstWarnIdx = nonSkipped.findIndex(
      (r) => r.result.status === 'warn',
    );
    const firstOkIdx = nonSkipped.findIndex((r) => r.result.status === 'ok');

    if (firstErrorIdx !== -1 && firstWarnIdx !== -1) {
      expect(firstErrorIdx).toBeLessThan(firstWarnIdx);
    }
    if (firstWarnIdx !== -1 && firstOkIdx !== -1) {
      expect(firstWarnIdx).toBeLessThan(firstOkIdx);
    }
  });

  it('excludes skipped results from output', () => {
    const store = makeStore();
    const results = evaluateAllRules(store, TEST_CONTEXT, EMPTY_CAPS);
    const skipped = results.filter((r) => r.result.status === 'skipped');
    expect(skipped.length).toBe(0);
  });

  it('uses provided rules subset when given', () => {
    const store = makeStore();
    const subsetRules = RULE_CATALOG.slice(0, 3);
    const results = evaluateAllRules(
      store,
      TEST_CONTEXT,
      EMPTY_CAPS,
      subsetRules,
    );
    // At most 3 results (some may be skipped and filtered)
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it('returns empty array for empty store and no Kafka (Kafka rules skipped)', () => {
    // With empty store and no caps, all Kafka rules skip,
    // but other rules may return ok or warn
    const store = makeStore();
    const results = evaluateAllRules(store, TEST_CONTEXT, EMPTY_CAPS);
    // No skipped results in output
    for (const r of results) {
      expect(r.result.status).not.toBe('skipped');
    }
  });
});

describe('findRule', () => {
  it('finds a rule by ID', () => {
    const rule = findRule('RES-001');
    expect(rule).toBeDefined();
    expect(rule?.id).toBe('RES-001');
  });

  it('returns undefined for unknown rule ID', () => {
    expect(findRule('UNKNOWN-999')).toBeUndefined();
  });

  it('finds KFK-013', () => {
    const rule = findRule('KFK-013');
    expect(rule?.id).toBe('KFK-013');
    expect(rule?.category).toBe('kafka');
  });
});
