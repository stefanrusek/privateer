/**
 * DiffView — modal overlay showing a unified diff before save.
 * Spec 04 §7: removed lines in red, added lines in green, context lines dimmed.
 * Apply sends the replace() call; Cancel returns to edit mode.
 * On 409 Conflict: shows [Reload & re-edit] [Discard] options (spec-review-01 N2).
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { KubernetesObject } from '../../core/types.js';
import type { KubeClient } from '../../boundaries/kube-client.js';
import { computeDiff } from '../../yaml/diff.js';
import type { DiffLine } from '../../yaml/diff.js';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface DiffViewProps {
  /** The original resource body (before editing). */
  original: KubernetesObject;
  /** The modified resource body (after editing). */
  modified: KubernetesObject;
  /** The edited YAML string (for re-edit merging on conflict). */
  editedYaml: string;
  kubeClient: KubeClient;
  onApplied: () => void;
  /** Called when the user cancels — returns to edit mode with changes preserved. */
  onCancel: () => void;
  /**
   * Called when the user chooses "Reload & re-edit" after a 409 conflict.
   * Receives the freshly fetched resource.
   */
  onReloadAndRedit: (freshResource: KubernetesObject) => void;
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

type ViewStatus =
  | { kind: 'ready' }
  | { kind: 'applying' }
  | { kind: 'conflict' }
  | { kind: 'error'; message: string };

// ---------------------------------------------------------------------------
// DiffView component
// ---------------------------------------------------------------------------

export function DiffView({
  original,
  modified,
  editedYaml: _editedYaml,
  kubeClient,
  onApplied,
  onCancel,
  onReloadAndRedit,
}: DiffViewProps): React.ReactElement {
  const [status, setStatus] = useState<ViewStatus>({ kind: 'ready' });

  // Keyboard handling: Enter to apply, Escape to cancel, r to reload-and-redit
  useInput((input, key) => {
    switch (status.kind) {
      case 'applying':
        return; // ignore input while applying
      case 'conflict':
        if (input === 'r' || input === 'R') {
          void handleReloadAndRedit();
        } else if (key.escape) {
          onCancel();
        }
        break;
      case 'ready':
      case 'error':
        if (key.return) {
          void handleApply();
        } else if (key.escape) {
          onCancel();
        }
        break;
    }
  });

  // Compute diff lines
  const originalYaml = toYaml(original);
  const modifiedYaml = toYaml(modified);
  const diffLines = computeDiff(originalYaml, modifiedYaml);

  async function handleApply(): Promise<void> {
    setStatus({ kind: 'applying' });
    const result = await kubeClient.replace(modified);
    if (result.ok) {
      onApplied();
    } else if (result.error.kind === 'conflict') {
      setStatus({ kind: 'conflict' });
    } else {
      setStatus({ kind: 'error', message: result.error.message });
    }
  }

  async function handleReloadAndRedit(): Promise<void> {
    const kind = original.kind ?? '';
    const name = original.metadata?.name ?? '';
    const namespace = original.metadata?.namespace ?? null;
    const result = await kubeClient.get(kind, name, namespace);
    if (result.ok) {
      onReloadAndRedit(result.value);
    } else {
      setStatus({ kind: 'error', message: result.error.message });
    }
  }

  // Render diff content
  const diffContent = renderDiffLines(diffLines);

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="yellow">
      {/* Header */}
      <Box flexDirection="row" gap={1} paddingX={1}>
        <Text bold color="yellow">
          Review Changes
        </Text>
        <Text dimColor>—</Text>
        <Text dimColor>
          {original.kind}/{original.metadata?.namespace ?? ''}/
          {original.metadata?.name ?? ''}
        </Text>
      </Box>

      {/* Diff lines */}
      <Box flexDirection="column" paddingX={1}>
        {diffContent}
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
              {status.kind === 'applying' ? '[Applying…]' : '[Apply] (Enter)'}
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

/** Convert a KubernetesObject to a YAML string for diffing. */
function toYaml(obj: KubernetesObject): string {
  return JSON.stringify(obj, null, 2);
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
