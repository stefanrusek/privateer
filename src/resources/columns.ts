/**
 * Column schema registry (Spec 03 §3).
 *
 * Each entry maps a resource kind to an ordered list of column definitions.
 * Status is always first (width 2), Name second, Age last/right-aligned.
 * All accessors are pure functions over the raw KubernetesObject.
 */

import type { KubernetesObject } from '../core/types.js';
import type { CrdPrinterColumn } from '../boundaries/kube-client.js';
import { formatAge } from './age.js';
import { formatCpuQuantity, formatMemoryQuantity } from './quantity.js';
import { evalPrinterColumnPath } from './jsonpath.js';

export type ColumnAlign = 'left' | 'right' | 'center';

export interface ColumnDef {
  header: string;
  /** Fixed character width, or a percentage string like "30%" */
  width: number | string;
  align?: ColumnAlign;
  accessor: (raw: KubernetesObject, nowMs: number) => string;
}

// ---------------------------------------------------------------------------
// Shared accessors
// ---------------------------------------------------------------------------

function metaName(raw: KubernetesObject): string {
  return raw.metadata?.name ?? '';
}

function metaNamespace(raw: KubernetesObject): string {
  return raw.metadata?.namespace ?? '';
}

function ageCol(raw: KubernetesObject, nowMs: number): string {
  const ts = raw.metadata?.creationTimestamp ?? '';
  return formatAge(ts, nowMs);
}

function statusPlaceholder(_raw: KubernetesObject, _nowMs: number): string {
  // Status color is rendered by the TUI from resolveStatus; the column
  // accessor returns an empty string as the visible text (icon only).
  return '';
}

const STATUS_COL: ColumnDef = {
  header: '',
  width: 2,
  accessor: statusPlaceholder,
};

const NAME_COL: ColumnDef = {
  header: 'Name',
  width: '30%',
  accessor: (raw) => metaName(raw),
};

const NAMESPACE_COL: ColumnDef = {
  header: 'Namespace',
  width: '15%',
  accessor: (raw) => metaNamespace(raw),
};

const AGE_COL: ColumnDef = {
  header: 'Age',
  width: 10,
  align: 'right',
  accessor: ageCol,
};

// ---------------------------------------------------------------------------
// Workloads
// ---------------------------------------------------------------------------

const DEPLOYMENT_COLS: ColumnDef[] = [
  STATUS_COL,
  NAME_COL,
  NAMESPACE_COL,
  {
    header: 'Ready',
    width: 8,
    accessor: (raw) => {
      const ready = raw.status?.readyReplicas;
      const total = raw.status?.replicas;
      return `${String(typeof ready === 'number' ? ready : 0)}/${String(typeof total === 'number' ? total : 0)}`;
    },
  },
  {
    header: 'Up-to-date',
    width: 10,
    accessor: (raw) => {
      const v = raw.status?.updatedReplicas;
      return typeof v === 'number' ? String(v) : '0';
    },
  },
  {
    header: 'Available',
    width: 10,
    accessor: (raw) => {
      const v = raw.status?.availableReplicas;
      return typeof v === 'number' ? String(v) : '0';
    },
  },
  AGE_COL,
];

const STATEFULSET_COLS: ColumnDef[] = [
  STATUS_COL,
  NAME_COL,
  NAMESPACE_COL,
  {
    header: 'Ready',
    width: 8,
    accessor: (raw) => {
      const ready = raw.status?.readyReplicas;
      const total = raw.status?.replicas;
      return `${String(typeof ready === 'number' ? ready : 0)}/${String(typeof total === 'number' ? total : 0)}`;
    },
  },
  AGE_COL,
];

const DAEMONSET_COLS: ColumnDef[] = [
  STATUS_COL,
  NAME_COL,
  NAMESPACE_COL,
  {
    header: 'Desired',
    width: 8,
    accessor: (raw) => {
      const v = raw.status?.desiredNumberScheduled;
      return typeof v === 'number' ? String(v) : '0';
    },
  },
  {
    header: 'Ready',
    width: 8,
    accessor: (raw) => {
      const v = raw.status?.numberReady;
      return typeof v === 'number' ? String(v) : '0';
    },
  },
  {
    header: 'Up-to-date',
    width: 10,
    accessor: (raw) => {
      const v = raw.status?.updatedNumberScheduled;
      return typeof v === 'number' ? String(v) : '0';
    },
  },
  AGE_COL,
];

const POD_COLS: ColumnDef[] = [
  STATUS_COL,
  NAME_COL,
  NAMESPACE_COL,
  {
    header: 'Ready',
    width: 8,
    accessor: (raw) => {
      const statuses = raw.status?.containerStatuses;
      if (!Array.isArray(statuses)) {
        return '0/0';
      }
      const arr = statuses as { ready?: boolean }[];
      const ready = arr.filter((c) => c.ready === true).length;
      return `${String(ready)}/${String(arr.length)}`;
    },
  },
  {
    header: 'Phase',
    width: 12,
    accessor: (raw) => {
      const v = raw.status?.phase;
      return typeof v === 'string' ? v : '';
    },
  },
  {
    header: 'Restarts',
    width: 8,
    accessor: (raw) => {
      const statuses = raw.status?.containerStatuses;
      if (!Array.isArray(statuses)) {
        return '0';
      }
      const arr = statuses as { restartCount?: number }[];
      const total = arr.reduce((s, c) => s + (c.restartCount ?? 0), 0);
      return String(total);
    },
  },
  {
    header: 'Node',
    width: '15%',
    accessor: (raw) => {
      const v = raw.spec?.nodeName;
      return typeof v === 'string' ? v : '';
    },
  },
  AGE_COL,
];

const JOB_COLS: ColumnDef[] = [
  STATUS_COL,
  NAME_COL,
  NAMESPACE_COL,
  {
    header: 'Completions',
    width: 12,
    accessor: (raw) => {
      const succeeded = raw.status?.succeeded;
      const completions = raw.spec?.completions;
      return `${String(typeof succeeded === 'number' ? succeeded : 0)}/${String(typeof completions === 'number' ? completions : 0)}`;
    },
  },
  {
    header: 'Duration',
    width: 10,
    accessor: (raw) => {
      const start = raw.status?.startTime;
      const end = raw.status?.completionTime;
      if (typeof start !== 'string' || typeof end !== 'string') {
        return '';
      }
      const diffMs = new Date(end).getTime() - new Date(start).getTime();
      const secs = Math.floor(diffMs / 1000);
      return `${String(secs)}s`;
    },
  },
  AGE_COL,
];

const CRONJOB_COLS: ColumnDef[] = [
  STATUS_COL,
  NAME_COL,
  NAMESPACE_COL,
  {
    header: 'Schedule',
    width: 15,
    accessor: (raw) => {
      const v = raw.spec?.schedule;
      return typeof v === 'string' ? v : '';
    },
  },
  {
    header: 'Suspend',
    width: 8,
    accessor: (raw) => {
      const v = raw.spec?.suspend;
      return v === true ? 'true' : 'false';
    },
  },
  {
    header: 'Last Schedule',
    width: 15,
    accessor: (raw) => {
      const v = raw.status?.lastScheduleTime;
      return typeof v === 'string' ? v : '';
    },
  },
  AGE_COL,
];

// ---------------------------------------------------------------------------
// Networking
// ---------------------------------------------------------------------------

const SERVICE_COLS: ColumnDef[] = [
  STATUS_COL,
  NAME_COL,
  NAMESPACE_COL,
  {
    header: 'Type',
    width: 12,
    accessor: (raw) => {
      const v = raw.spec?.type;
      return typeof v === 'string' ? v : '';
    },
  },
  {
    header: 'Cluster IP',
    width: 15,
    accessor: (raw) => {
      const v = raw.spec?.clusterIP;
      return typeof v === 'string' ? v : '';
    },
  },
  {
    header: 'External IP',
    width: 15,
    accessor: (raw) => {
      const lb = raw.status?.loadBalancer;
      if (lb === null || typeof lb !== 'object') {
        return '';
      }
      const ingress = (lb as Record<string, unknown>).ingress;
      if (!Array.isArray(ingress) || ingress.length === 0) {
        return '';
      }
      const first = ingress[0] as Record<string, unknown> | undefined;
      if (first === undefined) {
        return '';
      }
      const ip = first.ip;
      return typeof ip === 'string' ? ip : '';
    },
  },
  {
    header: 'Ports',
    width: '15%',
    accessor: (raw) => {
      const ports = raw.spec?.ports;
      if (!Array.isArray(ports)) {
        return '';
      }
      const arr = ports as { port?: number; protocol?: string }[];
      return arr
        .map(
          (p) =>
            `${p.port !== undefined ? String(p.port) : ''}/${p.protocol ?? 'TCP'}`,
        )
        .join(', ');
    },
  },
  AGE_COL,
];

const INGRESS_COLS: ColumnDef[] = [
  STATUS_COL,
  NAME_COL,
  NAMESPACE_COL,
  {
    header: 'Class',
    width: 12,
    accessor: (raw) => {
      const v = raw.spec?.ingressClassName;
      return typeof v === 'string' ? v : '';
    },
  },
  {
    header: 'Hosts',
    width: '25%',
    accessor: (raw) => {
      const rules = raw.spec?.rules;
      if (!Array.isArray(rules)) {
        return '';
      }
      const arr = rules as { host?: string }[];
      return arr
        .map((r) => r.host ?? '')
        .filter((h) => h.length > 0)
        .join(', ');
    },
  },
  {
    header: 'Address',
    width: 15,
    accessor: (raw) => {
      const lb = raw.status?.loadBalancer;
      if (lb === null || typeof lb !== 'object') {
        return '';
      }
      const ingress = (lb as Record<string, unknown>).ingress;
      if (!Array.isArray(ingress) || ingress.length === 0) {
        return '';
      }
      const first = ingress[0] as Record<string, unknown> | undefined;
      if (first === undefined) {
        return '';
      }
      const ip = first.ip;
      const hostname = first.hostname;
      return typeof ip === 'string'
        ? ip
        : typeof hostname === 'string'
          ? hostname
          : '';
    },
  },
  AGE_COL,
];

const NETWORKPOLICY_COLS: ColumnDef[] = [
  { header: 'Name', width: '35%', accessor: (raw) => metaName(raw) },
  { header: 'Namespace', width: '20%', accessor: (raw) => metaNamespace(raw) },
  {
    header: 'Pod Selector',
    width: '25%',
    accessor: (raw) => {
      const sel = raw.spec?.podSelector;
      if (sel === null || sel === undefined || typeof sel !== 'object') {
        return '';
      }
      return JSON.stringify(sel);
    },
  },
  AGE_COL,
];

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const CONFIGMAP_COLS: ColumnDef[] = [
  { header: 'Name', width: '35%', accessor: (raw) => metaName(raw) },
  { header: 'Namespace', width: '20%', accessor: (raw) => metaNamespace(raw) },
  {
    header: 'Keys',
    width: 8,
    accessor: (raw) => {
      const data = raw.data;
      if (data === null || data === undefined || typeof data !== 'object') {
        return '0';
      }
      return String(Object.keys(data).length);
    },
  },
  AGE_COL,
];

const SECRET_COLS: ColumnDef[] = [
  { header: 'Name', width: '35%', accessor: (raw) => metaName(raw) },
  { header: 'Namespace', width: '20%', accessor: (raw) => metaNamespace(raw) },
  {
    header: 'Type',
    width: 20,
    accessor: (raw) => {
      const v = raw.type;
      return typeof v === 'string' ? v : '';
    },
  },
  {
    header: 'Keys',
    width: 8,
    accessor: (raw) => {
      const data = raw.data;
      if (data === null || data === undefined || typeof data !== 'object') {
        return '0';
      }
      return String(Object.keys(data).length);
    },
  },
  AGE_COL,
];

const HPA_COLS: ColumnDef[] = [
  STATUS_COL,
  { header: 'Name', width: '25%', accessor: (raw) => metaName(raw) },
  { header: 'Namespace', width: '15%', accessor: (raw) => metaNamespace(raw) },
  {
    header: 'Reference',
    width: '20%',
    accessor: (raw) => {
      const ref = raw.spec?.scaleTargetRef;
      if (ref === null || typeof ref !== 'object') {
        return '';
      }
      const name = (ref as Record<string, unknown>).name;
      return typeof name === 'string' ? name : '';
    },
  },
  {
    header: 'Min/Max',
    width: 10,
    accessor: (raw) => {
      const min = raw.spec?.minReplicas;
      const max = raw.spec?.maxReplicas;
      return `${typeof min === 'number' ? String(min) : ''}/${typeof max === 'number' ? String(max) : ''}`;
    },
  },
  {
    header: 'Replicas',
    width: 10,
    accessor: (raw) => {
      const v = raw.status?.currentReplicas;
      return typeof v === 'number' ? String(v) : '0';
    },
  },
  {
    header: 'CPU%',
    width: 12,
    accessor: (raw) => {
      const metrics = raw.status?.currentMetrics;
      if (!Array.isArray(metrics) || metrics.length === 0) {
        return '';
      }
      return '';
    },
  },
  AGE_COL,
];

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const PVC_COLS: ColumnDef[] = [
  STATUS_COL,
  NAME_COL,
  NAMESPACE_COL,
  {
    header: 'Phase',
    width: 10,
    accessor: (raw) => {
      const v = raw.status?.phase;
      return typeof v === 'string' ? v : '';
    },
  },
  {
    header: 'Volume',
    width: '20%',
    accessor: (raw) => {
      const v = raw.spec?.volumeName;
      return typeof v === 'string' ? v : '';
    },
  },
  {
    header: 'Capacity',
    width: 10,
    accessor: (raw) => {
      const capacity = raw.status?.capacity;
      if (capacity === null || typeof capacity !== 'object') {
        return '';
      }
      const storage = (capacity as Record<string, unknown>).storage;
      return typeof storage === 'string' ? storage : '';
    },
  },
  {
    header: 'Storage Class',
    width: '15%',
    accessor: (raw) => {
      const v = raw.spec?.storageClassName;
      return typeof v === 'string' ? v : '';
    },
  },
  AGE_COL,
];

const PV_COLS: ColumnDef[] = [
  STATUS_COL,
  { header: 'Name', width: '25%', accessor: (raw) => metaName(raw) },
  {
    header: 'Capacity',
    width: 10,
    accessor: (raw) => {
      const capacity = raw.spec?.capacity;
      if (capacity === null || typeof capacity !== 'object') {
        return '';
      }
      const storage = (capacity as Record<string, unknown>).storage;
      return typeof storage === 'string' ? storage : '';
    },
  },
  {
    header: 'Access Modes',
    width: 15,
    accessor: (raw) => {
      const modes = raw.spec?.accessModes;
      if (!Array.isArray(modes)) {
        return '';
      }
      return (modes as string[]).join(', ');
    },
  },
  {
    header: 'Reclaim Policy',
    width: 12,
    accessor: (raw) => {
      const v = raw.spec?.persistentVolumeReclaimPolicy;
      return typeof v === 'string' ? v : '';
    },
  },
  {
    header: 'Phase',
    width: 10,
    accessor: (raw) => {
      const v = raw.status?.phase;
      return typeof v === 'string' ? v : '';
    },
  },
  {
    header: 'Claim',
    width: '20%',
    accessor: (raw) => {
      const ref = raw.spec?.claimRef;
      if (ref === null || typeof ref !== 'object') {
        return '';
      }
      const r = ref as Record<string, unknown>;
      const ns = r.namespace;
      const name = r.name;
      if (typeof ns === 'string' && typeof name === 'string') {
        return `${ns}/${name}`;
      }
      return '';
    },
  },
  {
    header: 'Storage Class',
    width: '15%',
    accessor: (raw) => {
      const v = raw.spec?.storageClassName;
      return typeof v === 'string' ? v : '';
    },
  },
  AGE_COL,
];

const STORAGECLASS_COLS: ColumnDef[] = [
  { header: 'Name', width: '35%', accessor: (raw) => metaName(raw) },
  {
    header: 'Provisioner',
    width: '25%',
    accessor: (raw) => {
      const v = raw.provisioner;
      return typeof v === 'string' ? v : '';
    },
  },
  {
    header: 'Reclaim Policy',
    width: 15,
    accessor: (raw) => {
      const v = raw.reclaimPolicy;
      return typeof v === 'string' ? v : '';
    },
  },
  {
    header: 'Default',
    width: 8,
    accessor: (raw) => {
      const v =
        raw.metadata?.annotations?.[
          'storageclass.kubernetes.io/is-default-class'
        ];
      return v === 'true' ? 'true' : '';
    },
  },
  AGE_COL,
];

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

const NODE_COLS: ColumnDef[] = [
  STATUS_COL,
  { header: 'Name', width: '25%', accessor: (raw) => metaName(raw) },
  {
    header: 'Role',
    width: 12,
    accessor: (raw) => {
      const labels = raw.metadata?.labels ?? {};
      const roles = Object.keys(labels)
        .filter((k) => k.startsWith('node-role.kubernetes.io/'))
        .map((k) => k.replace('node-role.kubernetes.io/', ''));
      return roles.join(',');
    },
  },
  {
    header: 'Version',
    width: 12,
    accessor: (raw) => {
      const info = raw.status?.nodeInfo;
      if (info === null || typeof info !== 'object') {
        return '';
      }
      const v = (info as Record<string, unknown>).kubeletVersion;
      return typeof v === 'string' ? v : '';
    },
  },
  {
    header: 'CPU',
    width: 10,
    accessor: (raw) => {
      const capacity = raw.status?.capacity;
      if (capacity === null || typeof capacity !== 'object') {
        return '';
      }
      const cpu = (capacity as Record<string, unknown>).cpu;
      return typeof cpu === 'string' ? formatCpuQuantity(cpu) : '';
    },
  },
  {
    header: 'Memory',
    width: 10,
    accessor: (raw) => {
      const capacity = raw.status?.capacity;
      if (capacity === null || typeof capacity !== 'object') {
        return '';
      }
      const memory = (capacity as Record<string, unknown>).memory;
      return typeof memory === 'string' ? formatMemoryQuantity(memory) : '';
    },
  },
  AGE_COL,
];

// ---------------------------------------------------------------------------
// Namespaces
// ---------------------------------------------------------------------------

const NAMESPACE_COLS: ColumnDef[] = [
  STATUS_COL,
  { header: 'Name', width: '40%', accessor: (raw) => metaName(raw) },
  {
    header: 'Phase',
    width: 10,
    accessor: (raw) => {
      const v = raw.status?.phase;
      return typeof v === 'string' ? v : '';
    },
  },
  AGE_COL,
];

// ---------------------------------------------------------------------------
// Strimzi
// ---------------------------------------------------------------------------

const KAFKA_COLS: ColumnDef[] = [
  STATUS_COL,
  { header: 'Name', width: '25%', accessor: (raw) => metaName(raw) },
  { header: 'Namespace', width: '15%', accessor: (raw) => metaNamespace(raw) },
  {
    header: 'Version',
    width: 10,
    accessor: (raw) => {
      const kafka = raw.spec?.kafka;
      if (kafka === null || typeof kafka !== 'object') {
        return '';
      }
      const v = (kafka as Record<string, unknown>).version;
      return typeof v === 'string' ? v : '';
    },
  },
  {
    header: 'Brokers',
    width: 8,
    accessor: (raw) => {
      const kafka = raw.spec?.kafka;
      if (kafka === null || typeof kafka !== 'object') {
        return '0';
      }
      const v = (kafka as Record<string, unknown>).replicas;
      return typeof v === 'number' ? String(v) : '0';
    },
  },
  {
    header: 'Zookeeper',
    width: 10,
    accessor: (raw) => {
      const zk = raw.spec?.zookeeper;
      if (zk === null || typeof zk !== 'object') {
        return '0';
      }
      const v = (zk as Record<string, unknown>).replicas;
      return typeof v === 'number' ? String(v) : '0';
    },
  },
  AGE_COL,
];

const KAFKATOPIC_COLS: ColumnDef[] = [
  STATUS_COL,
  NAME_COL,
  NAMESPACE_COL,
  {
    header: 'Partitions',
    width: 10,
    accessor: (raw) => {
      const v = raw.spec?.partitions;
      return typeof v === 'number' ? String(v) : '0';
    },
  },
  {
    header: 'Replication',
    width: 12,
    accessor: (raw) => {
      const v = raw.spec?.replicas;
      return typeof v === 'number' ? String(v) : '0';
    },
  },
  AGE_COL,
];

const KAFKAUSER_COLS: ColumnDef[] = [
  STATUS_COL,
  NAME_COL,
  NAMESPACE_COL,
  {
    header: 'Authentication',
    width: 15,
    accessor: (raw) => {
      const auth = raw.spec?.authentication;
      if (auth === null || typeof auth !== 'object') {
        return '';
      }
      const v = (auth as Record<string, unknown>).type;
      return typeof v === 'string' ? v : '';
    },
  },
  {
    header: 'Authorization',
    width: 15,
    accessor: (raw) => {
      const authz = raw.spec?.authorization;
      if (authz === null || typeof authz !== 'object') {
        return '';
      }
      const v = (authz as Record<string, unknown>).type;
      return typeof v === 'string' ? v : '';
    },
  },
  AGE_COL,
];

const KAFKACONNECT_COLS: ColumnDef[] = [
  STATUS_COL,
  { header: 'Name', width: '25%', accessor: (raw) => metaName(raw) },
  { header: 'Namespace', width: '15%', accessor: (raw) => metaNamespace(raw) },
  {
    header: 'Replicas',
    width: 8,
    accessor: (raw) => {
      const v = raw.spec?.replicas;
      return typeof v === 'number' ? String(v) : '0';
    },
  },
  {
    header: 'Bootstrap Servers',
    width: '25%',
    accessor: (raw) => {
      const v = raw.spec?.bootstrapServers;
      return typeof v === 'string' ? v : '';
    },
  },
  AGE_COL,
];

const KAFKABRIDGE_COLS: ColumnDef[] = KAFKACONNECT_COLS;

// ---------------------------------------------------------------------------
// Doppler
// ---------------------------------------------------------------------------

const DOPPLERSECRET_COLS: ColumnDef[] = [
  STATUS_COL,
  NAME_COL,
  NAMESPACE_COL,
  {
    header: 'Project',
    width: '15%',
    accessor: (raw) => {
      const v = raw.spec?.project;
      return typeof v === 'string' ? v : '';
    },
  },
  {
    header: 'Config',
    width: '15%',
    accessor: (raw) => {
      const v = raw.spec?.config;
      return typeof v === 'string' ? v : '';
    },
  },
  {
    header: 'Secret Name',
    width: '15%',
    accessor: (raw) => {
      const v = raw.spec?.secretName;
      return typeof v === 'string' ? v : '';
    },
  },
  AGE_COL,
];

// ---------------------------------------------------------------------------
// Prometheus Operator
// ---------------------------------------------------------------------------

const PROMETHEUSRULE_COLS: ColumnDef[] = [
  { header: 'Name', width: '35%', accessor: (raw) => metaName(raw) },
  { header: 'Namespace', width: '20%', accessor: (raw) => metaNamespace(raw) },
  {
    header: 'Groups',
    width: 8,
    accessor: (raw) => {
      const groups = raw.spec?.groups;
      return Array.isArray(groups) ? String(groups.length) : '0';
    },
  },
  {
    header: 'Rules',
    width: 8,
    accessor: (raw) => {
      const groups = raw.spec?.groups;
      if (!Array.isArray(groups)) {
        return '0';
      }
      const total = (groups as { rules?: unknown[] }[]).reduce(
        (s, g) => s + (Array.isArray(g.rules) ? g.rules.length : 0),
        0,
      );
      return String(total);
    },
  },
  AGE_COL,
];

const SERVICEMONITOR_COLS: ColumnDef[] = [
  { header: 'Name', width: '35%', accessor: (raw) => metaName(raw) },
  { header: 'Namespace', width: '20%', accessor: (raw) => metaNamespace(raw) },
  {
    header: 'Endpoints',
    width: 10,
    accessor: (raw) => {
      const v = raw.spec?.endpoints;
      return Array.isArray(v) ? String(v.length) : '0';
    },
  },
  {
    header: 'Selector',
    width: '25%',
    accessor: (raw) => {
      const sel = raw.spec?.selector;
      if (sel === null || sel === undefined || typeof sel !== 'object') {
        return '';
      }
      const ml = (sel as Record<string, unknown>).matchLabels;
      if (ml === null || ml === undefined || typeof ml !== 'object') {
        return '';
      }
      return JSON.stringify(ml);
    },
  },
  AGE_COL,
];

const PODMONITOR_COLS: ColumnDef[] = [
  { header: 'Name', width: '35%', accessor: (raw) => metaName(raw) },
  { header: 'Namespace', width: '20%', accessor: (raw) => metaNamespace(raw) },
  {
    header: 'Endpoints',
    width: 10,
    accessor: (raw) => {
      const v = raw.spec?.podMetricsEndpoints;
      return Array.isArray(v) ? String(v.length) : '0';
    },
  },
  {
    header: 'Selector',
    width: '25%',
    accessor: (raw) => {
      const sel = raw.spec?.selector;
      if (sel === null || sel === undefined || typeof sel !== 'object') {
        return '';
      }
      const ml = (sel as Record<string, unknown>).matchLabels;
      if (ml === null || ml === undefined || typeof ml !== 'object') {
        return '';
      }
      return JSON.stringify(ml);
    },
  },
  AGE_COL,
];

const ALERTMANAGER_COLS: ColumnDef[] = [
  STATUS_COL,
  NAME_COL,
  NAMESPACE_COL,
  {
    header: 'Replicas',
    width: 8,
    accessor: (raw) => {
      const v = raw.spec?.replicas;
      return typeof v === 'number' ? String(v) : '0';
    },
  },
  {
    header: 'Version',
    width: 10,
    accessor: (raw) => {
      const v = raw.spec?.version;
      return typeof v === 'string' ? v : '';
    },
  },
  AGE_COL,
];

// ---------------------------------------------------------------------------
// Generic fallback (Spec 03 §5.1)
// ---------------------------------------------------------------------------

export const GENERIC_COLS: ColumnDef[] = [
  STATUS_COL,
  { header: 'Name', width: '30%', accessor: (raw) => metaName(raw) },
  { header: 'Namespace', width: '20%', accessor: (raw) => metaNamespace(raw) },
  AGE_COL,
];

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const columnRegistry: ReadonlyMap<string, ColumnDef[]> = new Map<
  string,
  ColumnDef[]
>([
  ['Deployment', DEPLOYMENT_COLS],
  ['StatefulSet', STATEFULSET_COLS],
  ['DaemonSet', DAEMONSET_COLS],
  ['ReplicaSet', DEPLOYMENT_COLS],
  ['Pod', POD_COLS],
  ['Job', JOB_COLS],
  ['CronJob', CRONJOB_COLS],
  ['Service', SERVICE_COLS],
  ['Ingress', INGRESS_COLS],
  ['NetworkPolicy', NETWORKPOLICY_COLS],
  ['ConfigMap', CONFIGMAP_COLS],
  ['Secret', SECRET_COLS],
  ['HorizontalPodAutoscaler', HPA_COLS],
  ['PersistentVolumeClaim', PVC_COLS],
  ['PersistentVolume', PV_COLS],
  ['StorageClass', STORAGECLASS_COLS],
  ['Node', NODE_COLS],
  ['Namespace', NAMESPACE_COLS],
  ['Kafka', KAFKA_COLS],
  ['KafkaTopic', KAFKATOPIC_COLS],
  ['KafkaUser', KAFKAUSER_COLS],
  ['KafkaConnect', KAFKACONNECT_COLS],
  ['KafkaBridge', KAFKABRIDGE_COLS],
  ['DopplerSecret', DOPPLERSECRET_COLS],
  ['PrometheusRule', PROMETHEUSRULE_COLS],
  ['ServiceMonitor', SERVICEMONITOR_COLS],
  ['PodMonitor', PODMONITOR_COLS],
  ['Alertmanager', ALERTMANAGER_COLS],
]);

export function getColumns(kind: string): ColumnDef[] {
  return columnRegistry.get(kind) ?? GENERIC_COLS;
}

// ---------------------------------------------------------------------------
// Custom resource instance lists (Spec 03 §7, ticket P9R-0018 story 2)
// ---------------------------------------------------------------------------

const PRINTER_COL_WIDTH = 15;

/**
 * Build columns for a CR instance list: Name, Namespace (when namespaced),
 * the CRD's `additionalPrinterColumns` (already priority-0-first, per
 * `crdFromObject`/`discoverCrds`) rendered via best-effort Kubernetes-
 * JSONPath — a failing path renders "—", never throws — and Age. Falls back
 * to Name/Namespace/Age when the CRD declares no printer columns.
 */
export function getCrColumns(
  namespaced: boolean,
  printerColumns: readonly CrdPrinterColumn[],
): ColumnDef[] {
  const cols: ColumnDef[] = [NAME_COL];
  if (namespaced) {
    cols.push(NAMESPACE_COL);
  }
  for (const col of printerColumns) {
    cols.push({
      header: col.name,
      width: PRINTER_COL_WIDTH,
      accessor: (raw) => evalPrinterColumnPath(col.jsonPath, raw) ?? '—',
    });
  }
  cols.push(AGE_COL);
  return cols;
}
