import { describe, it, expect } from 'vitest';
import type { KubernetesObject } from '../core/types.js';
import { getColumns, getCrColumns, GENERIC_COLS } from './columns.js';

const NOW = 1_000_000_000_000;
const CREATED = new Date(NOW - 3600_000).toISOString(); // 1h ago

function raw(overrides: Partial<KubernetesObject> = {}): KubernetesObject {
  return {
    metadata: {
      name: 'test-obj',
      namespace: 'test-ns',
      creationTimestamp: CREATED,
    },
    ...overrides,
  };
}

describe('getColumns', () => {
  it('returns GENERIC_COLS for unknown kind', () => {
    expect(getColumns('UnknownKind')).toBe(GENERIC_COLS);
  });

  it('GENERIC_COLS has 4 columns: Status, Name, Namespace, Age', () => {
    expect(GENERIC_COLS).toHaveLength(4);
    expect(GENERIC_COLS[0]?.header).toBe('');
    expect(GENERIC_COLS[1]?.header).toBe('Name');
    expect(GENERIC_COLS[2]?.header).toBe('Namespace');
    expect(GENERIC_COLS[3]?.header).toBe('Age');
  });

  it('GENERIC_COLS accessors work', () => {
    const r = raw();
    const cols = GENERIC_COLS;
    expect(cols[0]?.accessor(r, NOW)).toBe('');
    expect(cols[1]?.accessor(r, NOW)).toBe('test-obj');
    expect(cols[2]?.accessor(r, NOW)).toBe('test-ns');
    expect(cols[3]?.accessor(r, NOW)).toBe('1h');
  });

  it('GENERIC_COLS accessors return empty strings when no metadata', () => {
    // Covers the ?? '' fallback branches in metaName, metaNamespace, ageCol
    const noMeta: KubernetesObject = {};
    const cols = GENERIC_COLS;
    expect(cols[1]?.accessor(noMeta, NOW)).toBe('');
    expect(cols[2]?.accessor(noMeta, NOW)).toBe('');
    // ageCol with empty string (invalid ISO) -> empty
    expect(cols[3]?.accessor(noMeta, NOW)).toBe('');
  });

  describe('Deployment columns', () => {
    it('has 7 columns', () => {
      expect(getColumns('Deployment')).toHaveLength(7);
    });

    it('accessor for Ready column', () => {
      const cols = getColumns('Deployment');
      const readyCol = cols[3];
      const r = raw({ status: { readyReplicas: 2, replicas: 3 } });
      expect(readyCol?.accessor(r, NOW)).toBe('2/3');
    });

    it('accessor for Ready column — no data defaults to 0/0', () => {
      const cols = getColumns('Deployment');
      const readyCol = cols[3];
      expect(readyCol?.accessor(raw(), NOW)).toBe('0/0');
    });

    it('accessor for Up-to-date column', () => {
      const cols = getColumns('Deployment');
      const col = cols[4];
      expect(col?.accessor(raw({ status: { updatedReplicas: 3 } }), NOW)).toBe(
        '3',
      );
      expect(col?.accessor(raw(), NOW)).toBe('0');
    });

    it('accessor for Available column', () => {
      const cols = getColumns('Deployment');
      const col = cols[5];
      expect(
        col?.accessor(raw({ status: { availableReplicas: 3 } }), NOW),
      ).toBe('3');
      expect(col?.accessor(raw(), NOW)).toBe('0');
    });
  });

  describe('StatefulSet columns', () => {
    it('has 5 columns', () => {
      expect(getColumns('StatefulSet')).toHaveLength(5);
    });

    it('Ready accessor', () => {
      const col = getColumns('StatefulSet')[3];
      const r = raw({ status: { readyReplicas: 1, replicas: 2 } });
      expect(col?.accessor(r, NOW)).toBe('1/2');
    });

    it('Ready accessor — no readyReplicas or replicas returns 0/0', () => {
      const col = getColumns('StatefulSet')[3];
      expect(col?.accessor(raw(), NOW)).toBe('0/0');
    });
  });

  describe('DaemonSet columns', () => {
    it('has 7 columns', () => {
      expect(getColumns('DaemonSet')).toHaveLength(7);
    });

    it('Desired, Ready, Up-to-date accessors', () => {
      const cols = getColumns('DaemonSet');
      const r = raw({
        status: {
          desiredNumberScheduled: 3,
          numberReady: 2,
          updatedNumberScheduled: 3,
        },
      });
      expect(cols[3]?.accessor(r, NOW)).toBe('3');
      expect(cols[4]?.accessor(r, NOW)).toBe('2');
      expect(cols[5]?.accessor(r, NOW)).toBe('3');
    });

    it('defaults to 0 when status fields absent', () => {
      const cols = getColumns('DaemonSet');
      const r = raw();
      expect(cols[3]?.accessor(r, NOW)).toBe('0');
      expect(cols[4]?.accessor(r, NOW)).toBe('0');
      expect(cols[5]?.accessor(r, NOW)).toBe('0');
    });
  });

  describe('Pod columns', () => {
    it('has 8 columns', () => {
      expect(getColumns('Pod')).toHaveLength(8);
    });

    it('Ready accessor with containerStatuses', () => {
      const col = getColumns('Pod')[3];
      const r = raw({
        status: {
          containerStatuses: [{ ready: true }, { ready: false }],
        },
      });
      expect(col?.accessor(r, NOW)).toBe('1/2');
    });

    it('Ready accessor with no containerStatuses', () => {
      const col = getColumns('Pod')[3];
      expect(col?.accessor(raw(), NOW)).toBe('0/0');
    });

    it('Phase accessor', () => {
      const col = getColumns('Pod')[4];
      expect(col?.accessor(raw({ status: { phase: 'Running' } }), NOW)).toBe(
        'Running',
      );
      expect(col?.accessor(raw(), NOW)).toBe('');
    });

    it('Restarts accessor', () => {
      const col = getColumns('Pod')[5];
      const r = raw({
        status: {
          containerStatuses: [{ restartCount: 3 }, { restartCount: 2 }],
        },
      });
      expect(col?.accessor(r, NOW)).toBe('5');
      expect(col?.accessor(raw(), NOW)).toBe('0');
    });

    it('Restarts accessor — container with no restartCount defaults to 0', () => {
      const col = getColumns('Pod')[5];
      const r = raw({ status: { containerStatuses: [{}] } });
      expect(col?.accessor(r, NOW)).toBe('0');
    });

    it('Node accessor', () => {
      const col = getColumns('Pod')[6];
      expect(col?.accessor(raw({ spec: { nodeName: 'node-1' } }), NOW)).toBe(
        'node-1',
      );
      expect(col?.accessor(raw(), NOW)).toBe('');
    });
  });

  describe('Job columns', () => {
    it('has 6 columns', () => {
      expect(getColumns('Job')).toHaveLength(6);
    });

    it('Completions accessor', () => {
      const col = getColumns('Job')[3];
      const r = raw({
        spec: { completions: 5 },
        status: { succeeded: 3 },
      });
      expect(col?.accessor(r, NOW)).toBe('3/5');
    });

    it('Duration accessor with times', () => {
      const col = getColumns('Job')[4];
      const r = raw({
        status: {
          startTime: '2024-01-01T00:00:00Z',
          completionTime: '2024-01-01T00:01:30Z',
        },
      });
      expect(col?.accessor(r, NOW)).toBe('90s');
    });

    it('Duration accessor — no times returns empty string', () => {
      const col = getColumns('Job')[4];
      expect(col?.accessor(raw(), NOW)).toBe('');
    });

    it('Completions accessor — no succeeded or completions defaults to 0/0', () => {
      const col = getColumns('Job')[3];
      expect(col?.accessor(raw(), NOW)).toBe('0/0');
    });
  });

  describe('CronJob columns', () => {
    it('has 7 columns', () => {
      expect(getColumns('CronJob')).toHaveLength(7);
    });

    it('Schedule and Suspend accessors', () => {
      const cols = getColumns('CronJob');
      const r = raw({ spec: { schedule: '0 * * * *', suspend: true } });
      expect(cols[3]?.accessor(r, NOW)).toBe('0 * * * *');
      expect(cols[4]?.accessor(r, NOW)).toBe('true');
      expect(cols[4]?.accessor(raw(), NOW)).toBe('false');
    });

    it('Last Schedule accessor', () => {
      const col = getColumns('CronJob')[5];
      const r = raw({ status: { lastScheduleTime: '2024-01-01T00:00:00Z' } });
      expect(col?.accessor(r, NOW)).toBe('2024-01-01T00:00:00Z');
      expect(col?.accessor(raw(), NOW)).toBe('');
    });

    it('Schedule accessor — absent returns empty', () => {
      const col = getColumns('CronJob')[3];
      expect(col?.accessor(raw(), NOW)).toBe('');
    });
  });

  describe('Service columns', () => {
    it('has 8 columns', () => {
      expect(getColumns('Service')).toHaveLength(8);
    });

    it('Type and Cluster IP accessors', () => {
      const cols = getColumns('Service');
      const r = raw({ spec: { type: 'ClusterIP', clusterIP: '10.0.0.1' } });
      expect(cols[3]?.accessor(r, NOW)).toBe('ClusterIP');
      expect(cols[4]?.accessor(r, NOW)).toBe('10.0.0.1');
    });

    it('Type accessor — absent returns empty', () => {
      const col = getColumns('Service')[3];
      expect(col?.accessor(raw(), NOW)).toBe('');
    });

    it('Cluster IP accessor — absent returns empty', () => {
      const col = getColumns('Service')[4];
      expect(col?.accessor(raw(), NOW)).toBe('');
    });

    it('External IP accessor — with IP', () => {
      const col = getColumns('Service')[5];
      const r = raw({
        status: { loadBalancer: { ingress: [{ ip: '1.2.3.4' }] } },
      });
      expect(col?.accessor(r, NOW)).toBe('1.2.3.4');
    });

    it('External IP accessor — no status', () => {
      const col = getColumns('Service')[5];
      expect(col?.accessor(raw(), NOW)).toBe('');
    });

    it('External IP accessor — null loadBalancer', () => {
      const col = getColumns('Service')[5];
      const r = raw({ status: { loadBalancer: null } });
      expect(col?.accessor(r, NOW)).toBe('');
    });

    it('External IP accessor — empty ingress', () => {
      const col = getColumns('Service')[5];
      const r = raw({ status: { loadBalancer: { ingress: [] } } });
      expect(col?.accessor(r, NOW)).toBe('');
    });

    it('External IP accessor — ingress item has no ip', () => {
      const col = getColumns('Service')[5];
      const r = raw({
        status: {
          loadBalancer: { ingress: [{ hostname: 'foo.example.com' }] },
        },
      });
      expect(col?.accessor(r, NOW)).toBe('');
    });

    it('External IP accessor — ingress[0] is undefined (sparse/holey array)', () => {
      const col = getColumns('Service')[5];
      const sparseIngress: unknown[] = [];
      sparseIngress.length = 1;
      const r = raw({ status: { loadBalancer: { ingress: sparseIngress } } });
      expect(col?.accessor(r, NOW)).toBe('');
    });

    it('Ports accessor', () => {
      const col = getColumns('Service')[6];
      const r = raw({
        spec: {
          ports: [
            { port: 80, protocol: 'TCP' },
            { port: 443, protocol: 'TCP' },
          ],
        },
      });
      expect(col?.accessor(r, NOW)).toBe('80/TCP, 443/TCP');
    });

    it('Ports accessor — no ports', () => {
      const col = getColumns('Service')[6];
      expect(col?.accessor(raw(), NOW)).toBe('');
    });

    it('Ports accessor — port without protocol defaults to TCP', () => {
      const col = getColumns('Service')[6];
      const r = raw({ spec: { ports: [{ port: 80 }] } });
      expect(col?.accessor(r, NOW)).toBe('80/TCP');
    });

    it('Ports accessor — port with no port or protocol', () => {
      const col = getColumns('Service')[6];
      const r = raw({ spec: { ports: [{}] } });
      expect(col?.accessor(r, NOW)).toBe('/TCP');
    });
  });

  describe('Ingress columns', () => {
    it('has 7 columns', () => {
      expect(getColumns('Ingress')).toHaveLength(7);
    });

    it('Class accessor', () => {
      const col = getColumns('Ingress')[3];
      expect(
        col?.accessor(raw({ spec: { ingressClassName: 'nginx' } }), NOW),
      ).toBe('nginx');
      expect(col?.accessor(raw(), NOW)).toBe('');
    });

    it('Hosts accessor', () => {
      const col = getColumns('Ingress')[4];
      const r = raw({
        spec: { rules: [{ host: 'a.com' }, { host: 'b.com' }] },
      });
      expect(col?.accessor(r, NOW)).toBe('a.com, b.com');
      expect(col?.accessor(raw(), NOW)).toBe('');
    });

    it('Hosts accessor — rule with no host is filtered out', () => {
      const col = getColumns('Ingress')[4];
      const r = raw({ spec: { rules: [{ host: 'a.com' }, {}] } });
      expect(col?.accessor(r, NOW)).toBe('a.com');
    });

    it('Address accessor — with IP', () => {
      const col = getColumns('Ingress')[5];
      const r = raw({
        status: { loadBalancer: { ingress: [{ ip: '1.2.3.4' }] } },
      });
      expect(col?.accessor(r, NOW)).toBe('1.2.3.4');
    });

    it('Address accessor — with hostname', () => {
      const col = getColumns('Ingress')[5];
      const r = raw({
        status: { loadBalancer: { ingress: [{ hostname: 'lb.example.com' }] } },
      });
      expect(col?.accessor(r, NOW)).toBe('lb.example.com');
    });

    it('Address accessor — no address', () => {
      const col = getColumns('Ingress')[5];
      expect(col?.accessor(raw(), NOW)).toBe('');
    });

    it('Address accessor — null loadBalancer', () => {
      const col = getColumns('Ingress')[5];
      const r = raw({ status: { loadBalancer: null } });
      expect(col?.accessor(r, NOW)).toBe('');
    });

    it('Address accessor — empty ingress', () => {
      const col = getColumns('Ingress')[5];
      const r = raw({ status: { loadBalancer: { ingress: [] } } });
      expect(col?.accessor(r, NOW)).toBe('');
    });

    it('Address accessor — ingress[0] has no ip or hostname', () => {
      const col = getColumns('Ingress')[5];
      const r = raw({ status: { loadBalancer: { ingress: [{}] } } });
      expect(col?.accessor(r, NOW)).toBe('');
    });

    it('Address accessor — ingress[0] is undefined (sparse/holey array)', () => {
      const col = getColumns('Ingress')[5];
      // Sparse array with a slot at index 0 that is undefined
      const sparseIngress: unknown[] = [];
      sparseIngress.length = 1; // sparse: [undefined]
      const r = raw({ status: { loadBalancer: { ingress: sparseIngress } } });
      expect(col?.accessor(r, NOW)).toBe('');
    });
  });

  describe('NetworkPolicy columns', () => {
    it('has 4 columns (no status)', () => {
      expect(getColumns('NetworkPolicy')).toHaveLength(4);
      expect(getColumns('NetworkPolicy')[0]?.header).toBe('Name');
    });

    it('Pod Selector accessor', () => {
      const col = getColumns('NetworkPolicy')[2];
      const r = raw({ spec: { podSelector: { matchLabels: { app: 'web' } } } });
      expect(col?.accessor(r, NOW)).toBe('{"matchLabels":{"app":"web"}}');
    });

    it('Pod Selector accessor — empty selector', () => {
      const col = getColumns('NetworkPolicy')[2];
      expect(col?.accessor(raw({ spec: {} }), NOW)).toBe('');
      expect(col?.accessor(raw(), NOW)).toBe('');
    });
  });

  describe('ConfigMap columns', () => {
    it('has 4 columns (no status)', () => {
      expect(getColumns('ConfigMap')).toHaveLength(4);
    });

    it('Keys accessor', () => {
      const col = getColumns('ConfigMap')[2];
      const r = raw({ data: { a: '1', b: '2' } });
      expect(col?.accessor(r, NOW)).toBe('2');
      expect(col?.accessor(raw(), NOW)).toBe('0');
    });
  });

  describe('Secret columns', () => {
    it('has 5 columns', () => {
      expect(getColumns('Secret')).toHaveLength(5);
    });

    it('Type and Keys accessors', () => {
      const cols = getColumns('Secret');
      const r = raw({
        type: 'kubernetes.io/tls',
        data: { 'tls.crt': '', 'tls.key': '' },
      });
      expect(cols[2]?.accessor(r, NOW)).toBe('kubernetes.io/tls');
      expect(cols[3]?.accessor(r, NOW)).toBe('2');
    });

    it('Type accessor — no type', () => {
      const col = getColumns('Secret')[2];
      expect(col?.accessor(raw(), NOW)).toBe('');
    });

    it('Keys accessor — no data returns "0"', () => {
      const col = getColumns('Secret')[3];
      expect(col?.accessor(raw(), NOW)).toBe('0');
    });

    it('Type accessor — non-string type returns empty', () => {
      // Covers the falsy branch of typeof v === 'string' ? v : ''
      const col = getColumns('Secret')[2];
      const r: KubernetesObject = { ...raw(), type: 42 };
      expect(col?.accessor(r, NOW)).toBe('');
    });
  });

  describe('HPA columns', () => {
    it('has 8 columns', () => {
      expect(getColumns('HorizontalPodAutoscaler')).toHaveLength(8);
    });

    it('Reference accessor', () => {
      const col = getColumns('HorizontalPodAutoscaler')[3];
      const r = raw({ spec: { scaleTargetRef: { name: 'my-deploy' } } });
      expect(col?.accessor(r, NOW)).toBe('my-deploy');
      expect(col?.accessor(raw(), NOW)).toBe('');
    });

    it('Reference accessor — null scaleTargetRef', () => {
      const col = getColumns('HorizontalPodAutoscaler')[3];
      const r = raw({ spec: { scaleTargetRef: null } });
      expect(col?.accessor(r, NOW)).toBe('');
    });

    it('Reference accessor — name is non-string returns empty', () => {
      const col = getColumns('HorizontalPodAutoscaler')[3];
      const r = raw({ spec: { scaleTargetRef: { name: 42 } } });
      expect(col?.accessor(r, NOW)).toBe('');
    });

    it('Min/Max accessor', () => {
      const col = getColumns('HorizontalPodAutoscaler')[4];
      const r = raw({ spec: { minReplicas: 1, maxReplicas: 5 } });
      expect(col?.accessor(r, NOW)).toBe('1/5');
      expect(col?.accessor(raw(), NOW)).toBe('/');
    });

    it('Replicas accessor', () => {
      const col = getColumns('HorizontalPodAutoscaler')[5];
      expect(col?.accessor(raw({ status: { currentReplicas: 3 } }), NOW)).toBe(
        '3',
      );
      expect(col?.accessor(raw(), NOW)).toBe('0');
    });

    it('CPU% accessor returns empty string (no metrics integrated)', () => {
      const col = getColumns('HorizontalPodAutoscaler')[6];
      expect(col?.accessor(raw(), NOW)).toBe('');
    });

    it('CPU% accessor with currentMetrics returns empty (placeholder)', () => {
      const col = getColumns('HorizontalPodAutoscaler')[6];
      const r = raw({ status: { currentMetrics: [{ type: 'Resource' }] } });
      expect(col?.accessor(r, NOW)).toBe('');
    });
  });

  describe('PVC columns', () => {
    it('has 8 columns', () => {
      expect(getColumns('PersistentVolumeClaim')).toHaveLength(8);
    });

    it('Phase, Volume, Capacity, StorageClass accessors', () => {
      const cols = getColumns('PersistentVolumeClaim');
      const r = raw({
        spec: { volumeName: 'pv-001', storageClassName: 'fast' },
        status: {
          phase: 'Bound',
          capacity: { storage: '10Gi' },
        },
      });
      expect(cols[3]?.accessor(r, NOW)).toBe('Bound');
      expect(cols[4]?.accessor(r, NOW)).toBe('pv-001');
      expect(cols[5]?.accessor(r, NOW)).toBe('10Gi');
      expect(cols[6]?.accessor(r, NOW)).toBe('fast');
    });

    it('Capacity accessor — no capacity', () => {
      const col = getColumns('PersistentVolumeClaim')[5];
      expect(col?.accessor(raw(), NOW)).toBe('');
    });

    it('Capacity accessor — null capacity', () => {
      const col = getColumns('PersistentVolumeClaim')[5];
      const r = raw({ status: { capacity: null } });
      expect(col?.accessor(r, NOW)).toBe('');
    });

    it('Capacity accessor — storage is non-string returns empty', () => {
      const col = getColumns('PersistentVolumeClaim')[5];
      const r = raw({ status: { capacity: { storage: 42 } } });
      expect(col?.accessor(r, NOW)).toBe('');
    });

    it('Phase accessor — non-string phase returns empty', () => {
      const col = getColumns('PersistentVolumeClaim')[3];
      const r = raw({ status: { phase: 42 } });
      expect(col?.accessor(r, NOW)).toBe('');
    });

    it('Volume accessor — non-string volumeName returns empty', () => {
      const col = getColumns('PersistentVolumeClaim')[4];
      const r = raw({ spec: { volumeName: 42 } });
      expect(col?.accessor(r, NOW)).toBe('');
    });

    it('StorageClass accessor', () => {
      const col = getColumns('PersistentVolumeClaim')[6];
      expect(
        col?.accessor(raw({ spec: { storageClassName: 'standard' } }), NOW),
      ).toBe('standard');
      expect(col?.accessor(raw(), NOW)).toBe('');
    });
  });

  describe('PV columns', () => {
    // PV_COLS order: STATUS[0], Name[1], Capacity[2], AccessModes[3],
    //                ReclaimPolicy[4], Phase[5], Claim[6], StorageClass[7], Age[8]
    it('has 9 columns', () => {
      expect(getColumns('PersistentVolume')).toHaveLength(9);
    });

    it('Capacity accessor', () => {
      const col = getColumns('PersistentVolume')[2];
      const r = raw({ spec: { capacity: { storage: '50Gi' } } });
      expect(col?.accessor(r, NOW)).toBe('50Gi');
    });

    it('Capacity accessor — null capacity', () => {
      const col = getColumns('PersistentVolume')[2];
      const r = raw({ spec: { capacity: null } });
      expect(col?.accessor(r, NOW)).toBe('');
    });

    it('Capacity accessor — no capacity', () => {
      const col = getColumns('PersistentVolume')[2];
      expect(col?.accessor(raw(), NOW)).toBe('');
    });

    it('Capacity accessor — storage is non-string returns empty', () => {
      const col = getColumns('PersistentVolume')[2];
      const r = raw({ spec: { capacity: { storage: 42 } } });
      expect(col?.accessor(r, NOW)).toBe('');
    });

    it('Access Modes accessor', () => {
      const col = getColumns('PersistentVolume')[3];
      const r = raw({
        spec: { accessModes: ['ReadWriteOnce', 'ReadOnlyMany'] },
      });
      expect(col?.accessor(r, NOW)).toBe('ReadWriteOnce, ReadOnlyMany');
      expect(col?.accessor(raw(), NOW)).toBe('');
    });

    it('Reclaim Policy accessor', () => {
      const col = getColumns('PersistentVolume')[4];
      expect(
        col?.accessor(
          raw({ spec: { persistentVolumeReclaimPolicy: 'Delete' } }),
          NOW,
        ),
      ).toBe('Delete');
      expect(col?.accessor(raw(), NOW)).toBe('');
    });

    it('Claim accessor', () => {
      const col = getColumns('PersistentVolume')[6];
      const r = raw({
        spec: { claimRef: { namespace: 'default', name: 'my-pvc' } },
      });
      expect(col?.accessor(r, NOW)).toBe('default/my-pvc');
    });

    it('Claim accessor — null claimRef', () => {
      const col = getColumns('PersistentVolume')[6];
      const r = raw({ spec: { claimRef: null } });
      expect(col?.accessor(r, NOW)).toBe('');
    });

    it('Claim accessor — partial claimRef', () => {
      const col = getColumns('PersistentVolume')[6];
      const r = raw({ spec: { claimRef: { namespace: 'default' } } });
      expect(col?.accessor(r, NOW)).toBe('');
    });

    it('Phase accessor', () => {
      const col = getColumns('PersistentVolume')[5];
      expect(col?.accessor(raw({ status: { phase: 'Bound' } }), NOW)).toBe(
        'Bound',
      );
      expect(col?.accessor(raw(), NOW)).toBe('');
    });

    it('StorageClass accessor', () => {
      const col = getColumns('PersistentVolume')[7];
      expect(
        col?.accessor(raw({ spec: { storageClassName: 'fast' } }), NOW),
      ).toBe('fast');
      expect(col?.accessor(raw(), NOW)).toBe('');
    });
  });

  describe('StorageClass columns', () => {
    it('has 5 columns (no status)', () => {
      expect(getColumns('StorageClass')).toHaveLength(5);
    });

    it('Provisioner and ReclaimPolicy accessors', () => {
      const cols = getColumns('StorageClass');
      const r: KubernetesObject = {
        ...raw(),
        provisioner: 'kubernetes.io/gce-pd',
        reclaimPolicy: 'Delete',
      };
      expect(cols[1]?.accessor(r, NOW)).toBe('kubernetes.io/gce-pd');
      expect(cols[2]?.accessor(r, NOW)).toBe('Delete');
    });

    it('Provisioner accessor — absent', () => {
      expect(getColumns('StorageClass')[1]?.accessor(raw(), NOW)).toBe('');
    });

    it('ReclaimPolicy accessor — absent', () => {
      expect(getColumns('StorageClass')[2]?.accessor(raw(), NOW)).toBe('');
    });

    it('Default annotation accessor — true', () => {
      const col = getColumns('StorageClass')[3];
      const r = raw({
        metadata: {
          name: 'fast',
          annotations: {
            'storageclass.kubernetes.io/is-default-class': 'true',
          },
        },
      });
      expect(col?.accessor(r, NOW)).toBe('true');
    });

    it('Default annotation accessor — absent', () => {
      const col = getColumns('StorageClass')[3];
      expect(col?.accessor(raw(), NOW)).toBe('');
    });
  });

  describe('Node columns', () => {
    it('has 7 columns', () => {
      expect(getColumns('Node')).toHaveLength(7);
    });

    it('Role accessor', () => {
      const col = getColumns('Node')[2];
      const r = raw({
        metadata: {
          name: 'node-1',
          labels: {
            'node-role.kubernetes.io/control-plane': '',
            'node-role.kubernetes.io/worker': '',
          },
        },
      });
      const result = col?.accessor(r, NOW) ?? '';
      expect(result.split(',').sort()).toEqual(
        ['control-plane', 'worker'].sort(),
      );
    });

    it('Role accessor — no role labels', () => {
      const col = getColumns('Node')[2];
      expect(col?.accessor(raw(), NOW)).toBe('');
    });

    it('Version accessor', () => {
      const col = getColumns('Node')[3];
      const r = raw({ status: { nodeInfo: { kubeletVersion: 'v1.28.0' } } });
      expect(col?.accessor(r, NOW)).toBe('v1.28.0');
    });

    it('Version accessor — no nodeInfo', () => {
      const col = getColumns('Node')[3];
      expect(col?.accessor(raw(), NOW)).toBe('');
    });

    it('Version accessor — null nodeInfo', () => {
      const col = getColumns('Node')[3];
      const r = raw({ status: { nodeInfo: null } });
      expect(col?.accessor(r, NOW)).toBe('');
    });

    it('Version accessor — kubeletVersion is non-string returns empty', () => {
      const col = getColumns('Node')[3];
      const r = raw({ status: { nodeInfo: { kubeletVersion: 42 } } });
      expect(col?.accessor(r, NOW)).toBe('');
    });

    it('CPU and Memory accessors render humanized capacity', () => {
      const cpuCol = getColumns('Node')[4];
      const memCol = getColumns('Node')[5];
      const r = raw({
        status: { capacity: { cpu: '72', memory: '264006104Ki' } },
      });
      expect(cpuCol?.accessor(r, NOW)).toBe('72');
      expect(memCol?.accessor(r, NOW)).toBe('251.8Gi');
    });

    it('CPU and Memory accessors — no status.capacity return empty', () => {
      const cpuCol = getColumns('Node')[4];
      const memCol = getColumns('Node')[5];
      expect(cpuCol?.accessor(raw(), NOW)).toBe('');
      expect(memCol?.accessor(raw(), NOW)).toBe('');
    });

    it('CPU and Memory accessors — null capacity returns empty', () => {
      const cpuCol = getColumns('Node')[4];
      const memCol = getColumns('Node')[5];
      const r = raw({ status: { capacity: null } });
      expect(cpuCol?.accessor(r, NOW)).toBe('');
      expect(memCol?.accessor(r, NOW)).toBe('');
    });

    it('CPU and Memory accessors — non-string values return empty', () => {
      const cpuCol = getColumns('Node')[4];
      const memCol = getColumns('Node')[5];
      const r = raw({ status: { capacity: { cpu: 72, memory: 1234 } } });
      expect(cpuCol?.accessor(r, NOW)).toBe('');
      expect(memCol?.accessor(r, NOW)).toBe('');
    });
  });

  describe('Namespace columns', () => {
    it('has 4 columns', () => {
      expect(getColumns('Namespace')).toHaveLength(4);
    });

    it('Phase accessor', () => {
      const col = getColumns('Namespace')[2];
      expect(col?.accessor(raw({ status: { phase: 'Active' } }), NOW)).toBe(
        'Active',
      );
      expect(col?.accessor(raw(), NOW)).toBe('');
    });
  });

  describe('Kafka columns', () => {
    it('has 7 columns', () => {
      expect(getColumns('Kafka')).toHaveLength(7);
    });

    it('Version, Brokers, Zookeeper accessors', () => {
      const cols = getColumns('Kafka');
      const r = raw({
        spec: {
          kafka: { version: '3.5.0', replicas: 3 },
          zookeeper: { replicas: 3 },
        },
      });
      expect(cols[3]?.accessor(r, NOW)).toBe('3.5.0');
      expect(cols[4]?.accessor(r, NOW)).toBe('3');
      expect(cols[5]?.accessor(r, NOW)).toBe('3');
    });

    it('Version accessor — null kafka spec', () => {
      const col = getColumns('Kafka')[3];
      const r = raw({ spec: { kafka: null } });
      expect(col?.accessor(r, NOW)).toBe('');
    });

    it('Version accessor — non-string version returns empty', () => {
      const col = getColumns('Kafka')[3];
      const r = raw({ spec: { kafka: { version: 42 } } });
      expect(col?.accessor(r, NOW)).toBe('');
    });

    it('Brokers accessor — null kafka spec', () => {
      const col = getColumns('Kafka')[4];
      const r = raw({ spec: { kafka: null } });
      expect(col?.accessor(r, NOW)).toBe('0');
    });

    it('Zookeeper accessor — null zookeeper spec', () => {
      const col = getColumns('Kafka')[5];
      const r = raw({ spec: { zookeeper: null } });
      expect(col?.accessor(r, NOW)).toBe('0');
    });

    it('Defaults when no spec', () => {
      const cols = getColumns('Kafka');
      expect(cols[3]?.accessor(raw(), NOW)).toBe('');
      expect(cols[4]?.accessor(raw(), NOW)).toBe('0');
      expect(cols[5]?.accessor(raw(), NOW)).toBe('0');
    });

    it('Zookeeper replicas is non-numeric falls back to "0"', () => {
      const col = getColumns('Kafka')[5];
      const r = raw({ spec: { zookeeper: { replicas: 'not-a-number' } } });
      expect(col?.accessor(r, NOW)).toBe('0');
    });

    it('Kafka broker replicas is non-numeric falls back to "0"', () => {
      const col = getColumns('Kafka')[4];
      const r = raw({ spec: { kafka: { replicas: 'bad' } } });
      expect(col?.accessor(r, NOW)).toBe('0');
    });
  });

  describe('KafkaTopic columns', () => {
    it('has 6 columns', () => {
      expect(getColumns('KafkaTopic')).toHaveLength(6);
    });

    it('Partitions and Replication accessors', () => {
      const cols = getColumns('KafkaTopic');
      const r = raw({ spec: { partitions: 12, replicas: 3 } });
      expect(cols[3]?.accessor(r, NOW)).toBe('12');
      expect(cols[4]?.accessor(r, NOW)).toBe('3');
    });

    it('defaults to 0 when absent', () => {
      const cols = getColumns('KafkaTopic');
      expect(cols[3]?.accessor(raw(), NOW)).toBe('0');
      expect(cols[4]?.accessor(raw(), NOW)).toBe('0');
    });
  });

  describe('KafkaUser columns', () => {
    it('has 6 columns', () => {
      expect(getColumns('KafkaUser')).toHaveLength(6);
    });

    it('Authentication and Authorization accessors', () => {
      const cols = getColumns('KafkaUser');
      const r = raw({
        spec: {
          authentication: { type: 'tls' },
          authorization: { type: 'simple' },
        },
      });
      expect(cols[3]?.accessor(r, NOW)).toBe('tls');
      expect(cols[4]?.accessor(r, NOW)).toBe('simple');
    });

    it('defaults to empty when absent', () => {
      const cols = getColumns('KafkaUser');
      expect(cols[3]?.accessor(raw(), NOW)).toBe('');
      expect(cols[4]?.accessor(raw(), NOW)).toBe('');
    });

    it('null authentication and authorization', () => {
      const cols = getColumns('KafkaUser');
      const r = raw({ spec: { authentication: null, authorization: null } });
      expect(cols[3]?.accessor(r, NOW)).toBe('');
      expect(cols[4]?.accessor(r, NOW)).toBe('');
    });

    it('authentication type is non-string falls back to empty', () => {
      const col = getColumns('KafkaUser')[3];
      const r = raw({ spec: { authentication: { type: 42 } } });
      expect(col?.accessor(r, NOW)).toBe('');
    });

    it('authorization type is non-string falls back to empty', () => {
      const col = getColumns('KafkaUser')[4];
      const r = raw({ spec: { authorization: { type: 42 } } });
      expect(col?.accessor(r, NOW)).toBe('');
    });
  });

  describe('KafkaConnect columns', () => {
    it('has 6 columns', () => {
      expect(getColumns('KafkaConnect')).toHaveLength(6);
    });

    it('Replicas and Bootstrap Servers accessors', () => {
      const cols = getColumns('KafkaConnect');
      const r = raw({ spec: { replicas: 2, bootstrapServers: 'kafka:9092' } });
      expect(cols[3]?.accessor(r, NOW)).toBe('2');
      expect(cols[4]?.accessor(r, NOW)).toBe('kafka:9092');
    });

    it('defaults when absent', () => {
      const cols = getColumns('KafkaConnect');
      expect(cols[3]?.accessor(raw(), NOW)).toBe('0');
      expect(cols[4]?.accessor(raw(), NOW)).toBe('');
    });
  });

  describe('KafkaBridge columns', () => {
    it('has 6 columns (same as KafkaConnect)', () => {
      expect(getColumns('KafkaBridge')).toHaveLength(6);
    });
  });

  describe('DopplerSecret columns', () => {
    it('has 7 columns', () => {
      expect(getColumns('DopplerSecret')).toHaveLength(7);
    });

    it('Project, Config, SecretName accessors', () => {
      const cols = getColumns('DopplerSecret');
      const r = raw({
        spec: {
          project: 'my-project',
          config: 'production',
          secretName: 'my-secret',
        },
      });
      expect(cols[3]?.accessor(r, NOW)).toBe('my-project');
      expect(cols[4]?.accessor(r, NOW)).toBe('production');
      expect(cols[5]?.accessor(r, NOW)).toBe('my-secret');
    });

    it('defaults when absent', () => {
      const cols = getColumns('DopplerSecret');
      expect(cols[3]?.accessor(raw(), NOW)).toBe('');
      expect(cols[4]?.accessor(raw(), NOW)).toBe('');
      expect(cols[5]?.accessor(raw(), NOW)).toBe('');
    });
  });

  describe('PrometheusRule columns', () => {
    it('has 5 columns (no status)', () => {
      expect(getColumns('PrometheusRule')).toHaveLength(5);
    });

    it('Groups accessor', () => {
      const col = getColumns('PrometheusRule')[2];
      const r = raw({ spec: { groups: [{}, {}] } });
      expect(col?.accessor(r, NOW)).toBe('2');
      expect(col?.accessor(raw(), NOW)).toBe('0');
    });

    it('Rules total count accessor', () => {
      const col = getColumns('PrometheusRule')[3];
      const r = raw({
        spec: {
          groups: [{ rules: [1, 2, 3] }, { rules: [4, 5] }],
        },
      });
      expect(col?.accessor(r, NOW)).toBe('5');
      expect(col?.accessor(raw(), NOW)).toBe('0');
    });

    it('Rules with group missing rules array', () => {
      const col = getColumns('PrometheusRule')[3];
      const r = raw({ spec: { groups: [{ rules: [1] }, {}] } });
      expect(col?.accessor(r, NOW)).toBe('1');
    });
  });

  describe('ServiceMonitor columns', () => {
    it('has 5 columns (no status)', () => {
      expect(getColumns('ServiceMonitor')).toHaveLength(5);
    });

    it('Endpoints accessor', () => {
      const col = getColumns('ServiceMonitor')[2];
      const r = raw({ spec: { endpoints: [{}, {}] } });
      expect(col?.accessor(r, NOW)).toBe('2');
      expect(col?.accessor(raw(), NOW)).toBe('0');
    });

    it('Selector accessor', () => {
      const col = getColumns('ServiceMonitor')[3];
      const r = raw({
        spec: { selector: { matchLabels: { app: 'web' } } },
      });
      expect(col?.accessor(r, NOW)).toBe('{"app":"web"}');
    });

    it('Selector accessor — no selector', () => {
      const col = getColumns('ServiceMonitor')[3];
      expect(col?.accessor(raw(), NOW)).toBe('');
    });

    it('Selector accessor — selector with no matchLabels', () => {
      const col = getColumns('ServiceMonitor')[3];
      const r = raw({ spec: { selector: {} } });
      expect(col?.accessor(r, NOW)).toBe('');
    });

    it('Selector accessor — null matchLabels', () => {
      const col = getColumns('ServiceMonitor')[3];
      const r = raw({ spec: { selector: { matchLabels: null } } });
      expect(col?.accessor(r, NOW)).toBe('');
    });
  });

  describe('PodMonitor columns', () => {
    it('has 5 columns (no status)', () => {
      expect(getColumns('PodMonitor')).toHaveLength(5);
    });

    it('Endpoints accessor uses podMetricsEndpoints', () => {
      const col = getColumns('PodMonitor')[2];
      const r = raw({ spec: { podMetricsEndpoints: [{}, {}, {}] } });
      expect(col?.accessor(r, NOW)).toBe('3');
      expect(col?.accessor(raw(), NOW)).toBe('0');
    });

    it('Selector accessor', () => {
      const col = getColumns('PodMonitor')[3];
      const r = raw({
        spec: { selector: { matchLabels: { app: 'myapp' } } },
      });
      expect(col?.accessor(r, NOW)).toBe('{"app":"myapp"}');
    });

    it('Selector accessor — no selector', () => {
      const col = getColumns('PodMonitor')[3];
      expect(col?.accessor(raw(), NOW)).toBe('');
    });

    it('Selector accessor — selector with no matchLabels', () => {
      const col = getColumns('PodMonitor')[3];
      const r = raw({ spec: { selector: {} } });
      expect(col?.accessor(r, NOW)).toBe('');
    });

    it('Selector accessor — null matchLabels', () => {
      const col = getColumns('PodMonitor')[3];
      const r = raw({ spec: { selector: { matchLabels: null } } });
      expect(col?.accessor(r, NOW)).toBe('');
    });

    it('Selector accessor — null selector', () => {
      const col = getColumns('PodMonitor')[3];
      const r = raw({ spec: { selector: null } });
      expect(col?.accessor(r, NOW)).toBe('');
    });
  });

  describe('Alertmanager columns', () => {
    it('has 6 columns', () => {
      expect(getColumns('Alertmanager')).toHaveLength(6);
    });

    it('Replicas and Version accessors', () => {
      const cols = getColumns('Alertmanager');
      const r = raw({ spec: { replicas: 3, version: 'v0.26.0' } });
      expect(cols[3]?.accessor(r, NOW)).toBe('3');
      expect(cols[4]?.accessor(r, NOW)).toBe('v0.26.0');
    });

    it('Replicas defaults to 0 when absent', () => {
      const col = getColumns('Alertmanager')[3];
      expect(col?.accessor(raw(), NOW)).toBe('0');
    });

    it('Version defaults to empty when absent', () => {
      const col = getColumns('Alertmanager')[4];
      expect(col?.accessor(raw(), NOW)).toBe('');
    });
  });

  describe('ReplicaSet columns', () => {
    it('has same columns as Deployment', () => {
      expect(getColumns('ReplicaSet')).toBe(getColumns('Deployment'));
    });
  });

  // ---------------------------------------------------------------------------
  // Sweep: every accessor for every registered kind must be callable.
  // This ensures 100% function coverage for all column accessor functions.
  // ---------------------------------------------------------------------------
  describe('accessor sweep — every accessor for every kind returns a string', () => {
    const kinds = [
      'Deployment',
      'StatefulSet',
      'DaemonSet',
      'ReplicaSet',
      'Pod',
      'Job',
      'CronJob',
      'Service',
      'Ingress',
      'NetworkPolicy',
      'ConfigMap',
      'Secret',
      'HorizontalPodAutoscaler',
      'PersistentVolumeClaim',
      'PersistentVolume',
      'StorageClass',
      'Node',
      'Namespace',
      'Kafka',
      'KafkaTopic',
      'KafkaUser',
      'KafkaConnect',
      'KafkaBridge',
      'DopplerSecret',
      'PrometheusRule',
      'ServiceMonitor',
      'PodMonitor',
      'Alertmanager',
      'UnknownKind',
    ];

    // A full-featured raw object to maximize branch coverage in a single sweep.
    const fullRaw: KubernetesObject = {
      apiVersion: 'v1',
      kind: 'Test',
      metadata: {
        name: 'sweep-obj',
        namespace: 'default',
        creationTimestamp: CREATED,
        labels: { 'node-role.kubernetes.io/worker': '' },
        annotations: { 'storageclass.kubernetes.io/is-default-class': 'true' },
      },
      spec: {
        replicas: 3,
        schedule: '*/5 * * * *',
        suspend: false,
        type: 'ClusterIP',
        clusterIP: '10.0.0.1',
        ports: [{ port: 80, protocol: 'TCP' }],
        ingressClassName: 'nginx',
        rules: [{ host: 'x.com' }],
        minReplicas: 1,
        maxReplicas: 5,
        scaleTargetRef: { name: 'my-deploy' },
        volumeName: 'pv-001',
        storageClassName: 'fast',
        nodeName: 'node-1',
        capacity: { storage: '10Gi' },
        accessModes: ['ReadWriteOnce'],
        persistentVolumeReclaimPolicy: 'Delete',
        claimRef: { namespace: 'default', name: 'my-pvc' },
        kafka: { version: '3.5.0', replicas: 3 },
        zookeeper: { replicas: 3 },
        partitions: 12,
        authentication: { type: 'tls' },
        authorization: { type: 'simple' },
        bootstrapServers: 'kafka:9092',
        project: 'my-project',
        config: 'production',
        secretName: 'sec',
        groups: [{ rules: [{ alert: 'A' }] }],
        endpoints: [{}],
        podMetricsEndpoints: [{}],
        selector: { matchLabels: { app: 'x' } },
        version: 'v0.26.0',
        completions: 3,
        podSelector: { matchLabels: { app: 'x' } },
      },
      spec2: undefined,
      status: {
        replicas: 3,
        readyReplicas: 3,
        availableReplicas: 3,
        updatedReplicas: 3,
        desiredNumberScheduled: 3,
        numberReady: 3,
        updatedNumberScheduled: 3,
        phase: 'Running',
        containerStatuses: [{ ready: true, restartCount: 0 }],
        active: 0,
        lastScheduleTime: '2024-01-01T00:00:00Z',
        loadBalancer: { ingress: [{ ip: '1.2.3.4' }] },
        currentReplicas: 3,
        capacity: { storage: '10Gi' },
        nodeInfo: { kubeletVersion: 'v1.28.0' },
        conditions: [{ type: 'Ready', status: 'True' }],
        succeeded: 2,
        startTime: '2024-01-01T00:00:00Z',
        completionTime: '2024-01-01T00:01:00Z',
        currentMetrics: [],
      },
      provisioner: 'kubernetes.io/gce-pd',
      reclaimPolicy: 'Delete',
      type: 'kubernetes.io/tls',
      data: { key1: 'val1', key2: 'val2' },
    };

    it.each(kinds)('all %s accessors return strings', (kind) => {
      const cols = getColumns(kind);
      for (const col of cols) {
        const result = col.accessor(fullRaw, NOW);
        expect(typeof result).toBe('string');
      }
    });
  });
});

describe('getCrColumns', () => {
  it('returns Name/Namespace/Age when there are no printer columns and the kind is namespaced', () => {
    const cols = getCrColumns(true, []);
    expect(cols.map((c) => c.header)).toEqual(['Name', 'Namespace', 'Age']);
  });

  it('omits Namespace for a cluster-scoped kind', () => {
    const cols = getCrColumns(false, []);
    expect(cols.map((c) => c.header)).toEqual(['Name', 'Age']);
  });

  it('inserts printer columns between Namespace and Age, in the given order', () => {
    const cols = getCrColumns(true, [
      { name: 'Project', jsonPath: '.spec.project', priority: 0 },
      { name: 'Config', jsonPath: '.spec.config', priority: 1 },
    ]);
    expect(cols.map((c) => c.header)).toEqual([
      'Name',
      'Namespace',
      'Project',
      'Config',
      'Age',
    ]);
  });

  it('renders a printer column value via its JSONPath', () => {
    const cols = getCrColumns(true, [
      { name: 'Project', jsonPath: '.spec.project', priority: 0 },
    ]);
    const projectCol = cols.find((c) => c.header === 'Project');
    const r = raw({ spec: { project: 'prod' } });
    expect(projectCol?.accessor(r, NOW)).toBe('prod');
  });

  it('renders "—" when the JSONPath fails to resolve', () => {
    const cols = getCrColumns(true, [
      { name: 'Missing', jsonPath: '.spec.nope', priority: 0 },
    ]);
    const col = cols.find((c) => c.header === 'Missing');
    const r = raw({ spec: {} });
    expect(col?.accessor(r, NOW)).toBe('—');
  });
});
