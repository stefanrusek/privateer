/**
 * Unit tests for STO-001..003 — Storage rules (Spec 06 §6.4).
 */
import { describe, it, expect } from 'vitest';
import { STO_001, STO_002, STO_003 } from './sto.js';
import { makeStore, seedResource, TEST_CONTEXT } from '../test-helpers.js';
import { EMPTY_CAPS } from '../types.js';

// ---------------------------------------------------------------------------
// STO-001: PVC is unbound
// ---------------------------------------------------------------------------

describe('STO-001 — PVC is unbound', () => {
  it('ok — PVC is bound', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'PersistentVolumeClaim', 'data-pvc', 'default', {
        status: { phase: 'Bound' },
      });
    });
    expect(STO_001.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });

  it('warn — PVC is pending', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'PersistentVolumeClaim', 'data-pvc', 'default', {
        status: { phase: 'Pending' },
      });
    });
    const result = STO_001.evaluate(store, TEST_CONTEXT, EMPTY_CAPS);
    expect(result.status).toBe('warn');
    expect(result.affectedResources[0]?.name).toBe('data-pvc');
  });

  it('ok — no PVCs in store', () => {
    expect(STO_001.evaluate(makeStore(), TEST_CONTEXT, EMPTY_CAPS).status).toBe(
      'ok',
    );
  });

  it('suppressed — annotated PVC skipped', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'PersistentVolumeClaim', 'data-pvc', 'default', {
        metadata: { annotations: { 'p9r.io/suppress-rules': 'STO-001' } },
        status: { phase: 'Pending' },
      });
    });
    expect(STO_001.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// STO-002: PVC uses default StorageClass
// ---------------------------------------------------------------------------

describe('STO-002 — PVC uses default StorageClass', () => {
  it('ok — PVC has explicit storage class', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'PersistentVolumeClaim', 'data-pvc', 'default', {
        spec: { storageClassName: 'fast-ssd', accessModes: ['ReadWriteOnce'] },
      });
    });
    expect(STO_002.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });

  it('warn — PVC has no storageClassName (uses default)', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'PersistentVolumeClaim', 'data-pvc', 'default', {
        spec: { accessModes: ['ReadWriteOnce'] },
      });
    });
    const result = STO_002.evaluate(store, TEST_CONTEXT, EMPTY_CAPS);
    expect(result.status).toBe('warn');
    expect(result.affectedResources[0]?.name).toBe('data-pvc');
  });

  it('warn — PVC has empty storageClassName', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'PersistentVolumeClaim', 'data-pvc', 'default', {
        spec: { storageClassName: '', accessModes: ['ReadWriteOnce'] },
      });
    });
    expect(STO_002.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe(
      'warn',
    );
  });

  it('suppressed — annotated PVC skipped', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'PersistentVolumeClaim', 'data-pvc', 'default', {
        metadata: { annotations: { 'p9r.io/suppress-rules': 'STO-002' } },
        spec: { accessModes: ['ReadWriteOnce'] },
      });
    });
    expect(STO_002.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// STO-003: PV reclaim policy Delete with no backup annotation
// ---------------------------------------------------------------------------

describe('STO-003 — PV reclaim policy Delete without backup annotation', () => {
  it('ok — PV has Retain reclaim policy', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'PersistentVolume', 'pv-1', null, {
        spec: { persistentVolumeReclaimPolicy: 'Retain' },
      });
    });
    expect(STO_003.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });

  it('warn — PV has Delete reclaim policy with no backup annotation', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'PersistentVolume', 'pv-1', null, {
        spec: { persistentVolumeReclaimPolicy: 'Delete' },
      });
    });
    const result = STO_003.evaluate(store, TEST_CONTEXT, EMPTY_CAPS);
    expect(result.status).toBe('warn');
    expect(result.affectedResources[0]?.name).toBe('pv-1');
  });

  it('ok — PV has Delete policy but has velero backup annotation', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'PersistentVolume', 'pv-1', null, {
        metadata: {
          annotations: { 'backup.velero.io/backup-volumes': 'true' },
        },
        spec: { persistentVolumeReclaimPolicy: 'Delete' },
      });
    });
    expect(STO_003.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });

  it('ok — PV has Delete policy but has p9r backup annotation', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'PersistentVolume', 'pv-1', null, {
        metadata: { annotations: { 'p9r.io/backup-enabled': 'true' } },
        spec: { persistentVolumeReclaimPolicy: 'Delete' },
      });
    });
    expect(STO_003.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });

  it('suppressed — annotated PV skipped', () => {
    const store = makeStore((s, ctx) => {
      seedResource(s, ctx, 'PersistentVolume', 'pv-1', null, {
        metadata: { annotations: { 'p9r.io/suppress-rules': 'STO-003' } },
        spec: { persistentVolumeReclaimPolicy: 'Delete' },
      });
    });
    expect(STO_003.evaluate(store, TEST_CONTEXT, EMPTY_CAPS).status).toBe('ok');
  });

  it('ok — no PVs in store', () => {
    expect(STO_003.evaluate(makeStore(), TEST_CONTEXT, EMPTY_CAPS).status).toBe(
      'ok',
    );
  });
});

// ---------------------------------------------------------------------------
// Title plural coverage
// ---------------------------------------------------------------------------

describe('STO title plural branches', () => {
  it('STO_001 title — singular (1 PVC)', () => {
    const result = {
      status: 'warn' as const,
      affectedResources: [
        { kind: 'PersistentVolumeClaim', namespace: 'default', name: 'pvc-1' },
      ],
    };
    expect(STO_001.title(result)).toContain('1 PVC');
  });

  it('STO_001 title — plural (2 PVCs)', () => {
    const result = {
      status: 'warn' as const,
      affectedResources: [
        { kind: 'PersistentVolumeClaim', namespace: 'default', name: 'pvc-1' },
        { kind: 'PersistentVolumeClaim', namespace: 'default', name: 'pvc-2' },
      ],
    };
    expect(STO_001.title(result)).toContain('2 PVCs');
  });

  it('STO_002 title — singular', () => {
    const result = {
      status: 'warn' as const,
      affectedResources: [
        { kind: 'PersistentVolumeClaim', namespace: 'default', name: 'pvc-1' },
      ],
    };
    expect(STO_002.title(result)).toContain('1 PVC');
  });

  it('STO_002 title — plural', () => {
    const result = {
      status: 'warn' as const,
      affectedResources: [
        { kind: 'PersistentVolumeClaim', namespace: 'default', name: 'pvc-1' },
        { kind: 'PersistentVolumeClaim', namespace: 'default', name: 'pvc-2' },
      ],
    };
    expect(STO_002.title(result)).toContain('2 PVCs');
  });

  it('STO_003 title — singular', () => {
    const result = {
      status: 'warn' as const,
      affectedResources: [
        { kind: 'PersistentVolume', namespace: '', name: 'pv-1' },
      ],
    };
    expect(STO_003.title(result)).toContain('1 PV');
  });

  it('STO_003 title — plural', () => {
    const result = {
      status: 'warn' as const,
      affectedResources: [
        { kind: 'PersistentVolume', namespace: '', name: 'pv-1' },
        { kind: 'PersistentVolume', namespace: '', name: 'pv-2' },
      ],
    };
    expect(STO_003.title(result)).toContain('2 PVs');
  });
});
