/**
 * Drag tracking state machine. Spec 01 §3.5.
 *
 * Tracks press → motion → release sequences against registered drag-handle
 * regions and emits delta events (dx/dy) for each motion plus a release event
 * at the end. Used for pane resize.
 */

import type { HitTestRegistry } from './hit-testing.js';
import type { MouseEvent } from './mouse.js';

export interface DragDelta {
  kind: 'delta';
  handleId: string;
  dx: number;
  dy: number;
}

export interface DragRelease {
  kind: 'release';
  handleId: string;
}

export type DragEvent = DragDelta | DragRelease;

interface ActiveDrag {
  handleId: string;
  lastX: number;
  lastY: number;
}

/**
 * Drag tracker: wraps a HitTestRegistry of drag-handle regions, consumes raw
 * MouseEvents, and emits DragEvents via the provided callback.
 *
 * Caller is responsible for registering drag-handle regions in the
 * HitTestRegistry before calling `feed()`.
 */
export class DragTracker {
  private active: ActiveDrag | null = null;

  constructor(
    private readonly registry: HitTestRegistry,
    private readonly onDrag: (event: DragEvent) => void,
  ) {}

  /**
   * Feed a raw mouse event into the tracker. Emits DragEvents via the
   * callback when a drag sequence is in progress.
   */
  feed(event: MouseEvent): void {
    switch (event.type) {
      case 'down': {
        const hitId = this.registry.hitTest({ x: event.x, y: event.y });
        if (hitId !== null) {
          this.active = { handleId: hitId, lastX: event.x, lastY: event.y };
        }
        break;
      }
      case 'drag':
      case 'move': {
        if (this.active !== null) {
          const dx = event.x - this.active.lastX;
          const dy = event.y - this.active.lastY;
          this.active.lastX = event.x;
          this.active.lastY = event.y;
          if (dx !== 0 || dy !== 0) {
            this.onDrag({
              kind: 'delta',
              handleId: this.active.handleId,
              dx,
              dy,
            });
          }
        }
        break;
      }
      case 'up': {
        if (this.active !== null) {
          const handleId = this.active.handleId;
          this.active = null;
          this.onDrag({ kind: 'release', handleId });
        }
        break;
      }
      case 'scrollUp':
      case 'scrollDown': {
        // Scroll events don't affect drag state
        break;
      }
    }
  }
}
