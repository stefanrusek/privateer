/**
 * Tests for the kind-alias dictionary.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { KIND_ALIASES, resolveKind } from './aliases.js';

describe('resolveKind', () => {
  it('resolves standard aliases', () => {
    expect(resolveKind('pods')).toBe('Pod');
    expect(resolveKind('pod')).toBe('Pod');
    expect(resolveKind('deploy')).toBe('Deployment');
    expect(resolveKind('deployments')).toBe('Deployment');
    expect(resolveKind('sts')).toBe('StatefulSet');
    expect(resolveKind('ds')).toBe('DaemonSet');
    expect(resolveKind('svc')).toBe('Service');
    expect(resolveKind('cm')).toBe('ConfigMap');
    expect(resolveKind('pvc')).toBe('PersistentVolumeClaim');
    expect(resolveKind('ing')).toBe('Ingress');
    expect(resolveKind('topics')).toBe('KafkaTopic');
    expect(resolveKind('topic')).toBe('KafkaTopic');
    expect(resolveKind('hpa')).toBe('HorizontalPodAutoscaler');
    expect(resolveKind('pv')).toBe('PersistentVolume');
    expect(resolveKind('ns')).toBe('Namespace');
    expect(resolveKind('sa')).toBe('ServiceAccount');
  });

  it('is case-insensitive', () => {
    expect(resolveKind('PODS')).toBe('Pod');
    expect(resolveKind('Deploy')).toBe('Deployment');
    expect(resolveKind('STS')).toBe('StatefulSet');
    expect(resolveKind('Svc')).toBe('Service');
  });

  it('returns undefined for unknown aliases', () => {
    expect(resolveKind('unknown')).toBeUndefined();
    expect(resolveKind('')).toBeUndefined();
    expect(resolveKind('xyz')).toBeUndefined();
  });

  it('covers all entries in KIND_ALIASES', () => {
    // Every key in the map must resolve correctly
    for (const [alias, expectedKind] of KIND_ALIASES) {
      expect(resolveKind(alias)).toBe(expectedKind);
    }
  });

  it('all values are non-empty strings', () => {
    for (const [, kind] of KIND_ALIASES) {
      expect(typeof kind).toBe('string');
      expect(kind.length).toBeGreaterThan(0);
    }
  });

  // Property test: resolveKind is always case-insensitive
  it('property: resolveKind(s) === resolveKind(s.toUpperCase()) for all entries', () => {
    fc.assert(
      fc.property(fc.constantFrom(...KIND_ALIASES.keys()), (alias) => {
        expect(resolveKind(alias)).toBe(resolveKind(alias.toUpperCase()));
      }),
    );
  });
});
