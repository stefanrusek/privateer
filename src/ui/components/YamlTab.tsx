/**
 * YamlTab — syntax-highlighted YAML view with an in-pane editor and a pop-out
 * to `$EDITOR` (Spec 04 §6; navigation-overhaul chunk 07).
 *
 * Read mode renders highlighted, line-numbered YAML (redacted for Secrets, with
 * a `v` reveal). Edit mode is a real multi-line editor: cursor movement, text
 * mutation, and the cursor-following scroll all run through the pure
 * `yaml-edit` model. `Ctrl+S` validates then opens the prop-driven `DiffView`
 * (the "save with confirm" step); the apply / conflict / error transitions run
 * through the pure `yaml-apply` reducer, and the **cluster effects
 * (`replace`/`get`) are performed by the controller** via the `onReplace` /
 * `onReload` callbacks — `kubeClient` no longer lives in this component.
 * `Ctrl+E` pops out to `$EDITOR` via the controller's `onOpenInEditor`.
 *
 * **Dirty-boot test seam:** `_testInitialContent` boots straight into a *dirty*
 * edit buffer so the discard-confirm / cursor-restore branches (unreachable via
 * stdin under ink-testing-library) stay covered.
 */

import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Key as InkKey } from 'ink';
import { tokenizeLine } from '../../yaml/highlight.js';
import type { Token } from '../../yaml/highlight.js';
import { redactSecret } from '../../yaml/redact.js';
import { validateYaml } from '../../yaml/validate.js';
import type { YamlValidationError } from '../../yaml/validate.js';
import {
  editStateFromContent,
  contentOf,
  splitLines,
  moveLeft,
  moveRight,
  moveUp,
  moveDown,
  insertText,
  insertNewline,
  backspace,
  forwardDelete,
  followCursor,
  SCROLL_ORIGIN,
  type EditState,
  type EditScroll,
} from '../yaml-edit.js';
import { projectYamlReadLines } from '../detail-view.js';
import { ScrollableLines } from './ScrollableLines.js';
import {
  confirmDialogKeyAction,
  applyConfirmKeyAction,
  type ConfirmSelection,
} from './ConfirmDialog.js';
import { isLeakedMouseInput } from '../../input/mouse.js';
import {
  initialApplyStatus,
  pressApply,
  applyResolved,
  pressReload,
  reloadResolved,
  pressCancel,
  type ApplyStatus,
} from '../yaml-apply.js';
import { DiffView } from './DiffView.js';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/** The outcome of a controller-performed `replace` (Spec 04 §6.3). */
export type YamlReplaceResult =
  | { ok: true }
  | { ok: false; conflict: true }
  | { ok: false; conflict: false; message: string };

/** The outcome of a controller-performed reload `get`. */
export type YamlReloadResult =
  | { ok: true; yaml: string }
  | { ok: false; message: string };

export interface YamlTabProps {
  /** The resource YAML to show/edit (already serialized by the controller). */
  yaml: string;
  /** The resource kind (drives Secret redaction + the diff header). */
  kind: string;
  /** A header label for the diff, e.g. `ConfigMap/default/my-cfg`. */
  title: string;
  /** Apply the edited YAML to the cluster; resolves to the typed outcome. */
  onReplace: (newYaml: string) => Promise<YamlReplaceResult>;
  /** Re-fetch the resource fresh (for reload-&-re-edit after a 409). */
  onReload: () => Promise<YamlReloadResult>;
  /**
   * Pop out to `$EDITOR` on the given YAML; resolves to the edited text (or the
   * unchanged input if the external edit failed). The controller owns the
   * suspend + temp-file + spawn glue and re-asserts the mouse-teardown invariant.
   */
  onOpenInEditor: (yaml: string) => Promise<string>;
  onSave?: () => void;
  /** Called on every mode transition with the new mode's kind. */
  onModeChange?: (mode: 'read' | 'edit' | 'discard-confirm' | 'diff') => void;
  /**
   * Content to boot straight into edit mode with after a `$EDITOR` pop-out
   * (B2). The suspend round-trip unmounts and remounts this component, losing
   * its in-memory edit buffer; the controller stashes the (possibly externally
   * edited) YAML and hands it back here so the editor reopens on it — validated,
   * live, and in edit mode — rather than dropping to a frozen read view.
   */
  reentryContent?: string;
  /** Called once on mount after a {@link reentryContent} seed is consumed. */
  onReentryConsumed?: () => void;
  /**
   * Test-only: boot straight into a *dirty* edit buffer with this content.
   * (Preserves the coverage seam the discard-confirm / cursor-restore branches
   * depend on — stdin-driven dirtiness is unreliable under ink-testing-library.)
   */
  _testInitialContent?: string;
  /** Detail pane inner width — read-mode lines clip here (chunk 02/03/07). */
  width?: number;
  /** Topmost visible row in the read-mode scroll viewport (chunk 03). */
  offset?: number;
  /**
   * Read-mode viewport height; when set the read body scrolls via the chunk-03
   * viewport instead of rendering every line. (Edit mode follows the cursor on
   * its own — see {@link followCursor}.)
   */
  viewportHeight?: number;
  /**
   * Injected by the adapter to render the discard-confirm `[Yes]`/`[No]` as
   * measured, clickable Buttons (mirrors {@link ConfirmDialog}'s `renderButton`).
   * The default plain-`<Text>` renderer keeps the component testable under
   * ink-testing-library without the adapter's measure/register glue.
   */
  renderDiscardButton?: DiscardButtonRenderer;
}

/**
 * Renders one discard-confirm button. `which` is `confirm` for `[Yes]`
 * (discard) and `cancel` for `[No]` (keep editing).
 */
export type DiscardButtonRenderer = (args: {
  which: ConfirmSelection;
  label: string;
  selected: boolean;
  onClick: () => void;
}) => React.ReactNode;

/**
 * Pure decision for a keypress while the discard-confirm prompt is open.
 * Mirrors the delete confirm (Enter activates the highlighted choice, arrows /
 * Tab toggle, Esc cancels) and additionally honors the documented `y`/`n`
 * accelerators regardless of the current selection. Exported for unit testing.
 */
export type DiscardConfirmAction =
  | { kind: 'discard' }
  | { kind: 'keep' }
  | { kind: 'select'; selection: ConfirmSelection }
  | { kind: 'none' };

export function discardConfirmKeyAction(
  input: string,
  key: InkKey,
  selection: ConfirmSelection,
): DiscardConfirmAction {
  // Documented accelerators win outright (a `y`/`n` always decides).
  if (input === 'y' || input === 'Y') {
    return { kind: 'discard' };
  }
  if (input === 'n' || input === 'N') {
    return { kind: 'keep' };
  }
  const action = confirmDialogKeyAction(input, key);
  if (action.kind === 'cancel') {
    return { kind: 'keep' };
  }
  if (action.kind === 'confirm') {
    return selection === 'confirm' ? { kind: 'discard' } : { kind: 'keep' };
  }
  if (action.kind === 'toggle') {
    return {
      kind: 'select',
      selection: applyConfirmKeyAction(action, selection),
    };
  }
  return { kind: 'none' };
}

// ---------------------------------------------------------------------------
// Mode
// ---------------------------------------------------------------------------

interface EditModeState {
  kind: 'edit';
  edit: EditState;
  /** The original YAML this edit session started from (for dirty + diff). */
  baseYaml: string;
  validationError: YamlValidationError | null;
}

type TabMode =
  | { kind: 'read'; revealed: boolean }
  | EditModeState
  | {
      kind: 'discard-confirm';
      edit: EditState;
      baseYaml: string;
      selection: ConfirmSelection;
    }
  | { kind: 'diff'; edit: EditState; baseYaml: string; status: ApplyStatus };

// ---------------------------------------------------------------------------
// YamlTab component
// ---------------------------------------------------------------------------

export function YamlTab({
  yaml,
  kind,
  title,
  onReplace,
  onReload,
  onOpenInEditor,
  onSave,
  onModeChange,
  reentryContent,
  onReentryConsumed,
  _testInitialContent,
  width = 80,
  offset = 0,
  viewportHeight,
  renderDiscardButton = defaultRenderDiscardButton,
}: YamlTabProps): React.ReactElement {
  // A `$EDITOR` reentry (B2) reopens the editor on the externally-edited content,
  // validated like a normal Ctrl+E return; a test seed boots a dirty buffer; the
  // default is read mode.
  const reentryMode: TabMode | null =
    reentryContent !== undefined
      ? {
          kind: 'edit',
          edit: editStateFromContent(reentryContent),
          baseYaml: yaml,
          validationError: validateYaml(reentryContent),
        }
      : null;
  const initialMode: TabMode =
    reentryMode ??
    (_testInitialContent !== undefined
      ? {
          kind: 'edit',
          edit: editStateFromContent(_testInitialContent),
          baseYaml: yaml,
          validationError: null,
        }
      : { kind: 'read', revealed: false });
  const [mode, setMode] = useState<TabMode>(initialMode);
  // On mount with a reentry seed, clear the controller's pending value and
  // re-assert edit mode so the [EDIT] indicator / key routing stay consistent
  // across the remount. Mount-only (deps are stable controller callbacks; the
  // seed itself is captured once by useState above).
  const hasReentry = reentryMode !== null;
  useEffect(() => {
    if (hasReentry) {
      onReentryConsumed?.();
      onModeChange?.('edit');
    }
  }, [hasReentry, onReentryConsumed, onModeChange]);
  // Edit-mode cursor-following scroll (both axes). Recomputed on every cursor
  // move via the pure `followCursor`; read mode uses the controller's offset.
  const [editScroll, setEditScroll] = useState<EditScroll>(SCROLL_ORIGIN);
  // Edit body height: leave the editing banner one row; default generously when
  // the host does not measure (component tests render the full buffer anyway).
  const editHeight =
    viewportHeight !== undefined ? Math.max(1, viewportHeight - 1) : 9999;

  function transition(next: TabMode): void {
    setMode(next);
    onModeChange?.(next.kind);
  }

  useInput((input, key) => {
    // SGR mouse reports leak past Ink's filter as the bare CSI body
    // (`[<0;74;15M`); the real click is handled off raw stdin by the controller's
    // MouseRouter. Drop the leaked payload here too — otherwise its bytes are
    // typed into the edit buffer and its leading ESC is misread as a cancel
    // (the controller filters the same way for its own keymap, see
    // isLeakedMouseInput).
    if (isLeakedMouseInput(input)) {
      return;
    }
    if (mode.kind === 'read') {
      if (input === 'e') {
        enterEditMode();
      } else if (input === 'v' && kind === 'Secret' && !mode.revealed) {
        transition({ kind: 'read', revealed: true });
      }
    } else if (mode.kind === 'edit') {
      if (key.ctrl && input === 's') {
        handleCtrlS(mode);
      } else if (key.ctrl && input === 'e') {
        void handleOpenInEditor(mode);
      } else if (key.escape) {
        handleEscape(mode);
      } else {
        handleEditKey(mode, input, key);
      }
    } else if (mode.kind === 'discard-confirm') {
      handleDiscardKey(mode, input, key);
    }
    // diff mode: keys are handled by DiffView's own useInput.
  });

  function enterEditMode(): void {
    const edit = editStateFromContent(yaml);
    transition({
      kind: 'edit',
      edit,
      // Normalize through the editor's own splitter so a dirty check compares
      // like-for-like (jsYaml dumps a trailing newline that `contentOf` drops).
      baseYaml: contentOf(edit),
      validationError: null,
    });
  }

  function handleCtrlS(current: EditModeState): void {
    const content = contentOf(current.edit);
    const error = validateYaml(content);
    if (error !== null) {
      transition({ ...current, validationError: error });
      return;
    }
    transition({
      kind: 'diff',
      edit: current.edit,
      baseYaml: current.baseYaml,
      status: initialApplyStatus(),
    });
  }

  async function handleOpenInEditor(current: EditModeState): Promise<void> {
    const edited = await onOpenInEditor(contentOf(current.edit));
    setMode({
      kind: 'edit',
      edit: editStateFromContent(edited),
      baseYaml: current.baseYaml,
      validationError: validateYaml(edited),
    });
  }

  function handleEscape(current: EditModeState): void {
    if (contentOf(current.edit) !== current.baseYaml) {
      transition({
        kind: 'discard-confirm',
        edit: current.edit,
        baseYaml: current.baseYaml,
        // Default to the discard action so Enter confirms the discard (mirrors
        // the delete confirm's controlled selection).
        selection: 'confirm',
      });
    } else {
      transition({ kind: 'read', revealed: false });
    }
  }

  function discardChanges(): void {
    transition({ kind: 'read', revealed: false });
  }

  function keepEditing(
    current: Extract<TabMode, { kind: 'discard-confirm' }>,
  ): void {
    transition({
      kind: 'edit',
      edit: current.edit,
      baseYaml: current.baseYaml,
      validationError: null,
    });
  }

  function handleDiscardKey(
    current: Extract<TabMode, { kind: 'discard-confirm' }>,
    input: string,
    key: InkKey,
  ): void {
    const action = discardConfirmKeyAction(input, key, current.selection);
    switch (action.kind) {
      case 'discard':
        discardChanges();
        return;
      case 'keep':
        keepEditing(current);
        return;
      case 'select':
        setMode({ ...current, selection: action.selection });
        return;
      case 'none':
        return;
    }
  }

  function handleEditKey(
    current: EditModeState,
    input: string,
    key: InkKey,
  ): void {
    const apply = (next: EditState): void => {
      setMode({ ...current, edit: next });
      setEditScroll((prev) =>
        followCursor(prev, next.cursor, width, editHeight),
      );
    };
    if (key.leftArrow) {
      apply(moveLeft(current.edit));
    } else if (key.rightArrow) {
      apply(moveRight(current.edit));
    } else if (key.upArrow) {
      apply(moveUp(current.edit));
    } else if (key.downArrow) {
      apply(moveDown(current.edit));
    } else if (key.return) {
      apply(insertNewline(current.edit));
    } else if (key.backspace) {
      apply(backspace(current.edit));
    } else if (key.delete) {
      apply(forwardDelete(current.edit));
    } else if (input.length > 0 && !key.ctrl && !key.meta && !key.tab) {
      apply(insertText(current.edit, input));
    }
  }

  // ── Apply pipeline (diff mode): drive the pure reducer; the controller
  //    performs the replace/get effects via onReplace/onReload. ──────────────
  function diffApply(current: Extract<TabMode, { kind: 'diff' }>): void {
    const step = pressApply(current.status);
    // Status-only change inside diff mode: setMode (the mode *kind* is unchanged,
    // so onModeChange must not re-fire 'diff').
    setMode({ ...current, status: step.status });
    if (step.effect.kind === 'replace') {
      void onReplace(contentOf(current.edit)).then((result) => {
        const resolved = applyResolved(
          { kind: 'applying' },
          toReplaceEvent(result),
        );
        if (resolved.outcome.kind === 'applied') {
          transition({ kind: 'read', revealed: false });
          onSave?.();
        } else {
          setMode({ ...current, status: resolved.status });
        }
      });
    }
  }

  function diffReload(current: Extract<TabMode, { kind: 'diff' }>): void {
    // Only reachable from DiffView's conflict bar, so pressReload always yields
    // the reload effect; setMode to `reloading` and perform the fetch.
    const step = pressReload(current.status);
    setMode({ ...current, status: step.status });
    void onReload().then((result) => {
      const resolved = reloadResolved(
        { kind: 'reloading' },
        toReloadEvent(result),
      );
      if (resolved.outcome.kind === 'reloaded') {
        const edit = editStateFromContent(resolved.outcome.yaml);
        transition({
          kind: 'edit',
          edit,
          baseYaml: contentOf(edit),
          validationError: null,
        });
      } else {
        setMode({ ...current, status: resolved.status });
      }
    });
  }

  function diffCancel(current: Extract<TabMode, { kind: 'diff' }>): void {
    const step = pressCancel(current.status);
    if (step.outcome.kind === 'cancelled') {
      transition({
        kind: 'edit',
        edit: current.edit,
        baseYaml: current.baseYaml,
        validationError: null,
      });
    } else if (step.outcome.kind === 'discarded') {
      transition({ kind: 'read', revealed: false });
    }
  }

  // ── Read mode ────────────────────────────────────────────────────────────
  if (mode.kind === 'read') {
    // Measured host: project to ViewLine[] and scroll via the chunk-03 viewport
    // (long lines clip to `width`, never wrap).
    if (viewportHeight !== undefined) {
      return (
        <ScrollableLines
          lines={projectYamlReadLines(yaml, kind, mode.revealed, width)}
          offset={offset}
          viewportHeight={viewportHeight}
          width={width}
        />
      );
    }
    const displayYaml = mode.revealed ? yaml : redactSecret(yaml);
    const lines = displayYaml.split('\n');
    const isSecret = kind === 'Secret';
    return (
      <Box flexDirection="column">
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
        <Box flexDirection="column">
          {lines.map((line, i) => (
            <HighlightedLine key={i} lineNum={i + 1} line={line} />
          ))}
        </Box>
      </Box>
    );
  }

  // ── Edit mode ────────────────────────────────────────────────────────────
  if (mode.kind === 'edit') {
    const lines = mode.edit.lines;
    const modifiedLines = computeModifiedLines(mode.baseYaml, lines);
    // Cursor-following window (both axes). Unmeasured hosts (component tests)
    // render the whole buffer with no horizontal pan.
    const measured = viewportHeight !== undefined;
    const top = measured ? editScroll.top : 0;
    const left = measured ? editScroll.left : 0;
    const lastRow = measured
      ? Math.min(lines.length, top + editHeight)
      : lines.length;
    const visibleRows = lines
      .map((line, i) => ({ line, i }))
      .slice(top, lastRow);
    return (
      <Box flexDirection="column">
        <Box flexDirection="row">
          <Text bold color="yellow">
            ╔══ EDITING — Ctrl+S to save, Ctrl+E to open in $EDITOR, Escape to
            cancel
          </Text>
        </Box>
        {mode.validationError !== null && (
          <Box flexDirection="row" gap={1}>
            <Text color="red">✗ YAML error</Text>
            {mode.validationError.line !== null && (
              <Text color="red">line {String(mode.validationError.line)}:</Text>
            )}
            <Text color="red">{mode.validationError.message}</Text>
          </Box>
        )}
        <Box flexDirection="column">
          {visibleRows.map(({ line, i }) => (
            <Box key={i} flexDirection="row">
              {modifiedLines.has(i) ? (
                <Text color="yellow">│</Text>
              ) : (
                <Text> </Text>
              )}
              {i === mode.edit.cursor.row ? (
                <CursorLine
                  lineNum={i + 1}
                  line={left > 0 ? line.slice(left) : line}
                  col={mode.edit.cursor.col - left}
                />
              ) : (
                <HighlightedLine
                  lineNum={i + 1}
                  line={left > 0 ? line.slice(left) : line}
                />
              )}
            </Box>
          ))}
        </Box>
      </Box>
    );
  }

  // ── Discard confirm ──────────────────────────────────────────────────────
  if (mode.kind === 'discard-confirm') {
    const discardMode = mode;
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={2}>
          <Text>Discard changes?</Text>
          {renderDiscardButton({
            which: 'confirm',
            label: 'Yes',
            selected: discardMode.selection === 'confirm',
            onClick: discardChanges,
          })}
          {renderDiscardButton({
            which: 'cancel',
            label: 'No',
            selected: discardMode.selection === 'cancel',
            onClick: () => {
              keepEditing(discardMode);
            },
          })}
        </Box>
      </Box>
    );
  }

  // ── Diff mode ────────────────────────────────────────────────────────────
  const diffMode = mode;
  return (
    <DiffView
      originalYaml={diffMode.baseYaml}
      modifiedYaml={contentOf(diffMode.edit)}
      title={title}
      status={diffMode.status}
      onApply={() => {
        diffApply(diffMode);
      }}
      onCancel={() => {
        diffCancel(diffMode);
      }}
      onReloadAndRedit={() => {
        diffReload(diffMode);
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Default (test-mode) discard button: a styled, non-clickable `<Text>`. */
function defaultRenderDiscardButton({
  which,
  label,
  selected,
}: {
  which: ConfirmSelection;
  label: string;
  selected: boolean;
}): React.ReactNode {
  return (
    <Text
      color={which === 'confirm' ? 'red' : 'green'}
      underline
      bold={selected}
    >
      [{label}]
    </Text>
  );
}

function toReplaceEvent(
  result: YamlReplaceResult,
): Parameters<typeof applyResolved>[1] {
  if (result.ok) {
    return { ok: true };
  }
  if (result.conflict) {
    return { ok: false, conflict: true };
  }
  return { ok: false, conflict: false, message: result.message };
}

function toReloadEvent(
  result: YamlReloadResult,
): Parameters<typeof reloadResolved>[1] {
  return result.ok
    ? { ok: true, yaml: result.yaml }
    : { ok: false, message: result.message };
}

/** Line indices whose text differs from the original YAML (gutter marker). */
function computeModifiedLines(
  baseYaml: string,
  current: readonly string[],
): Set<number> {
  const original = splitLines(baseYaml);
  const modified = new Set<number>();
  const maxLen = Math.max(original.length, current.length);
  for (let i = 0; i < maxLen; i++) {
    if (original[i] !== current[i]) {
      modified.add(i);
    }
  }
  return modified;
}

// ---------------------------------------------------------------------------
// CursorLine
// ---------------------------------------------------------------------------

interface CursorLineProps {
  lineNum: number;
  line: string;
  col: number;
}

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
