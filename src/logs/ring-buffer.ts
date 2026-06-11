/**
 * Fixed-capacity ring buffer for log lines (Spec 05 §3.4). The view buffers at
 * most `capacity` lines in memory; when full, the oldest line is dropped as a
 * new one arrives. Default capacity is 10,000 lines.
 */
export class RingBuffer {
  private readonly items: string[] = [];
  private readonly cap: number;

  /**
   * @param capacity Maximum retained lines. Must be a positive integer.
   * @throws RangeError if `capacity` is not a positive integer.
   */
  constructor(capacity = 10_000) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new RangeError('RingBuffer capacity must be a positive integer');
    }
    this.cap = capacity;
  }

  /** The configured maximum number of retained lines. */
  get capacity(): number {
    return this.cap;
  }

  /** Number of lines currently buffered. */
  get size(): number {
    return this.items.length;
  }

  /**
   * Append one line, dropping the oldest if at capacity. Returns `true` when a
   * line was evicted to make room, `false` otherwise.
   */
  push(line: string): boolean {
    this.items.push(line);
    if (this.items.length > this.cap) {
      this.items.splice(0, this.items.length - this.cap);
      return true;
    }
    return false;
  }

  /** Append many lines in order; later lines may evict earlier ones. */
  pushAll(lines: readonly string[]): void {
    for (const line of lines) {
      this.push(line);
    }
  }

  /** A snapshot copy of the buffered lines, oldest first. */
  toArray(): string[] {
    return [...this.items];
  }

  /** Drop all buffered lines. */
  clear(): void {
    this.items.length = 0;
  }
}
