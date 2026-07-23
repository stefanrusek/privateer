/**
 * OverviewTab — read-only two-column key/value structured summary.
 * Spec 04 §5. Section definitions per resource type (Pod, Deployment, Node,
 * KafkaTopic, DopplerSecret, Generic fallback).
 *
 * Navigation-overhaul chunk 03: when the controller supplies a `viewportHeight`
 * (and `offset`/`width`), the body projects to `ViewLine[]` via `detail-view`
 * and scrolls through the shared `ScrollableLines` viewport — tall content is no
 * longer clipped. Without those props it falls back to the rich, full-height
 * render (used by the static component tests and any non-measured host).
 */

import React, { type ReactNode } from 'react';
import { Box, Text } from 'ink';
import type { ResourceObject } from '../../core/types.js';
import type { CrKindDescriptor } from '../../k8s/crd-grouping.js';
import {
  projectOverviewLines,
  buildOverviewSections,
  type OverviewSection,
} from '../detail-view.js';
import { ScrollableLines } from './ScrollableLines.js';

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
  /** Detail pane inner width — content clips here (chunk 02/03). */
  width?: number;
  /** Topmost visible row in the scroll viewport (chunk 03). */
  offset?: number;
  /** Viewport height; when set the body scrolls instead of rendering all rows. */
  viewportHeight?: number;
  /** CR kind's printer-column/scope descriptor (ticket P9R-0018 story 3),
   * present only when `resource` is a custom-resource instance. */
  crDescriptor?: CrKindDescriptor;
  /**
   * Instance count for a CustomResourceDefinition's own Overview (ticket
   * P9R-0018 story 4). `undefined` while the controller's on-demand count
   * fetch for this kind is still in flight — rendered as `…`. Ignored for
   * every other resource kind.
   */
  crdInstanceCount?: number;
  /**
   * The real, clickable "→ N instances" link for a CRD's own Overview
   * (measured `<Button>`, built by the live adapter — ticket P9R-0018 story
   * 4), rendered as a fixed row above the scrolled content so it stays a
   * real hit-target instead of scrolling out of reach (same pattern as the
   * Events tab's `[Warning]`/`[All]` toolbar). Only rendered when `resource`
   * is a CustomResourceDefinition; omitted for the plain component tests.
   */
  instancesLink?: ReactNode;
}

// ---------------------------------------------------------------------------
// Section building lives in the pure `detail-view` module (shared with the
// scroll-viewport projection); the component renders the same sections richly.
// ---------------------------------------------------------------------------

type Section = OverviewSection;

function buildSections(
  resource: ResourceObject,
  nowMs: number,
  crDescriptor?: CrKindDescriptor,
  crdInstanceCount?: number,
): Section[] {
  return buildOverviewSections(
    resource,
    nowMs,
    crDescriptor,
    crdInstanceCount,
  ).map((s) => ({
    title: s.title,
    rows: [...s.rows],
  }));
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
  width = 80,
  offset = 0,
  viewportHeight,
  crDescriptor,
  crdInstanceCount,
  instancesLink,
}: OverviewTabProps): React.ReactElement {
  const isCrd = resource.kind === 'CustomResourceDefinition';

  if (viewportHeight !== undefined) {
    return (
      <Box flexDirection="column">
        {isCrd && (
          <Box flexDirection="row">
            {instancesLink ?? (
              <Text color="cyan" underline>
                → view instances
              </Text>
            )}
          </Box>
        )}
        <ScrollableLines
          lines={projectOverviewLines(
            resource,
            nowMs,
            width,
            crDescriptor,
            crdInstanceCount,
          )}
          offset={offset}
          viewportHeight={viewportHeight}
          width={width}
        />
      </Box>
    );
  }

  const sections = buildSections(
    resource,
    nowMs,
    crDescriptor,
    crdInstanceCount,
  );

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
      {isCrd && (
        <Box flexDirection="row" marginTop={1}>
          {instancesLink ?? (
            <Text color="cyan" underline>
              → view instances
            </Text>
          )}
        </Box>
      )}
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
