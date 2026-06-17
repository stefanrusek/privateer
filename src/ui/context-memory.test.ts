import { describe, it, expect } from 'vitest';
import {
  ALL_NAMESPACES,
  OVERVIEW_KIND,
  defaultEntry,
  remember,
  restore,
  parseContextMemory,
  serializeContextMemory,
  type ContextMemory,
} from './context-memory.js';

// ---------------------------------------------------------------------------
// defaultEntry
// ---------------------------------------------------------------------------

describe('defaultEntry', () => {
  it('is Overview / all-namespaces', () => {
    expect(defaultEntry()).toEqual({
      namespace: ALL_NAMESPACES,
      activeKind: OVERVIEW_KIND,
    });
  });
});

// ---------------------------------------------------------------------------
// remember
// ---------------------------------------------------------------------------

describe('remember', () => {
  it('records a context entry', () => {
    const map = remember({}, 'ctx-a', {
      namespace: 'web',
      activeKind: 'Deployments',
    });
    expect(map['ctx-a']).toEqual({
      namespace: 'web',
      activeKind: 'Deployments',
    });
  });

  it('does not mutate the input map', () => {
    const original: ContextMemory = {
      'ctx-a': { namespace: 'web', activeKind: 'Deployments' },
    };
    const next = remember(original, 'ctx-b', {
      namespace: 'db',
      activeKind: 'Pods',
    });
    expect(original['ctx-b']).toBeUndefined();
    expect(next['ctx-a']).toEqual(original['ctx-a']);
    expect(next['ctx-b']).toEqual({ namespace: 'db', activeKind: 'Pods' });
  });

  it('overwrites an existing entry', () => {
    const map = remember(
      { 'ctx-a': { namespace: 'old', activeKind: 'Overview' } },
      'ctx-a',
      { namespace: 'new', activeKind: 'Pods' },
    );
    expect(map['ctx-a']).toEqual({ namespace: 'new', activeKind: 'Pods' });
  });
});

// ---------------------------------------------------------------------------
// restore
// ---------------------------------------------------------------------------

describe('restore', () => {
  const available = {
    availableKinds: ['Deployments', 'Pods'],
    availableNamespaces: ['web', 'db'],
  };

  it('falls back to default when the context has no memory', () => {
    expect(restore({}, 'ctx-x', available)).toEqual(defaultEntry());
  });

  it('restores a remembered namespace + kind that both still exist', () => {
    const map: ContextMemory = {
      'ctx-a': { namespace: 'web', activeKind: 'Deployments' },
    };
    expect(restore(map, 'ctx-a', available)).toEqual({
      namespace: 'web',
      activeKind: 'Deployments',
    });
  });

  it('falls back to Overview when the remembered kind is absent', () => {
    const map: ContextMemory = {
      'ctx-a': { namespace: 'web', activeKind: 'KafkaTopics' },
    };
    expect(restore(map, 'ctx-a', available)).toEqual({
      namespace: 'web',
      activeKind: OVERVIEW_KIND,
    });
  });

  it('keeps Overview without consulting availableKinds', () => {
    const map: ContextMemory = {
      'ctx-a': { namespace: 'db', activeKind: OVERVIEW_KIND },
    };
    expect(
      restore(map, 'ctx-a', {
        availableKinds: [],
        availableNamespaces: ['db'],
      }),
    ).toEqual({ namespace: 'db', activeKind: OVERVIEW_KIND });
  });

  it('falls back to all-namespaces when the remembered namespace is absent', () => {
    const map: ContextMemory = {
      'ctx-a': { namespace: 'gone', activeKind: 'Pods' },
    };
    expect(restore(map, 'ctx-a', available)).toEqual({
      namespace: ALL_NAMESPACES,
      activeKind: 'Pods',
    });
  });

  it('falls back to all-namespaces when namespaces have not loaded yet', () => {
    const map: ContextMemory = {
      'ctx-a': { namespace: 'web', activeKind: 'Pods' },
    };
    expect(
      restore(map, 'ctx-a', {
        availableKinds: ['Pods'],
        availableNamespaces: [],
      }),
    ).toEqual({ namespace: ALL_NAMESPACES, activeKind: 'Pods' });
  });

  it('keeps an explicitly-remembered all-namespaces value', () => {
    const map: ContextMemory = {
      'ctx-a': { namespace: ALL_NAMESPACES, activeKind: 'Pods' },
    };
    expect(restore(map, 'ctx-a', available)).toEqual({
      namespace: ALL_NAMESPACES,
      activeKind: 'Pods',
    });
  });
});

// ---------------------------------------------------------------------------
// parseContextMemory (schema tolerance)
// ---------------------------------------------------------------------------

describe('parseContextMemory', () => {
  it('yields an empty map for a missing/undefined contexts key', () => {
    expect(parseContextMemory(undefined)).toEqual({});
  });

  it('yields an empty map for null', () => {
    expect(parseContextMemory(null)).toEqual({});
  });

  it('yields an empty map for non-object scalars', () => {
    expect(parseContextMemory(42)).toEqual({});
    expect(parseContextMemory('nope')).toEqual({});
  });

  it('yields an empty map for an array', () => {
    expect(parseContextMemory(['ctx-a'])).toEqual({});
  });

  it('parses a well-formed map', () => {
    const raw = {
      'ctx-a': { namespace: 'web', activeKind: 'Deployments' },
      'ctx-b': { namespace: '', activeKind: 'Overview' },
    };
    expect(parseContextMemory(raw)).toEqual(raw);
  });

  it('drops entries that are not objects', () => {
    const raw = {
      good: { namespace: 'web', activeKind: 'Pods' },
      scalar: 5,
      nul: null,
      arr: ['x'],
    };
    expect(parseContextMemory(raw)).toEqual({
      good: { namespace: 'web', activeKind: 'Pods' },
    });
  });

  it('drops entries with missing or wrong-typed fields', () => {
    const raw = {
      noNs: { activeKind: 'Pods' },
      noKind: { namespace: 'web' },
      badNs: { namespace: 7, activeKind: 'Pods' },
      badKind: { namespace: 'web', activeKind: 9 },
      good: { namespace: 'web', activeKind: 'Pods' },
    };
    expect(parseContextMemory(raw)).toEqual({
      good: { namespace: 'web', activeKind: 'Pods' },
    });
  });
});

// ---------------------------------------------------------------------------
// serializeContextMemory
// ---------------------------------------------------------------------------

describe('serializeContextMemory', () => {
  it('round-trips a well-formed map', () => {
    const map: ContextMemory = {
      'ctx-a': { namespace: 'web', activeKind: 'Deployments' },
    };
    expect(parseContextMemory(serializeContextMemory(map))).toEqual(map);
  });

  it('emits plain entries (only namespace + activeKind)', () => {
    const map: ContextMemory = {
      'ctx-a': { namespace: 'web', activeKind: 'Pods' },
    };
    expect(serializeContextMemory(map)).toEqual({
      'ctx-a': { namespace: 'web', activeKind: 'Pods' },
    });
  });
});
