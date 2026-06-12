import { describe, it, expect } from 'vitest';
import { computeDiff, LCSMatrix } from './diff.js';
import type { DiffLine } from './diff.js';

function kinds(lines: DiffLine[]): string[] {
  return lines.map((l) => l.kind);
}

describe('computeDiff', () => {
  it('returns empty for identical content', () => {
    const content = 'apiVersion: v1\nkind: ConfigMap\n';
    const result = computeDiff(content, content);
    // All context, so it should be collapsed entirely
    const nonCollapsed = result.filter((l) => l.kind !== 'collapsed');
    expect(nonCollapsed).toHaveLength(0);
  });

  it('detects a single line change', () => {
    const original = 'replicas: 2\n';
    const modified = 'replicas: 3\n';
    const result = computeDiff(original, modified);
    const removed = result.filter((l) => l.kind === 'removed');
    const added = result.filter((l) => l.kind === 'added');
    expect(removed.length).toBeGreaterThan(0);
    expect(added.length).toBeGreaterThan(0);
    expect(removed[0]?.text).toContain('2');
    expect(added[0]?.text).toContain('3');
  });

  it('shows context lines around changes', () => {
    const original = 'a\nb\nc\nd: 1\ne\nf\ng\n';
    const modified = 'a\nb\nc\nd: 2\ne\nf\ng\n';
    const result = computeDiff(original, modified);
    const contextLines = result.filter((l) => l.kind === 'context');
    expect(contextLines.length).toBeGreaterThan(0);
  });

  it('collapses unchanged lines with count', () => {
    const lines: string[] = [];
    for (let i = 0; i < 20; i++) {
      lines.push(`line${String(i)}: value`);
    }
    const original = lines.join('\n') + '\n';
    const modified =
      lines.slice(0, 10).join('\n') +
      '\nline10: changed\n' +
      lines.slice(11).join('\n') +
      '\n';
    const result = computeDiff(original, modified);
    const collapsed = result.filter((l) => l.kind === 'collapsed');
    expect(collapsed.length).toBeGreaterThan(0);
    const collapsedLine = collapsed[0];
    expect(collapsedLine?.collapsedCount).toBeGreaterThan(0);
  });

  it('handles empty original', () => {
    const result = computeDiff('', 'new line\n');
    const added = result.filter((l) => l.kind === 'added');
    expect(added.length).toBeGreaterThan(0);
  });

  it('handles empty modified (all removed)', () => {
    const result = computeDiff('old line\n', '');
    const removed = result.filter((l) => l.kind === 'removed');
    expect(removed.length).toBeGreaterThan(0);
  });

  it('handles both empty', () => {
    const result = computeDiff('', '');
    expect(result).toHaveLength(0);
  });

  it('detects multiple changed hunks', () => {
    const original =
      'a: 1\nb: 2\nc: 3\nd: 4\ne: 5\nf: 6\ng: 7\nh: 8\ni: 9\nj: 10\n';
    const modified =
      'a: X\nb: 2\nc: 3\nd: 4\ne: 5\nf: 6\ng: 7\nh: 8\ni: 9\nj: Y\n';
    const result = computeDiff(original, modified);
    const ks = kinds(result);
    expect(ks).toContain('removed');
    expect(ks).toContain('added');
    expect(ks).toContain('collapsed');
  });

  it('shows all lines when diff is short enough', () => {
    const original = 'a: 1\nb: 2\nc: 3\n';
    const modified = 'a: 1\nb: X\nc: 3\n';
    const result = computeDiff(original, modified);
    // With 3 lines and 3 context lines, all should be shown (no collapsed)
    const collapsed = result.filter((l) => l.kind === 'collapsed');
    expect(collapsed).toHaveLength(0);
  });

  it('collapsed line has collapsedCount property', () => {
    const lines: string[] = [];
    for (let i = 0; i < 30; i++) {
      lines.push(`line${String(i)}: value${String(i)}`);
    }
    const original = lines.join('\n') + '\n';
    const modLines = [...lines];
    modLines[15] = 'line15: CHANGED';
    const modified = modLines.join('\n') + '\n';
    const result = computeDiff(original, modified);
    const collapsed = result.filter((l) => l.kind === 'collapsed');
    for (const c of collapsed) {
      expect(typeof c.collapsedCount).toBe('number');
      expect(c.collapsedCount > 0).toBe(true);
    }
  });

  it('handles content without trailing newline', () => {
    const original = 'key: value1';
    const modified = 'key: value2';
    const result = computeDiff(original, modified);
    const ks = kinds(result);
    expect(ks).toContain('removed');
    expect(ks).toContain('added');
  });

  it('handles added lines at end', () => {
    const original = 'key: value\n';
    const modified = 'key: value\nnew: line\n';
    const result = computeDiff(original, modified);
    const added = result.filter((l) => l.kind === 'added');
    expect(added.length).toBeGreaterThan(0);
    expect(added.some((l) => l.text.includes('new: line'))).toBe(true);
  });

  it('handles removed lines at end', () => {
    const original = 'key: value\nold: line\n';
    const modified = 'key: value\n';
    const result = computeDiff(original, modified);
    const removed = result.filter((l) => l.kind === 'removed');
    expect(removed.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// LCSMatrix — safe out-of-bounds access
// ---------------------------------------------------------------------------

describe('LCSMatrix', () => {
  it('returns 0 for out-of-bounds access', () => {
    const mat = new LCSMatrix(3, 3);
    mat.set(0, 0, 5);
    // Access within bounds
    expect(mat.get(0, 0)).toBe(5);
    // Access out of bounds (beyond allocated size) — should return 0
    expect(mat.get(100, 100)).toBe(0);
  });
});
