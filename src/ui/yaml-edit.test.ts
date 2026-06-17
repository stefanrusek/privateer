import { describe, it, expect } from 'vitest';
import {
  CURSOR_ORIGIN,
  SCROLL_ORIGIN,
  editStateFromContent,
  splitLines,
  contentOf,
  moveLeft,
  moveRight,
  moveUp,
  moveDown,
  insertText,
  insertNewline,
  backspace,
  forwardDelete,
  followCursor,
  type EditState,
} from './yaml-edit.js';

/** Build an EditState at a specific cursor for movement tests. */
function at(
  content: string,
  row: number,
  col: number,
  desired = col,
): EditState {
  const base = editStateFromContent(content);
  return { lines: base.lines, cursor: { row, col, desired } };
}

describe('yaml-edit: construction', () => {
  it('splits content into lines, dropping a single trailing newline', () => {
    expect(splitLines('a\nb\n')).toEqual(['a', 'b']);
    expect(splitLines('a\nb')).toEqual(['a', 'b']);
    expect(splitLines('')).toEqual(['']);
  });

  it('editStateFromContent starts at the origin', () => {
    const s = editStateFromContent('abc\ndef\n');
    expect(s.lines).toEqual(['abc', 'def']);
    expect(s.cursor).toEqual(CURSOR_ORIGIN);
  });

  it('contentOf round-trips the lines', () => {
    expect(contentOf(editStateFromContent('a\nb\n'))).toBe('a\nb');
  });
});

describe('yaml-edit: cursor movement', () => {
  it('moveLeft clamps at column 0', () => {
    expect(moveLeft(at('abc', 0, 0)).cursor).toEqual({
      row: 0,
      col: 0,
      desired: 0,
    });
    expect(moveLeft(at('abc', 0, 2)).cursor).toEqual({
      row: 0,
      col: 1,
      desired: 1,
    });
  });

  it('moveRight clamps at end of line', () => {
    expect(moveRight(at('ab', 0, 2)).cursor).toEqual({
      row: 0,
      col: 2,
      desired: 2,
    });
    expect(moveRight(at('ab', 0, 0)).cursor).toEqual({
      row: 0,
      col: 1,
      desired: 1,
    });
  });

  it('moveRight on an out-of-range row treats the line as empty', () => {
    // cursor row beyond the lines → lineAt returns ''
    const s: EditState = {
      lines: ['a'],
      cursor: { row: 5, col: 0, desired: 0 },
    };
    expect(moveRight(s).cursor).toEqual({ row: 5, col: 0, desired: 0 });
  });

  it('moveUp clamps the column to the shorter line but keeps desired', () => {
    // on "cdef" col 3, move up to "ab" → col clamps to 2, desired stays 3
    expect(moveUp(at('ab\ncdef', 1, 3)).cursor).toEqual({
      row: 0,
      col: 2,
      desired: 3,
    });
  });

  it('moveUp clamps at the first row', () => {
    expect(moveUp(at('abc\ndef', 0, 1)).cursor.row).toBe(0);
  });

  it('moveDown clamps at the last row', () => {
    expect(moveDown(at('abc', 0, 1)).cursor.row).toBe(0);
  });

  it('moveDown restores the desired column on a long-enough line', () => {
    // start "abcd" col 3 (desired 3), down to "ef" (clamp 2), down to "ghij" (restore 3)
    const s1 = moveDown(at('abcd\nef\nghij', 0, 3));
    expect(s1.cursor).toEqual({ row: 1, col: 2, desired: 3 });
    const s2 = moveDown(s1);
    expect(s2.cursor).toEqual({ row: 2, col: 3, desired: 3 });
  });
});

describe('yaml-edit: text mutation', () => {
  it('insertText inserts at the cursor and advances past it', () => {
    const s = insertText(at('abc', 0, 0), 'X');
    expect(s.lines[0]).toBe('Xabc');
    expect(s.cursor).toEqual({ row: 0, col: 1, desired: 1 });
  });

  it('insertText inserts pasted multi-character input wholesale', () => {
    const s = insertText(at('abc', 0, 0), 'hello');
    expect(s.lines[0]).toBe('helloabc');
    expect(s.cursor.col).toBe(5);
  });

  it('insertNewline splits the line and moves to the new line start', () => {
    const s = insertNewline(at('abcd', 0, 2));
    expect(s.lines).toEqual(['ab', 'cd']);
    expect(s.cursor).toEqual({ row: 1, col: 0, desired: 0 });
  });

  it('backspace deletes the character before the cursor', () => {
    const s = backspace(at('abc', 0, 2));
    expect(s.lines[0]).toBe('ac');
    expect(s.cursor).toEqual({ row: 0, col: 1, desired: 1 });
  });

  it('backspace at column 0 joins with the previous line', () => {
    const s = backspace(at('ab\ncd', 1, 0));
    expect(s.lines).toEqual(['abcd']);
    expect(s.cursor).toEqual({ row: 0, col: 2, desired: 2 });
  });

  it('backspace at the buffer origin is a no-op', () => {
    const s = at('abc', 0, 0);
    expect(backspace(s)).toBe(s);
  });

  it('forwardDelete removes the character at the cursor', () => {
    const s = forwardDelete(at('abc', 0, 0));
    expect(s.lines[0]).toBe('bc');
    expect(s.cursor).toEqual({ row: 0, col: 0, desired: 0 });
  });

  it('forwardDelete at end of line joins the next line up', () => {
    const s = forwardDelete(at('ab\ncd', 0, 2));
    expect(s.lines).toEqual(['abcd']);
  });

  it('forwardDelete at the very end of the buffer is a no-op', () => {
    const s = at('ab', 0, 2);
    expect(forwardDelete(s)).toBe(s);
  });

  it('insertText extends the array when the cursor row is past the end', () => {
    const s: EditState = {
      lines: ['a'],
      cursor: { row: 2, col: 0, desired: 0 },
    };
    const next = insertText(s, 'X');
    expect(next.lines).toEqual(['a', '', 'X']);
  });
});

describe('yaml-edit: cursor-following scroll', () => {
  it('does not move when the cursor is already visible', () => {
    expect(
      followCursor({ top: 0, left: 0 }, { row: 2, col: 3, desired: 3 }, 10, 5),
    ).toEqual({ top: 0, left: 0 });
  });

  it('snaps up when the cursor is above the viewport', () => {
    expect(
      followCursor({ top: 4, left: 0 }, { row: 1, col: 0, desired: 0 }, 10, 5),
    ).toEqual({ top: 1, left: 0 });
  });

  it('scrolls down to put the cursor on the last visible row', () => {
    expect(
      followCursor({ top: 0, left: 0 }, { row: 6, col: 0, desired: 0 }, 10, 5),
    ).toEqual({ top: 2, left: 0 });
  });

  it('pans right when the cursor column is past the right edge', () => {
    expect(
      followCursor({ top: 0, left: 0 }, { row: 0, col: 12, desired: 12 }, 5, 5),
    ).toEqual({ top: 0, left: 8 });
  });

  it('pans left when the cursor column is before the left edge', () => {
    expect(
      followCursor({ top: 0, left: 5 }, { row: 0, col: 2, desired: 2 }, 5, 5),
    ).toEqual({ top: 0, left: 2 });
  });

  it('degenerates to pinning the cursor when the viewport is non-positive', () => {
    expect(
      followCursor(SCROLL_ORIGIN, { row: 3, col: 4, desired: 4 }, 0, 0),
    ).toEqual({ top: 3, left: 4 });
  });
});
