import { describe, it, expect } from 'vitest';
import { createEditBuffer, EditBufferHandle } from './edit-buffer.js';

describe('EditBuffer', () => {
  describe('createEditBuffer', () => {
    it('initializes with the given content', () => {
      const buf = createEditBuffer('key: value\n');
      expect(buf.content).toBe('key: value');
    });

    it('is not dirty on creation', () => {
      const buf = createEditBuffer('key: value\n');
      expect(buf.isDirty).toBe(false);
    });

    it('has no modified lines on creation', () => {
      const buf = createEditBuffer('key: value\n');
      expect(buf.modifiedLines.size).toBe(0);
    });

    it('provides lines array', () => {
      const buf = createEditBuffer('line1\nline2\nline3\n');
      expect(buf.lines).toEqual(['line1', 'line2', 'line3']);
    });

    it('handles empty content', () => {
      const buf = createEditBuffer('');
      expect(buf.content).toBe('');
      expect(buf.lines).toEqual(['']);
      expect(buf.isDirty).toBe(false);
    });

    it('handles multi-line content without trailing newline', () => {
      const buf = createEditBuffer('a\nb\nc');
      expect(buf.lines).toEqual(['a', 'b', 'c']);
    });
  });

  describe('setContent', () => {
    it('replaces the entire content', () => {
      const buf = createEditBuffer('original\n');
      const updated = buf.setContent('new content\n');
      expect(updated.content).toBe('new content');
    });

    it('marks changed lines as modified', () => {
      const buf = createEditBuffer('line1\nline2\nline3\n');
      const updated = buf.setContent('line1\nLINE2\nline3\n');
      expect(updated.modifiedLines.has(1)).toBe(true);
      expect(updated.modifiedLines.has(0)).toBe(false);
      expect(updated.modifiedLines.has(2)).toBe(false);
    });

    it('is dirty when content changed', () => {
      const buf = createEditBuffer('original\n');
      const updated = buf.setContent('changed\n');
      expect(updated.isDirty).toBe(true);
    });

    it('is not dirty when content is same as original', () => {
      const buf = createEditBuffer('original\n');
      const updated = buf.setContent('original');
      expect(updated.isDirty).toBe(false);
    });

    it('marks added lines as modified', () => {
      const buf = createEditBuffer('line1\n');
      const updated = buf.setContent('line1\nline2\n');
      expect(updated.modifiedLines.has(1)).toBe(true);
    });

    it('marks removed lines as modified (different length)', () => {
      const buf = createEditBuffer('line1\nline2\n');
      const updated = buf.setContent('line1\n');
      // Line 1 is now absent in shorter buffer → treated as modified
      expect(updated.modifiedLines.has(1)).toBe(true);
    });

    it('does not mutate original buffer', () => {
      const buf = createEditBuffer('original\n');
      buf.setContent('changed\n');
      expect(buf.content).toBe('original');
      expect(buf.isDirty).toBe(false);
    });
  });

  describe('lineAt', () => {
    it('returns the line at a valid index', () => {
      const buf = createEditBuffer('a\nb\nc\n');
      expect(buf.lineAt(1)).toBe('b');
    });

    it('returns an empty string for an out-of-range index', () => {
      const buf = createEditBuffer('a\n');
      expect(buf.lineAt(99)).toBe('');
    });
  });

  describe('setLine', () => {
    it('replaces a specific line', () => {
      const buf = createEditBuffer('a\nb\nc\n');
      const updated = buf.setLine(1, 'B');
      expect(updated.lines[1]).toBe('B');
    });

    it('marks the changed line as modified', () => {
      const buf = createEditBuffer('a\nb\nc\n');
      const updated = buf.setLine(1, 'B');
      expect(updated.modifiedLines.has(1)).toBe(true);
      expect(updated.modifiedLines.has(0)).toBe(false);
    });

    it('extends buffer if index is beyond length', () => {
      const buf = createEditBuffer('a\n');
      const updated = buf.setLine(3, 'new');
      expect(updated.lines[3]).toBe('new');
    });

    it('does not mutate original buffer', () => {
      const buf = createEditBuffer('a\nb\n');
      buf.setLine(0, 'changed');
      expect(buf.lines[0]).toBe('a');
    });
  });

  describe('insertLine', () => {
    it('inserts a line at the given index', () => {
      const buf = createEditBuffer('a\nb\nc\n');
      const updated = buf.insertLine(1, 'NEW');
      expect(updated.lines[1]).toBe('NEW');
      expect(updated.lines[2]).toBe('b');
    });

    it('is dirty after insert', () => {
      const buf = createEditBuffer('a\nb\n');
      const updated = buf.insertLine(1, 'NEW');
      expect(updated.isDirty).toBe(true);
    });

    it('does not mutate original', () => {
      const buf = createEditBuffer('a\nb\n');
      buf.insertLine(0, 'NEW');
      expect(buf.lines[0]).toBe('a');
    });
  });

  describe('deleteLine', () => {
    it('removes a line at the given index', () => {
      const buf = createEditBuffer('a\nb\nc\n');
      const updated = buf.deleteLine(1);
      expect(updated.lines).toEqual(['a', 'c']);
    });

    it('is dirty after delete', () => {
      const buf = createEditBuffer('a\nb\n');
      const updated = buf.deleteLine(0);
      expect(updated.isDirty).toBe(true);
    });

    it('does not mutate original', () => {
      const buf = createEditBuffer('a\nb\n');
      buf.deleteLine(0);
      expect(buf.lines[0]).toBe('a');
    });
  });

  describe('reset', () => {
    it('restores original content', () => {
      const buf = createEditBuffer('original\n');
      const modified = buf.setContent('changed\n');
      const reset = modified.reset();
      expect(reset.content).toBe('original');
    });

    it('clears dirty state', () => {
      const buf = createEditBuffer('original\n');
      const modified = buf.setContent('changed\n');
      const reset = modified.reset();
      expect(reset.isDirty).toBe(false);
    });

    it('clears modified lines', () => {
      const buf = createEditBuffer('a\nb\n');
      const modified = buf.setLine(0, 'A');
      const reset = modified.reset();
      expect(reset.modifiedLines.size).toBe(0);
    });

    it('does not mutate the handle it is called on', () => {
      const buf = createEditBuffer('original\n');
      const modified = buf.setContent('changed\n');
      modified.reset();
      expect(modified.content).toBe('changed');
    });
  });

  describe('EditBufferHandle class', () => {
    it('is an instance of EditBufferHandle', () => {
      const buf = createEditBuffer('content\n');
      expect(buf).toBeInstanceOf(EditBufferHandle);
    });

    it('lines are readonly (does not throw on access)', () => {
      const buf = createEditBuffer('a\nb\n');
      expect(() => buf.lines[0]).not.toThrow();
    });

    it('modifiedLines is readonly set', () => {
      const buf = createEditBuffer('a\nb\n');
      const modified = buf.setLine(0, 'A');
      const mLines = modified.modifiedLines;
      expect(mLines.has(0)).toBe(true);
    });
  });
});
