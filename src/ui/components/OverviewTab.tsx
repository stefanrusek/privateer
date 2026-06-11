/**
 * OverviewTab — read-only two-column key/value structured summary.
 * Spec 04 §5. Section definitions per resource type (Pod, Deployment, Node,
 * KafkaTopic, DopplerSecret, Generic fallback).
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { ResourceObject } from '../../core/types.js';
import { formatAge } from '../../resources/age.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OverviewTabProps {
  resource: ResourceObject;
  nowMs: number;
  /** When true, annotations are expanded inline (Spec 04 §5.3). Default: false. */
  annotationsExpanded?: boolean;
  /** Callback fired when the user activates the "→ View managed Secret" link. */
  onViewManagedSecret?: (secretName: string, secretNamespace: string) => void;
}

interface KvRow {
  key: string;
  value: string;
}

interface Section {
  title: string;
  rows: KvRow[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function str(v: unknown): string {
  if (v === null || v === undefined) {
    return '';
  }
  if (typeof v === 'string') {
    return v;
  }
  if (typeof v === 'number' || typeof v === 'boolean') {
    return String(v);
  }
  return JSON.stringify(v);
}

function labelsToString(labels: Record<string, string>): string {
  return Object.entries(labels)
    .map(([k, v]) => `${k}=${v}`)
    .join('  ');
}

/** Render a depth-1 status object as rows. */
function statusRows(status: Record<string, unknown>): KvRow[] {
  return Object.entries(status)
    .filter(([, v]) => typeof v !== 'object' || v === null)
    .map(([k, v]) => ({ key: k, value: str(v) }));
}

// ---------------------------------------------------------------------------
// Section builders per resource kind (Spec 04 §5.2)
// ---------------------------------------------------------------------------

function metadataSection(
  resource: ResourceObject,
  nowMs: number,
  extraRows: KvRow[] = [],
): Section {
  const rows: KvRow[] = [{ key: 'Name', value: resource.name }];
  if (resource.namespace !== null) {
    rows.push({ key: 'Namespace', value: resource.namespace });
  }
  rows.push({
    key: 'Created',
    value: `${formatAge(resource.creationTimestamp, nowMs)} ago (${resource.creationTimestamp})`,
  });
  rows.push(...extraRows);
  rows.push({ key: 'Labels', value: labelsToString(resource.labels) });
  rows.push({
    key: 'Annotations',
    value: String(Object.keys(resource.annotations).length) + ' annotations',
  });
  return { title: 'METADATA', rows };
}

function buildPodSections(resource: ResourceObject, nowMs: number): Section[] {
  const raw = resource.raw;
  const spec: Record<string, unknown> = raw.spec ?? {};
  const status: Record<string, unknown> = raw.status ?? {};
  const meta = resource.raw.metadata ?? {};

  const nodeRow: KvRow[] =
    typeof meta.name === 'string'
      ? [{ key: 'Node', value: str(spec.nodeName ?? '') }]
      : [];

  const metaSec = metadataSection(resource, nowMs, nodeRow);

  const podIP = str(status.podIP ?? '');
  const hostIP = str(status.hostIP ?? '');
  const qosClass = str(status.qosClass ?? '');
  const phase = str(status.phase ?? '');
  const containerStatuses = status.containerStatuses;
  const totalContainers = Array.isArray(containerStatuses)
    ? containerStatuses.length
    : 0;
  const readyContainers = Array.isArray(containerStatuses)
    ? containerStatuses.filter(
        (c) => (c as Record<string, unknown>).ready === true,
      ).length
    : 0;
  const restarts = Array.isArray(containerStatuses)
    ? containerStatuses.reduce((acc: number, c) => {
        const r = (c as Record<string, unknown>).restartCount;
        return acc + (typeof r === 'number' ? r : 0);
      }, 0)
    : 0;

  const statusSec: Section = {
    title: 'STATUS',
    rows: [
      { key: 'Phase', value: phase },
      {
        key: 'Ready',
        value: `${String(readyContainers)}/${String(totalContainers)}`,
      },
      { key: 'Restarts', value: String(restarts) },
      { key: 'Pod IP', value: podIP },
      { key: 'Host IP', value: hostIP },
      { key: 'QoS Class', value: qosClass },
    ].filter((r) => r.value !== ''),
  };

  // Containers section
  const containers = Array.isArray(spec.containers) ? spec.containers : [];
  const containerRows: KvRow[] = containers.map((c) => {
    const co = c as Record<string, unknown>;
    return {
      key: str(co.name ?? ''),
      value: str(co.image ?? ''),
    };
  });
  const containerSec: Section = { title: 'CONTAINERS', rows: containerRows };

  // Volumes section
  const volumes = Array.isArray(spec.volumes) ? spec.volumes : [];
  const volumeRows: KvRow[] = volumes.map((v) => {
    const vo = v as Record<string, unknown>;
    return { key: str(vo.name ?? ''), value: '' };
  });
  const volumeSec: Section = { title: 'VOLUMES', rows: volumeRows };

  return [metaSec, statusSec, containerSec, volumeSec].filter(
    (s) => s.rows.length > 0,
  );
}

function buildDeploymentSections(
  resource: ResourceObject,
  nowMs: number,
): Section[] {
  const raw = resource.raw;
  const spec: Record<string, unknown> = raw.spec ?? {};
  const status: Record<string, unknown> = raw.status ?? {};

  const metaSec = metadataSection(resource, nowMs);

  const replicas = str(status.replicas ?? '');
  const readyReplicas = str(status.readyReplicas ?? '');
  const updatedReplicas = str(status.updatedReplicas ?? '');
  const availableReplicas = str(status.availableReplicas ?? '');
  const strategy = (() => {
    const s = (spec.strategy ?? {}) as Record<string, unknown>;
    return str(s.type ?? '');
  })();

  const statusSec: Section = {
    title: 'STATUS',
    rows: [
      { key: 'Ready Replicas', value: `${readyReplicas}/${replicas}` },
      { key: 'Up-to-date', value: updatedReplicas },
      { key: 'Available', value: availableReplicas },
      { key: 'Strategy', value: strategy },
    ].filter((r) => r.value !== '' && r.value !== '/'),
  };

  const selector = (spec.selector ?? {}) as Record<string, unknown>;
  const matchLabels = (selector.matchLabels ?? {}) as Record<string, string>;
  const selectorSec: Section = {
    title: 'SELECTOR',
    rows: Object.entries(matchLabels).map(([k, v]) => ({ key: k, value: v })),
  };

  const template = (spec.template ?? {}) as Record<string, unknown>;
  const templateMeta = (template.metadata ?? {}) as Record<string, unknown>;
  const templateLabels = (templateMeta.labels ?? {}) as Record<string, string>;
  const templateSpec = (template.spec ?? {}) as Record<string, unknown>;
  const containers = Array.isArray(templateSpec.containers)
    ? templateSpec.containers
    : [];
  const containerRows: KvRow[] = containers.map((c) => {
    const co = c as Record<string, unknown>;
    return { key: str(co.name ?? ''), value: str(co.image ?? '') };
  });

  const templateSec: Section = {
    title: 'TEMPLATE',
    rows: [
      ...Object.entries(templateLabels).map(([k, v]) => ({ key: k, value: v })),
      ...containerRows,
    ],
  };

  return [metaSec, statusSec, selectorSec, templateSec].filter(
    (s) => s.rows.length > 0,
  );
}

function buildNodeSections(resource: ResourceObject, nowMs: number): Section[] {
  const raw = resource.raw;
  const status: Record<string, unknown> = raw.status ?? {};

  const nodeInfo = (status.nodeInfo ?? {}) as Record<string, unknown>;
  const addresses = Array.isArray(status.addresses) ? status.addresses : [];
  const conditions = Array.isArray(status.conditions) ? status.conditions : [];

  const metaSec: Section = {
    title: 'METADATA',
    rows: [
      { key: 'Name', value: resource.name },
      {
        key: 'Created',
        value: `${formatAge(resource.creationTimestamp, nowMs)} ago (${resource.creationTimestamp})`,
      },
      { key: 'Labels', value: labelsToString(resource.labels) },
      {
        key: 'Annotations',
        value:
          String(Object.keys(resource.annotations).length) + ' annotations',
      },
    ].filter((r) => r.value !== ''),
  };

  const readyCond = conditions.find(
    (c) => (c as Record<string, unknown>).type === 'Ready',
  ) as Record<string, unknown> | undefined;
  const condRows: KvRow[] = conditions.map((c) => {
    const co = c as Record<string, unknown>;
    return {
      key: str(co.type ?? ''),
      value: str(co.status ?? ''),
    };
  });
  const statusSec: Section = {
    title: 'STATUS',
    rows: [
      {
        key: 'Ready',
        value:
          readyCond !== undefined ? str(readyCond.status ?? '') : 'Unknown',
      },
      ...condRows,
    ],
  };

  const capacity = (status.capacity ?? {}) as Record<string, unknown>;
  const allocatable = (status.allocatable ?? {}) as Record<string, unknown>;
  const capacitySec: Section = {
    title: 'CAPACITY',
    rows: [
      {
        key: 'CPU',
        value: `${str(allocatable.cpu ?? '')} allocatable / ${str(capacity.cpu ?? '')} capacity`,
      },
      {
        key: 'Memory',
        value: `${str(allocatable.memory ?? '')} allocatable / ${str(capacity.memory ?? '')} capacity`,
      },
      {
        key: 'Pods',
        value: `${str(allocatable.pods ?? '')} allocatable / ${str(capacity.pods ?? '')} capacity`,
      },
    ].filter((r) => r.value !== ' allocatable /  capacity'),
  };

  const systemSec: Section = {
    title: 'SYSTEM',
    rows: [
      { key: 'OS', value: str(nodeInfo.osImage ?? '') },
      { key: 'Kernel', value: str(nodeInfo.kernelVersion ?? '') },
      {
        key: 'Container Runtime',
        value: str(nodeInfo.containerRuntimeVersion ?? ''),
      },
      { key: 'Kubelet Version', value: str(nodeInfo.kubeletVersion ?? '') },
    ].filter((r) => r.value !== ''),
  };

  const addrSec: Section = {
    title: 'ADDRESSES',
    rows: addresses.map((a) => {
      const ao = a as Record<string, unknown>;
      return { key: str(ao.type ?? ''), value: str(ao.address ?? '') };
    }),
  };

  return [metaSec, statusSec, capacitySec, systemSec, addrSec].filter(
    (s) => s.rows.length > 0,
  );
}

function buildKafkaTopicSections(
  resource: ResourceObject,
  nowMs: number,
): Section[] {
  const raw = resource.raw;
  const spec: Record<string, unknown> = raw.spec ?? {};
  const status: Record<string, unknown> = raw.status ?? {};

  const metaSec: Section = {
    title: 'METADATA',
    rows: [
      { key: 'Name', value: resource.name },
      {
        key: 'Namespace',
        value: resource.namespace ?? '',
      },
      {
        key: 'Created',
        value: `${formatAge(resource.creationTimestamp, nowMs)} ago (${resource.creationTimestamp})`,
      },
      { key: 'Labels', value: labelsToString(resource.labels) },
    ].filter((r) => r.value !== ''),
  };

  const specSec: Section = {
    title: 'SPEC',
    rows: [
      { key: 'Partitions', value: str(spec.partitions ?? '') },
      { key: 'Replication Factor', value: str(spec.replicas ?? '') },
      { key: 'Retention Bytes', value: str(spec.retentionBytes ?? '') },
      { key: 'Retention Ms', value: str(spec.retentionMs ?? '') },
      { key: 'Cleanup Policy', value: str(spec.cleanupPolicy ?? '') },
    ].filter((r) => r.value !== ''),
  };

  const conditions = Array.isArray(status.conditions) ? status.conditions : [];
  const readyCond = conditions.find(
    (c) => (c as Record<string, unknown>).type === 'Ready',
  ) as Record<string, unknown> | undefined;

  const statusSec: Section = {
    title: 'STATUS',
    rows: [
      {
        key: 'Ready',
        value:
          readyCond !== undefined ? str(readyCond.status ?? '') : 'Unknown',
      },
      {
        key: 'Observed Generation',
        value: str(status.observedGeneration ?? ''),
      },
    ].filter((r) => r.value !== ''),
  };

  return [metaSec, specSec, statusSec].filter((s) => s.rows.length > 0);
}

function buildDopplerSecretSections(
  resource: ResourceObject,
  nowMs: number,
): Section[] {
  const raw = resource.raw;
  const spec: Record<string, unknown> = raw.spec ?? {};
  const status: Record<string, unknown> = raw.status ?? {};

  const metaSec: Section = {
    title: 'METADATA',
    rows: [
      { key: 'Name', value: resource.name },
      { key: 'Namespace', value: resource.namespace ?? '' },
      {
        key: 'Created',
        value: `${formatAge(resource.creationTimestamp, nowMs)} ago (${resource.creationTimestamp})`,
      },
    ].filter((r) => r.value !== ''),
  };

  const specSec: Section = {
    title: 'SPEC',
    rows: [
      { key: 'Project', value: str(spec.project ?? '') },
      { key: 'Config', value: str(spec.config ?? '') },
      {
        key: 'Managed Secret Name',
        value: str(spec.secretName ?? ''),
      },
      {
        key: 'Secret Namespace',
        value: str(spec.secretNamespace ?? resource.namespace ?? ''),
      },
    ].filter((r) => r.value !== ''),
  };

  const conditions = Array.isArray(status.conditions) ? status.conditions : [];
  const readyCond = conditions.find(
    (c) =>
      (c as Record<string, unknown>).type ===
        'secrets.doppler.com/secretsGenerated' ||
      (c as Record<string, unknown>).type === 'ConditionReady',
  ) as Record<string, unknown> | undefined;

  const statusSec: Section = {
    title: 'STATUS',
    rows: [
      {
        key: 'Sync Condition',
        value:
          readyCond !== undefined ? str(readyCond.status ?? '') : 'Unknown',
      },
      { key: 'Last Synced', value: str(status.lastSyncTime ?? '') },
    ].filter((r) => r.value !== ''),
  };

  return [metaSec, specSec, statusSec].filter((s) => s.rows.length > 0);
}

function buildGenericSections(
  resource: ResourceObject,
  nowMs: number,
): Section[] {
  const raw = resource.raw;
  const status: Record<string, unknown> | undefined = raw.status;

  const metaSec = metadataSection(resource, nowMs);

  if (status === undefined || Object.keys(status).length === 0) {
    return [metaSec];
  }

  const statusSec: Section = {
    title: 'STATUS',
    rows: statusRows(status),
  };

  return [metaSec, statusSec].filter((s) => s.rows.length > 0);
}

function buildSections(resource: ResourceObject, nowMs: number): Section[] {
  switch (resource.kind) {
    case 'Pod':
      return buildPodSections(resource, nowMs);
    case 'Deployment':
      return buildDeploymentSections(resource, nowMs);
    case 'Node':
      return buildNodeSections(resource, nowMs);
    case 'KafkaTopic':
      return buildKafkaTopicSections(resource, nowMs);
    case 'DopplerSecret':
      return buildDopplerSecretSections(resource, nowMs);
    default:
      return buildGenericSections(resource, nowMs);
  }
}

// ---------------------------------------------------------------------------
// Key width for aligned rendering
// ---------------------------------------------------------------------------

const KEY_WIDTH = 22;

function padKey(k: string): string {
  if (k.length >= KEY_WIDTH) {
    return k.slice(0, KEY_WIDTH);
  }
  return k + ' '.repeat(KEY_WIDTH - k.length);
}

// ---------------------------------------------------------------------------
// AnnotationsRow — collapsible (Spec 04 §5.3)
// ---------------------------------------------------------------------------

interface AnnotationsRowProps {
  annotations: Record<string, string>;
  expanded: boolean;
}

function AnnotationsRow({
  annotations,
  expanded,
}: AnnotationsRowProps): React.ReactElement {
  const count = Object.keys(annotations).length;

  if (count === 0) {
    return (
      <Box flexDirection="row">
        <Text>{padKey('Annotations')}</Text>
        <Text>0 annotations</Text>
      </Box>
    );
  }

  if (!expanded) {
    return (
      <Box flexDirection="row">
        <Text>{padKey('Annotations')}</Text>
        <Text>{String(count)} annotations </Text>
        <Text color="cyan" underline>
          [show]
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        <Text>{padKey('Annotations')}</Text>
        <Text>{String(count)} annotations </Text>
        <Text color="cyan" underline>
          [hide]
        </Text>
      </Box>
      {Object.entries(annotations).map(([k, v]) => (
        <Box key={k} flexDirection="row">
          <Text>{padKey('')}</Text>
          <Text dimColor>{k}=</Text>
          <Text>{v}</Text>
        </Box>
      ))}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// SectionView
// ---------------------------------------------------------------------------

interface SectionViewProps {
  section: Section;
  annotations: Record<string, string>;
  annotationsExpanded: boolean;
}

function SectionView({
  section,
  annotations,
  annotationsExpanded,
}: SectionViewProps): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text bold>{section.title}</Text>
      {section.rows.map((row) => {
        if (row.key === 'Annotations') {
          return (
            <AnnotationsRow
              key="annotations"
              annotations={annotations}
              expanded={annotationsExpanded}
            />
          );
        }
        return (
          <Box key={row.key} flexDirection="row">
            <Text>{padKey(row.key)}</Text>
            <Text>{row.value}</Text>
          </Box>
        );
      })}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// OverviewTab component
// ---------------------------------------------------------------------------

export function OverviewTab({
  resource,
  nowMs,
  annotationsExpanded = false,
  onViewManagedSecret: _onViewManagedSecret,
}: OverviewTabProps): React.ReactElement {
  const sections = buildSections(resource, nowMs);

  // For DopplerSecret, extract managed secret info for the link
  const isDopplerSecret = resource.kind === 'DopplerSecret';
  const rawSpec: Record<string, unknown> | null = isDopplerSecret
    ? (resource.raw.spec ?? {})
    : null;
  const managedSecretName = isDopplerSecret
    ? typeof rawSpec?.secretName === 'string'
      ? rawSpec.secretName
      : null
    : null;

  return (
    <Box flexDirection="column">
      {sections.map((section, i) => (
        <Box key={section.title} flexDirection="column">
          {i > 0 && <Text dimColor> </Text>}
          <SectionView
            section={section}
            annotations={resource.annotations}
            annotationsExpanded={annotationsExpanded}
          />
        </Box>
      ))}
      {isDopplerSecret && managedSecretName !== null && (
        <Box flexDirection="row" marginTop={1}>
          <Text color="cyan" underline>
            → View managed Secret
          </Text>
        </Box>
      )}
    </Box>
  );
}
