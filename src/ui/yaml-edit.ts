/**
 * yaml-edit.ts — the pure cursor + edit-op model for the in-pane YAML editor
 * (navigation-overhaul chunk 07 / B07).
 *
 * Spec: `specs/navigation-overhaul/07-yaml-editor.md` ("Pure modules" →
 * `src/ui/yaml-edit.ts`). All cursor movement, text mutation, and the
 * cursor-following scroll arithmetic that used to live inline in
 * `YamlTab.handleEditKey` live here as pure functions over an immutable
 * {@link EditState}. The `YamlEditor` component (a coverage-excluded glue in
 * `src/adapters/live/`) only holds this state and routes keys; every *decision*
 * is here so it is 100% unit-covered.
 *
 * Lines are a plain `readonly string[]`; the cursor carries a `desired` column
 * (the column the user last set explicitly by horizontal movement or typing).
 * Vertical movement clamps the visible column to the target line's length but
 * keeps `desired`, so moving across a short line and back restores the column.
 *
 * Scroll is two-axis and cursor-following: {@link followCursor} returns the
 * smallest scroll offset adjustment that keeps the cursor inside a viewport of a
 * given width/height (no wrapping — long lines clip, matching read mode).
 */

/** Cursor position within the buffer. `desired` survives vertical clamping. */
export interface Cursor {
  /** 0-based line index. */
  readonly row: number;
  /** 0-based column within the line (0..line length). */
  readonly col: number;
  /** The column the user last set explicitly; restored on vertical movement. */
  readonly desired: number;
}

/** The immutable editor state: the lines plus the cursor. */
export interface EditState {
  readonly lines: readonly string[];
  readonly cursor: Cursor;
}

/** A scroll offset for the cursor-following viewport (both axes, 0 = origin). */
export interface EditScroll {
  /** Index of the topmost visible row. */
  readonly top: number;
  /** First visible column (horizontal pan). */
  readonly left: number;
}

/** The cursor at the buffer origin. */
export const CURSOR_ORIGIN: Cursor = { row: 0, col: 0, desired: 0 };

/** The scroll origin. */
export const SCROLL_ORIGIN: EditScroll = { top: 0, left: 0 };

/** Build an {@link EditState} from raw text, cursor at the origin. */
export function editStateFromContent(content: string): EditState {
  return { lines: splitLines(content), cursor: CURSOR_ORIGIN };
}

/** Split text into lines the way the edit buffer does (trailing `\n` dropped). */
export function splitLines(content: string): string[] {
  if (content === '') {
    return [''];
  }
  const normalized = content.endsWith('\n') ? content.slice(0, -1) : content;
  return normalized.split('\n');
}

/** Join the lines back into a single string (no trailing newline). */
export function contentOf(state: EditState): string {
  return state.lines.join('\n');
}

/** The line at `row`, or `''` when out of range. */
function lineAt(lines: readonly string[], row: number): string {
  return lines[row] ?? '';
}

// ---------------------------------------------------------------------------
// Cursor movement
// ---------------------------------------------------------------------------

/** Move the cursor one column left, clamping at column 0. */
export function moveLeft(state: EditState): EditState {
  const col = Math.max(0, state.cursor.col - 1);
  return { ...state, cursor: { row: state.cursor.row, col, desired: col } };
}

/** Move the cursor one column right, clamping at end of line. */
export function moveRight(state: EditState): EditState {
  const line = lineAt(state.lines, state.cursor.row);
  const col = Math.min(line.length, state.cursor.col + 1);
  return { ...state, cursor: { row: state.cursor.row, col, desired: col } };
}

/** Move the cursor up one line, clamping the column and restoring `desired`. */
export function moveUp(state: EditState): EditState {
  const row = Math.max(0, state.cursor.row - 1);
  const col = Math.min(state.cursor.desired, lineAt(state.lines, row).length);
  return { ...state, cursor: { row, col, desired: state.cursor.desired } };
}

/** Move the cursor down one line, clamping the column and restoring `desired`. */
export function moveDown(state: EditState): EditState {
  const row = Math.min(state.lines.length - 1, state.cursor.row + 1);
  const col = Math.min(state.cursor.desired, lineAt(state.lines, row).length);
  return { ...state, cursor: { row, col, desired: state.cursor.desired } };
}

// ---------------------------------------------------------------------------
// Text mutation
// ---------------------------------------------------------------------------

/** Insert printable `text` at the cursor, advancing the cursor past it. */
export function insertText(state: EditState, text: string): EditState {
  const { row, col } = state.cursor;
  const line = lineAt(state.lines, row);
  const next = setLine(
    state.lines,
    row,
    line.slice(0, col) + text + line.slice(col),
  );
  const newCol = col + text.length;
  return { lines: next, cursor: { row, col: newCol, desired: newCol } };
}

/** Split the current line at the cursor, moving to the start of the new line. */
export function insertNewline(state: EditState): EditState {
  const { row, col } = state.cursor;
  const line = lineAt(state.lines, row);
  const lines = [...state.lines];
  lines[row] = line.slice(0, col);
  lines.splice(row + 1, 0, line.slice(col));
  return { lines, cursor: { row: row + 1, col: 0, desired: 0 } };
}

/**
 * Backspace: delete the character before the cursor, or — at column 0 — join
 * with the previous line. A no-op at the buffer origin.
 */
export function backspace(state: EditState): EditState {
  const { row, col } = state.cursor;
  const line = lineAt(state.lines, row);
  if (col > 0) {
    const next = setLine(
      state.lines,
      row,
      line.slice(0, col - 1) + line.slice(col),
    );
    const newCol = col - 1;
    return { lines: next, cursor: { row, col: newCol, desired: newCol } };
  }
  if (row > 0) {
    const prev = lineAt(state.lines, row - 1);
    const lines = [...state.lines];
    lines[row - 1] = prev + line;
    lines.splice(row, 1);
    return {
      lines,
      cursor: { row: row - 1, col: prev.length, desired: prev.length },
    };
  }
  return state;
}

/**
 * Forward-delete: remove the character at the cursor, or — at end of line —
 * join the next line up. A no-op at the very end of the buffer.
 */
export function forwardDelete(state: EditState): EditState {
  const { row, col } = state.cursor;
  const line = lineAt(state.lines, row);
  if (col < line.length) {
    const next = setLine(
      state.lines,
      row,
      line.slice(0, col) + line.slice(col + 1),
    );
    return { lines: next, cursor: state.cursor };
  }
  if (row < state.lines.length - 1) {
    const lines = [...state.lines];
    lines[row] = line + lineAt(state.lines, row + 1);
    lines.splice(row + 1, 1);
    return { lines, cursor: state.cursor };
  }
  return state;
}

/** Replace one line by index (immutably). Extends the array if needed. */
function setLine(
  lines: readonly string[],
  index: number,
  text: string,
): string[] {
  const next = [...lines];
  while (next.length <= index) {
    next.push('');
  }
  next[index] = text;
  return next;
}

// ---------------------------------------------------------------------------
// Cursor-following scroll
// ---------------------------------------------------------------------------

/**
 * Return the scroll offset that keeps the cursor visible inside a viewport of
 * `width` × `height` (in cells), making the smallest adjustment to `scroll`:
 *
 * - vertical: if the cursor row is above `top`, snap `top` to it; if it is below
 *   `top + height - 1`, scroll so the cursor sits on the last visible row;
 * - horizontal: same rule on the cursor column against `left` and `width`.
 *
 * A non-positive `height`/`width` degenerates to pinning `top`/`left` to the
 * cursor (nothing else is visible). Long lines clip — there is no wrapping.
 */
export function followCursor(
  scroll: EditScroll,
  cursor: Cursor,
  width: number,
  height: number,
): EditScroll {
  const top = follow1D(scroll.top, cursor.row, height);
  const left = follow1D(scroll.left, cursor.col, width);
  return { top, left };
}

/** One axis of {@link followCursor}: keep `pos` within `[offset, offset+span)`. */
function follow1D(offset: number, pos: number, span: number): number {
  if (span <= 0) {
    return pos;
  }
  if (pos < offset) {
    return pos;
  }
  if (pos > offset + span - 1) {
    return pos - span + 1;
  }
  return offset;
}
