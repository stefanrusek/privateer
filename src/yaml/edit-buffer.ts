/**
 * Edit buffer model for YAML editing.
 * Spec 04 §6.2: Modified lines indicated with a `│` marker in the gutter.
 * Tracks which lines have been modified relative to the original content.
 */

export interface EditBuffer {
  /** Current lines of the buffer. */
  lines: readonly string[];
  /** Set of line indices (0-based) that differ from the original. */
  modifiedLines: ReadonlySet<number>;
  /** The full current content as a string. */
  content: string;
  /** Whether any changes have been made. */
  isDirty: boolean;
}

interface MutableEditBuffer {
  originalLines: string[];
  currentLines: string[];
}

/**
 * Create a new EditBuffer from the given initial content.
 * The original content is stored for comparison; edits are tracked per-line.
 */
export function createEditBuffer(content: string): EditBufferHandle {
  const originalLines = splitLines(content);
  const state: MutableEditBuffer = {
    originalLines,
    currentLines: [...originalLines],
  };
  return new EditBufferHandle(state);
}

function splitLines(s: string): string[] {
  if (s === '') {
    return [''];
  }
  const normalized = s.endsWith('\n') ? s.slice(0, -1) : s;
  return normalized.split('\n');
}

function computeModifiedLines(
  original: string[],
  current: string[],
): Set<number> {
  const modified = new Set<number>();
  const maxLen = Math.max(original.length, current.length);
  for (let i = 0; i < maxLen; i++) {
    if (original[i] !== current[i]) {
      modified.add(i);
    }
  }
  return modified;
}

/**
 * A handle to an editable YAML buffer.
 * Operations return a new handle (immutable update pattern) so they are
 * easy to use from React state.
 */
export class EditBufferHandle implements EditBuffer {
  private readonly state: MutableEditBuffer;

  constructor(state: MutableEditBuffer) {
    this.state = state;
  }

  get lines(): readonly string[] {
    return this.state.currentLines;
  }

  get modifiedLines(): ReadonlySet<number> {
    return computeModifiedLines(
      this.state.originalLines,
      this.state.currentLines,
    );
  }

  get content(): string {
    return this.state.currentLines.join('\n');
  }

  get isDirty(): boolean {
    return this.modifiedLines.size > 0;
  }

  /**
   * Replace the entire content of the buffer.
   * All lines that differ from the original are marked as modified.
   */
  setContent(newContent: string): EditBufferHandle {
    const newLines = splitLines(newContent);
    return new EditBufferHandle({
      originalLines: this.state.originalLines,
      currentLines: newLines,
    });
  }

  /**
   * Get the line at the given index (0-based), or '' when out of range.
   */
  lineAt(index: number): string {
    return this.state.currentLines[index] ?? '';
  }

  /**
   * Replace a single line by index (0-based).
   * If the index is beyond the current buffer length, the buffer is extended.
   */
  setLine(index: number, text: string): EditBufferHandle {
    const newLines = [...this.state.currentLines];
    // Extend if needed
    while (newLines.length <= index) {
      newLines.push('');
    }
    newLines[index] = text;
    return new EditBufferHandle({
      originalLines: this.state.originalLines,
      currentLines: newLines,
    });
  }

  /**
   * Insert a new line at the given index, shifting subsequent lines down.
   */
  insertLine(index: number, text: string): EditBufferHandle {
    const newLines = [...this.state.currentLines];
    newLines.splice(index, 0, text);
    return new EditBufferHandle({
      originalLines: this.state.originalLines,
      currentLines: newLines,
    });
  }

  /**
   * Delete the line at the given index.
   */
  deleteLine(index: number): EditBufferHandle {
    const newLines = [...this.state.currentLines];
    newLines.splice(index, 1);
    return new EditBufferHandle({
      originalLines: this.state.originalLines,
      currentLines: newLines,
    });
  }

  /**
   * Reset the buffer to the original content (discard all changes).
   */
  reset(): EditBufferHandle {
    return new EditBufferHandle({
      originalLines: this.state.originalLines,
      currentLines: [...this.state.originalLines],
    });
  }
}
