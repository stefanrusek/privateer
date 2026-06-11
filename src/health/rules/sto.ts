/**
 * Storage rules: STO-001..003 (Spec 06 §6.4).
 *
 * STO-001: PVC is unbound (Pending phase) (warn)
 * STO-002: PVC uses default StorageClass (info)
 * STO-003: PV reclaim policy is Delete with no backup annotation (warn)
 */

import type { HealthRule, RuleResult, AffectedResource } from '../types.js';
import type { StateStore } from '../../store/state-store.js';
import type { ResourceObject } from '../../core/types.js';
import { isRuleSuppressed } from '../suppression.js';

function toAffected(obj: ResourceObject): AffectedResource {
  return {
    kind: obj.kind,
    namespace: obj.namespace ?? '',
    name: obj.name,
  };
}

// ---------------------------------------------------------------------------
// STO-001: PVC is unbound (Pending phase)
// ---------------------------------------------------------------------------

export const STO_001: HealthRule = {
  id: 'STO-001',
  category: 'storage',
  severity: 'warn',
  title: (result) => {
    const n = result.affectedResources.length;
    return n === 1
      ? `1 PVC is unbound (Pending)`
      : `${String(n)} PVCs are unbound (Pending)`;
  },
  evaluate(store: StateStore, context: string): RuleResult {
    const pvcs = store.list(context, 'PersistentVolumeClaim');
    const affected: AffectedResource[] = [];

    for (const pvc of pvcs) {
      if (isRuleSuppressed(pvc.annotations, 'STO-001')) {
        continue;
      }
      const status = pvc.raw.status;
      const phase = status?.phase;
      if (phase === 'Pending') {
        affected.push(toAffected(pvc));
      }
    }

    if (affected.length === 0) {
      return { status: 'ok', affectedResources: [] };
    }
    return { status: 'warn', affectedResources: affected };
  },
};

// ---------------------------------------------------------------------------
// STO-002: PVC uses default StorageClass — consider explicit class
// ---------------------------------------------------------------------------

export const STO_002: HealthRule = {
  id: 'STO-002',
  category: 'storage',
  severity: 'info',
  title: (result) => {
    const n = result.affectedResources.length;
    return n === 1
      ? `1 PVC uses the default StorageClass`
      : `${String(n)} PVCs use the default StorageClass`;
  },
  evaluate(store: StateStore, context: string): RuleResult {
    const pvcs = store.list(context, 'PersistentVolumeClaim');
    const affected: AffectedResource[] = [];

    for (const pvc of pvcs) {
      if (isRuleSuppressed(pvc.annotations, 'STO-002')) {
        continue;
      }
      const spec = pvc.raw.spec;
      const storageClassName = spec?.storageClassName;
      // Empty string or undefined means default storage class
      if (
        storageClassName === undefined ||
        storageClassName === null ||
        storageClassName === ''
      ) {
        affected.push(toAffected(pvc));
      }
    }

    if (affected.length === 0) {
      return { status: 'ok', affectedResources: [] };
    }
    return { status: 'warn', affectedResources: affected };
  },
};

// ---------------------------------------------------------------------------
// STO-003: PV reclaim policy is Delete with no backup annotation
// ---------------------------------------------------------------------------

const BACKUP_ANNOTATIONS = [
  'backup.velero.io/backup-volumes',
  'p9r.io/backup-enabled',
];

export const STO_003: HealthRule = {
  id: 'STO-003',
  category: 'storage',
  severity: 'warn',
  title: (result) => {
    const n = result.affectedResources.length;
    return n === 1
      ? `1 PV has reclaim policy Delete with no backup annotation`
      : `${String(n)} PVs have reclaim policy Delete with no backup annotation`;
  },
  evaluate(store: StateStore, context: string): RuleResult {
    const pvs = store.list(context, 'PersistentVolume');
    const affected: AffectedResource[] = [];

    for (const pv of pvs) {
      if (isRuleSuppressed(pv.annotations, 'STO-003')) {
        continue;
      }
      const spec = pv.raw.spec;
      if (spec?.persistentVolumeReclaimPolicy !== 'Delete') {
        continue;
      }
      const hasBackupAnnotation = BACKUP_ANNOTATIONS.some(
        (key) => pv.annotations[key] !== undefined,
      );
      if (!hasBackupAnnotation) {
        affected.push(toAffected(pv));
      }
    }

    if (affected.length === 0) {
      return { status: 'ok', affectedResources: [] };
    }
    return { status: 'warn', affectedResources: affected };
  },
};
