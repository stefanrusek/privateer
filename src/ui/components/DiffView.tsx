/**
 * DiffView — the diff review shown before a YAML save (Spec 04 §7;
 * navigation-overhaul chunk 07). Removed lines in red, added in green, context
 * dimmed; this IS the "save with confirm" step — `[Apply]`/Enter applies.
 *
 * **Prop-driven (B07):** the cluster boundary has moved to the controller. This
 * component renders the diff and the action bar for a given {@link ApplyStatus}
 * and routes keys/clicks to callbacks; it never calls `kubeClient`. The apply /
 * conflict / error transitions are decided by the pure `yaml-apply` reducer the
 * owner (YamlTab) drives.
 */

import React from 'react';
import { Box, Text, useInput } from 'ink';
import { computeDiff } from '../../yaml/diff.js';
import type { DiffLine } from '../../yaml/diff.js';
import type { ApplyStatus } from '../yaml-apply.js';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface DiffViewProps {
  /** Original YAML (before editing). */
  originalYaml: string;
  /** Edited YAML (after editing). */
  modifiedYaml: string;
  /** A header label, e.g. `ConfigMap/default/my-cfg`. */
  title: string;
  /** The apply machine's current status (controller-owned). */
  status: ApplyStatus;
  /** `[Apply]` / Enter — start (or retry) the replace. */
  onApply: () => void;
  /** `[Cancel]` / Esc — leave the diff (keep edits, or discard on conflict). */
  onCancel: () => void;
  /** `[Reload & re-edit]` / r — fetch the fresh resource (conflict only). */
  onReloadAndRedit: () => void;
}

// ---------------------------------------------------------------------------
// DiffView component
// ---------------------------------------------------------------------------

export function DiffView({
  originalYaml,
  modifiedYaml,
  title,
  status,
  onApply,
  onCancel,
  onReloadAndRedit,
}: DiffViewProps): React.ReactElement {
  useInput((input, key) => {
    switch (status.kind) {
      case 'applying':
      case 'reloading':
        return; // ignore input while a request is in flight
      case 'conflict':
        if (input === 'r' || input === 'R') {
          onReloadAndRedit();
        } else if (key.escape) {
          onCancel();
        }
        return;
      case 'diff':
      case 'error':
        if (key.return) {
          onApply();
        } else if (key.escape) {
          onCancel();
        }
        return;
    }
  });

  const diffLines = computeDiff(originalYaml, modifiedYaml);

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="yellow">
      {/* Header */}
      <Box flexDirection="row" gap={1} paddingX={1}>
        <Text bold color="yellow">
          Review Changes
        </Text>
        <Text dimColor>—</Text>
        <Text dimColor>{title}</Text>
      </Box>

      {/* Diff lines */}
      <Box flexDirection="column" paddingX={1}>
        {renderDiffLines(diffLines)}
      </Box>

      {/* Status & action bar */}
      <Box flexDirection="column" paddingX={1}>
        {status.kind === 'error' && <Text color="red">✗ {status.message}</Text>}
        {status.kind === 'conflict' ? (
          <Box flexDirection="row" gap={2}>
            <Text color="red">✗ Conflict — resource was modified</Text>
            <Text color="cyan" underline>
              [Reload &amp; re-edit] (r)
            </Text>
            <Text color="yellow" underline>
              [Discard] (Esc)
            </Text>
          </Box>
        ) : (
          <Box flexDirection="row" gap={2}>
            <Text color="green" underline>
              {applyLabel(status)}
            </Text>
            <Text color="yellow" underline>
              [Cancel] (Esc)
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function applyLabel(status: ApplyStatus): string {
  switch (status.kind) {
    case 'applying':
      return '[Applying…]';
    case 'reloading':
      return '[Reloading…]';
    case 'diff':
    case 'error':
    case 'conflict':
      return '[Apply] (Enter)';
  }
}

function renderDiffLines(lines: DiffLine[]): React.ReactElement[] {
  return lines.map((line, i) => {
    if (line.kind === 'collapsed') {
      return (
        <Text key={i} dimColor>
          … {String(line.collapsedCount)} unchanged lines
        </Text>
      );
    }
    if (line.kind === 'added') {
      return (
        <Text key={i} color="green">
          + {line.text}
        </Text>
      );
    }
    if (line.kind === 'removed') {
      return (
        <Text key={i} color="red">
          - {line.text}
        </Text>
      );
    }
    return (
      <Text key={i} dimColor>
        {'  '}
        {line.text}
      </Text>
    );
  });
}
