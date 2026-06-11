/**
 * Unified diff computation with collapsed unchanged sections.
 * Spec 04 §7.2: removed lines prefixed `-` in red, added lines `+` in green,
 * context lines dimmed, unchanged sections collapsed with `… N lines unchanged`.
 */

/** How many unchanged context lines to show around each changed hunk. */
const CONTEXT_LINES = 3;

export type DiffLineKind = 'added' | 'removed' | 'context' | 'collapsed';

export type DiffLine =
  | { kind: 'collapsed'; text: string; collapsedCount: number }
  | { kind: 'added'; text: string }
  | { kind: 'removed'; text: string }
  | { kind: 'context'; text: string };

/**
 * Compute a unified diff between `original` and `modified` strings.
 * Returns a list of DiffLine entries suitable for display.
 */
export function computeDiff(original: string, modified: string): DiffLine[] {
  const origLines = splitLines(original);
  const modLines = splitLines(modified);

  // Myers diff: compute the edit script
  const edits = myersDiff(origLines, modLines);

  // Compute which original line indices are changed (removed or context around added)
  const lines = applyEdits(origLines, modLines, edits);

  // Collapse unchanged runs
  return collapseUnchanged(lines);
}

function splitLines(s: string): string[] {
  if (s === '') {
    return [];
  }
  // Normalize trailing newline
  const normalized = s.endsWith('\n') ? s.slice(0, -1) : s;
  return normalized.split('\n');
}

// ---------------------------------------------------------------------------
// Myers diff algorithm (LCS-based)
// ---------------------------------------------------------------------------

interface Edit {
  type: 'equal' | 'insert' | 'delete';
  origLine: string;
  modLine: string;
}

function myersDiff(a: string[], b: string[]): Edit[] {
  // Use a simple DP LCS approach for correctness
  const lcs = computeLCS(a, b);
  return buildEdits(a, b, lcs);
}

/** LCS table accessor — wraps a flat Int32Array for safe indexed access. */
export class LCSMatrix {
  private readonly data: Int32Array;
  private readonly stride: number;
  readonly rows: number;
  readonly cols: number;

  constructor(rows: number, cols: number) {
    this.rows = rows;
    this.cols = cols;
    this.stride = cols;
    this.data = new Int32Array(rows * cols);
  }

  get(i: number, j: number): number {
    const raw = this.data[i * this.stride + j];
    if (raw === undefined) {
      return 0;
    }
    return raw;
  }

  set(i: number, j: number, v: number): void {
    this.data[i * this.stride + j] = v;
  }
}

function computeLCS(a: string[], b: string[]): LCSMatrix {
  const m = a.length;
  const n = b.length;
  const mat = new LCSMatrix(m + 1, n + 1);

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        mat.set(i, j, mat.get(i - 1, j - 1) + 1);
      } else {
        mat.set(i, j, Math.max(mat.get(i - 1, j), mat.get(i, j - 1)));
      }
    }
  }

  return mat;
}

/** Build edit list by tracing back through the LCS matrix. */
function buildEdits(a: string[], b: string[], dp: LCSMatrix): Edit[] {
  const edits: Edit[] = [];
  let i = a.length;
  let j = b.length;

  while (i > 0 || j > 0) {
    const aLine = a[i - 1] ?? '';
    const bLine = b[j - 1] ?? '';

    if (i > 0 && j > 0 && aLine === bLine) {
      edits.unshift({ type: 'equal', origLine: aLine, modLine: bLine });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp.get(i, j - 1) >= dp.get(i - 1, j))) {
      edits.unshift({ type: 'insert', origLine: '', modLine: bLine });
      j--;
    } else {
      edits.unshift({ type: 'delete', origLine: aLine, modLine: '' });
      i--;
    }
  }

  return edits;
}

// ---------------------------------------------------------------------------
// Convert edits to DiffLines
// ---------------------------------------------------------------------------

interface RawDiffLine {
  kind: 'added' | 'removed' | 'context';
  text: string;
}

function applyEdits(
  _origLines: string[],
  _modLines: string[],
  edits: Edit[],
): RawDiffLine[] {
  const lines: RawDiffLine[] = [];

  for (const edit of edits) {
    if (edit.type === 'equal') {
      lines.push({ kind: 'context', text: edit.origLine });
    } else if (edit.type === 'delete') {
      lines.push({ kind: 'removed', text: edit.origLine });
    } else {
      lines.push({ kind: 'added', text: edit.modLine });
    }
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Collapse unchanged context runs
// ---------------------------------------------------------------------------

function collapseUnchanged(lines: RawDiffLine[]): DiffLine[] {
  // Find indices of lines that are near a change
  const isChanged = lines.map((l) => l.kind !== 'context');

  // Build a set of indices to keep (within CONTEXT_LINES of any change)
  const keep = new Set<number>();
  for (let i = 0; i < lines.length; i++) {
    if (isChanged[i] === true) {
      for (
        let k = Math.max(0, i - CONTEXT_LINES);
        k <= Math.min(lines.length - 1, i + CONTEXT_LINES);
        k++
      ) {
        keep.add(k);
      }
    }
  }

  // If no changes at all, collapse everything
  if (keep.size === 0) {
    if (lines.length === 0) {
      return [];
    }
    return [
      {
        kind: 'collapsed',
        text: '',
        collapsedCount: lines.length,
      },
    ];
  }

  const result: DiffLine[] = [];
  let collapseStart = -1;

  for (let i = 0; i < lines.length; i++) {
    if (keep.has(i)) {
      // Flush any pending collapsed block
      if (collapseStart !== -1) {
        const count = i - collapseStart;
        result.push({ kind: 'collapsed', text: '', collapsedCount: count });
        collapseStart = -1;
      }
      const line = lines[i];
      if (line !== undefined) {
        result.push({ kind: line.kind, text: line.text });
      }
    } else {
      if (collapseStart === -1) {
        collapseStart = i;
      }
    }
  }

  // Trailing collapsed block
  if (collapseStart !== -1) {
    const count = lines.length - collapseStart;
    result.push({ kind: 'collapsed', text: '', collapsedCount: count });
  }

  return result;
}
