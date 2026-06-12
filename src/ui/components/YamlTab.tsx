/**
 * YamlTab — syntax-highlighted YAML view with edit mode.
 * Spec 04 §6: read mode (line numbers, highlighting, redaction for Secrets),
 * edit mode (ctrl+S → DiffView, Escape → discard confirm, inline validation errors).
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Key as InkKey } from 'ink';
import type { KubernetesObject } from '../../core/types.js';
import type { KubeClient } from '../../boundaries/kube-client.js';
import type { Clock } from '../../boundaries/clock.js';
import { tokenizeLine } from '../../yaml/highlight.js';
import type { Token } from '../../yaml/highlight.js';
import { redactSecret } from '../../yaml/redact.js';
import { createEditBuffer } from '../../yaml/edit-buffer.js';
import type { EditBufferHandle } from '../../yaml/edit-buffer.js';
import { validateYaml } from '../../yaml/validate.js';
import type { YamlValidationError } from '../../yaml/validate.js';
import { DiffView } from './DiffView.js';
import jsYaml from 'js-yaml';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface YamlTabProps {
  resource: KubernetesObject;
  kubeClient: KubeClient;
  clock: Clock;
  onSave?: () => void;
  /** Called on every internal mode transition with the new mode's kind. */
  onModeChange?: (mode: 'read' | 'edit' | 'discard-confirm' | 'diff') => void;
  /**
   * For testing only: override the initial mode.
   * When provided, starts the component in the given mode with a buffer
   * initialized from `resource` YAML but set to the given content.
   */
  _testInitialContent?: string;
}

// ---------------------------------------------------------------------------
// Mode
// ---------------------------------------------------------------------------

/**
 * Cursor position within the edit buffer.
 * `desired` is the column the user last set explicitly (by horizontal
 * movement or typing); vertical movement clamps to the line length but
 * restores `desired` when a long-enough line is reached again.
 */
interface CursorState {
  row: number;
  col: number;
  desired: number;
}

const CURSOR_ORIGIN: CursorState = { row: 0, col: 0, desired: 0 };

interface EditMode {
  kind: 'edit';
  buffer: EditBufferHandle;
  validationError: YamlValidationError | null;
  cursor: CursorState;
}

type TabMode =
  | { kind: 'read'; revealed: boolean }
  | EditMode
  | { kind: 'discard-confirm'; buffer: EditBufferHandle; cursor: CursorState }
  | { kind: 'diff'; buffer: EditBufferHandle; cursor: CursorState };

// ---------------------------------------------------------------------------
// YamlTab component
// ---------------------------------------------------------------------------

export function YamlTab({
  resource,
  kubeClient,
  clock: _clock,
  onSave,
  onModeChange,
  _testInitialContent,
}: YamlTabProps): React.ReactElement {
  const initialMode: TabMode = ((): TabMode => {
    if (_testInitialContent !== undefined) {
      const buf = createEditBuffer(resourceToYaml(resource));
      const dirtyBuf = buf.setContent(_testInitialContent);
      return {
        kind: 'edit',
        buffer: dirtyBuf,
        validationError: null,
        cursor: CURSOR_ORIGIN,
      };
    }
    return { kind: 'read', revealed: false };
  })();
  const [mode, setMode] = useState<TabMode>(initialMode);

  /** Apply a mode transition and notify the optional observer. */
  function transition(next: TabMode): void {
    setMode(next);
    onModeChange?.(next.kind);
  }

  // Keyboard handling
  useInput((input, key) => {
    if (mode.kind === 'read') {
      if (input === 'e') {
        enterEditMode();
      } else if (
        input === 'v' &&
        resource.kind === 'Secret' &&
        !mode.revealed
      ) {
        transition({ kind: 'read', revealed: true });
      }
    } else if (mode.kind === 'edit') {
      if (key.ctrl && input === 's') {
        handleCtrlS(mode);
      } else if (key.escape) {
        handleEscape(mode);
      } else {
        handleEditKey(mode, input, key);
      }
    } else if (mode.kind === 'discard-confirm') {
      if (input === 'y' || input === 'Y') {
        transition({ kind: 'read', revealed: false });
      } else if (input === 'n' || input === 'N' || key.escape) {
        transition({
          kind: 'edit',
          buffer: mode.buffer,
          validationError: null,
          cursor: mode.cursor,
        });
      }
    }
  });

  function enterEditMode(): void {
    const yaml = resourceToYaml(resource);
    const buffer = createEditBuffer(yaml);
    transition({
      kind: 'edit',
      buffer,
      validationError: null,
      cursor: CURSOR_ORIGIN,
    });
  }

  function handleCtrlS(current: EditMode): void {
    const error = validateYaml(current.buffer.content);
    if (error !== null) {
      transition({ ...current, validationError: error });
      return;
    }
    transition({
      kind: 'diff',
      buffer: current.buffer,
      cursor: current.cursor,
    });
  }

  function handleEscape(current: EditMode): void {
    if (current.buffer.isDirty) {
      transition({
        kind: 'discard-confirm',
        buffer: current.buffer,
        cursor: current.cursor,
      });
    } else {
      transition({ kind: 'read', revealed: false });
    }
  }

  /**
   * Cursor-based editing (Spec 04 §6.2). Intra-edit updates (cursor moves,
   * text changes) use setMode directly — the mode *kind* does not change, so
   * onModeChange is not notified.
   */
  function handleEditKey(current: EditMode, input: string, key: InkKey): void {
    const { buffer, cursor } = current;
    const line = buffer.lineAt(cursor.row);

    const update = (nextBuffer: EditBufferHandle, next: CursorState): void => {
      setMode({ ...current, buffer: nextBuffer, cursor: next });
    };

    if (key.leftArrow) {
      const col = Math.max(0, cursor.col - 1);
      update(buffer, { row: cursor.row, col, desired: col });
    } else if (key.rightArrow) {
      const col = Math.min(line.length, cursor.col + 1);
      update(buffer, { row: cursor.row, col, desired: col });
    } else if (key.upArrow) {
      const row = Math.max(0, cursor.row - 1);
      const col = Math.min(cursor.desired, buffer.lineAt(row).length);
      update(buffer, { row, col, desired: cursor.desired });
    } else if (key.downArrow) {
      const row = Math.min(buffer.lines.length - 1, cursor.row + 1);
      const col = Math.min(cursor.desired, buffer.lineAt(row).length);
      update(buffer, { row, col, desired: cursor.desired });
    } else if (key.return) {
      const next = buffer
        .setLine(cursor.row, line.slice(0, cursor.col))
        .insertLine(cursor.row + 1, line.slice(cursor.col));
      update(next, { row: cursor.row + 1, col: 0, desired: 0 });
    } else if (key.backspace) {
      if (cursor.col > 0) {
        const next = buffer.setLine(
          cursor.row,
          line.slice(0, cursor.col - 1) + line.slice(cursor.col),
        );
        const col = cursor.col - 1;
        update(next, { row: cursor.row, col, desired: col });
      } else if (cursor.row > 0) {
        const prev = buffer.lineAt(cursor.row - 1);
        const next = buffer
          .setLine(cursor.row - 1, prev + line)
          .deleteLine(cursor.row);
        update(next, {
          row: cursor.row - 1,
          col: prev.length,
          desired: prev.length,
        });
      }
    } else if (key.delete) {
      if (cursor.col < line.length) {
        const next = buffer.setLine(
          cursor.row,
          line.slice(0, cursor.col) + line.slice(cursor.col + 1),
        );
        update(next, cursor);
      } else if (cursor.row < buffer.lines.length - 1) {
        const next = buffer
          .setLine(cursor.row, line + buffer.lineAt(cursor.row + 1))
          .deleteLine(cursor.row + 1);
        update(next, cursor);
      }
    } else if (input.length > 0 && !key.ctrl && !key.meta && !key.tab) {
      // Printable input — may be multi-character when pasted.
      const next = buffer.setLine(
        cursor.row,
        line.slice(0, cursor.col) + input + line.slice(cursor.col),
      );
      const col = cursor.col + input.length;
      update(next, { row: cursor.row, col, desired: col });
    }
  }

  // ── Read mode ──────────────────────────────────────────────────────────────
  if (mode.kind === 'read') {
    const yaml = resourceToYaml(resource);
    const displayYaml = mode.revealed ? yaml : redactSecret(yaml);
    const lines = displayYaml.split('\n');
    const isSecret = resource.kind === 'Secret';

    return (
      <Box flexDirection="column">
        {/* Action bar */}
        <Box flexDirection="row" gap={2}>
          <Text color="cyan" underline>
            [Edit]
          </Text>
          {isSecret && !mode.revealed && (
            <Text color="yellow" underline>
              [reveal]
            </Text>
          )}
        </Box>

        {/* YAML lines with line numbers */}
        <Box flexDirection="column">
          {lines.map((line, i) => (
            <HighlightedLine key={i} lineNum={i + 1} line={line} />
          ))}
        </Box>
      </Box>
    );
  }

  // ── Edit mode ──────────────────────────────────────────────────────────────
  if (mode.kind === 'edit') {
    const lines = mode.buffer.lines;
    return (
      <Box flexDirection="column">
        {/* Edit mode header */}
        <Box flexDirection="row">
          <Text bold color="yellow">
            ╔══ EDITING — Ctrl+S to save, Escape to cancel
          </Text>
        </Box>

        {/* Inline validation error */}
        {mode.validationError !== null && (
          <Box flexDirection="row" gap={1}>
            <Text color="red">✗ YAML error</Text>
            {mode.validationError.line !== null && (
              <Text color="red">line {String(mode.validationError.line)}:</Text>
            )}
            <Text color="red">{mode.validationError.message}</Text>
          </Box>
        )}

        {/* Lines with gutter */}
        <Box flexDirection="column">
          {lines.map((line, i) => {
            const isModified = mode.buffer.modifiedLines.has(i);
            return (
              <Box key={i} flexDirection="row">
                {isModified ? <Text color="yellow">│</Text> : <Text> </Text>}
                {i === mode.cursor.row ? (
                  <CursorLine
                    lineNum={i + 1}
                    line={line}
                    col={mode.cursor.col}
                  />
                ) : (
                  <HighlightedLine lineNum={i + 1} line={line} />
                )}
              </Box>
            );
          })}
        </Box>
      </Box>
    );
  }

  // ── Discard confirm ────────────────────────────────────────────────────────
  if (mode.kind === 'discard-confirm') {
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={2}>
          <Text>Discard changes?</Text>
          <Text color="red" underline>
            [Yes]
          </Text>
          <Text color="green" underline>
            [No]
          </Text>
        </Box>
      </Box>
    );
  }

  // ── Diff mode ──────────────────────────────────────────────────────────────
  // Validation already passed in handleCtrlS so jsYaml.load is safe here.
  const editedYaml = mode.buffer.content;
  const modifiedResource = jsYaml.load(editedYaml) as KubernetesObject;

  return (
    <DiffView
      original={resource}
      modified={modifiedResource}
      editedYaml={editedYaml}
      kubeClient={kubeClient}
      onApplied={(): void => {
        transition({ kind: 'read', revealed: false });
        onSave?.();
      }}
      onCancel={(): void => {
        transition({
          kind: 'edit',
          buffer: mode.buffer,
          validationError: null,
          cursor: mode.cursor,
        });
      }}
      onReloadAndRedit={(fresh): void => {
        const freshYaml = resourceToYaml(fresh);
        const newBuffer = createEditBuffer(freshYaml);
        transition({
          kind: 'edit',
          buffer: newBuffer,
          validationError: null,
          cursor: CURSOR_ORIGIN,
        });
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// CursorLine
// ---------------------------------------------------------------------------

interface CursorLineProps {
  lineNum: number;
  line: string;
  col: number;
}

/**
 * The line the cursor is on, rendered without syntax highlighting so the
 * cursor cell can be shown with `inverse`. At end of line the cursor is an
 * inverse space (block-style).
 */
function CursorLine({
  lineNum,
  line,
  col,
}: CursorLineProps): React.ReactElement {
  const lineNumStr = String(lineNum).padStart(4, ' ');
  const before = line.slice(0, col);
  const at = line.slice(col, col + 1) || ' ';
  const after = line.slice(col + 1);
  return (
    <Box flexDirection="row">
      <Text dimColor>{lineNumStr} </Text>
      <Text>{before}</Text>
      <Text inverse>{at}</Text>
      <Text>{after}</Text>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// HighlightedLine
// ---------------------------------------------------------------------------

interface HighlightedLineProps {
  lineNum: number;
  line: string;
}

function HighlightedLine({
  lineNum,
  line,
}: HighlightedLineProps): React.ReactElement {
  const tokens = tokenizeLine(line);
  const lineNumStr = String(lineNum).padStart(4, ' ');
  return (
    <Box flexDirection="row">
      <Text dimColor>{lineNumStr} </Text>
      {tokens.map((token, i) => (
        <TokenSpan key={i} token={token} />
      ))}
    </Box>
  );
}

function TokenSpan({ token }: { token: Token }): React.ReactElement {
  switch (token.type) {
    case 'key':
      return <Text color="blue">{token.text}</Text>;
    case 'string':
      return <Text color="green">{token.text}</Text>;
    case 'number':
      return <Text color="yellow">{token.text}</Text>;
    case 'boolean':
      return <Text color="cyan">{token.text}</Text>;
    case 'null':
      return <Text dimColor>{token.text}</Text>;
    case 'punctuation':
      return <Text>{token.text}</Text>;
    case 'plain':
      return <Text>{token.text}</Text>;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a KubernetesObject to a YAML string. */
function resourceToYaml(resource: KubernetesObject): string {
  return jsYaml.dump(resource, { lineWidth: -1, indent: 2 });
}
