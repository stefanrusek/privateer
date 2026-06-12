import { describe, it, expect, vi } from 'vitest';
import { DragTracker } from './drag.js';
import type { DragEvent } from './drag.js';
import { HitTestRegistry } from './hit-testing.js';
import type { MouseEvent } from './mouse.js';

function makeTracker(): {
  tracker: DragTracker;
  registry: HitTestRegistry;
  events: DragEvent[];
} {
  const registry = new HitTestRegistry();
  const events: DragEvent[] = [];
  const tracker = new DragTracker(registry, (e) => events.push(e));
  return { tracker, registry, events };
}

function mouseDown(x: number, y: number): MouseEvent {
  return {
    type: 'down',
    button: 0,
    x,
    y,
    shift: false,
    meta: false,
    ctrl: false,
  };
}

function mouseMove(x: number, y: number): MouseEvent {
  return {
    type: 'move',
    button: 0,
    x,
    y,
    shift: false,
    meta: false,
    ctrl: false,
  };
}

function mouseDrag(x: number, y: number): MouseEvent {
  return {
    type: 'drag',
    button: 0,
    x,
    y,
    shift: false,
    meta: false,
    ctrl: false,
  };
}

function mouseUp(x: number, y: number): MouseEvent {
  return {
    type: 'up',
    button: 0,
    x,
    y,
    shift: false,
    meta: false,
    ctrl: false,
  };
}

function scrollUp(x: number, y: number): MouseEvent {
  return {
    type: 'scrollUp',
    button: 0,
    x,
    y,
    shift: false,
    meta: false,
    ctrl: false,
  };
}

function scrollDown(x: number, y: number): MouseEvent {
  return {
    type: 'scrollDown',
    button: 0,
    x,
    y,
    shift: false,
    meta: false,
    ctrl: false,
  };
}

describe('DragTracker', () => {
  it('emits no events when mouse down is outside any registered region', () => {
    const { tracker, events } = makeTracker();
    tracker.feed(mouseDown(5, 5));
    expect(events).toHaveLength(0);
  });

  it('emits a delta event when dragging a registered handle', () => {
    const { tracker, registry, events } = makeTracker();
    registry.register({
      id: 'handle',
      x: 10,
      y: 10,
      width: 5,
      height: 5,
      z: 1,
    });
    tracker.feed(mouseDown(12, 12));
    tracker.feed(mouseMove(15, 14));
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      kind: 'delta',
      handleId: 'handle',
      dx: 3,
      dy: 2,
    });
  });

  it('emits a release event on mouse up after a drag', () => {
    const { tracker, registry, events } = makeTracker();
    registry.register({
      id: 'handle',
      x: 10,
      y: 10,
      width: 5,
      height: 5,
      z: 1,
    });
    tracker.feed(mouseDown(12, 12));
    tracker.feed(mouseUp(15, 14));
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ kind: 'release', handleId: 'handle' });
  });

  it('emits cumulative deltas over multiple motion events', () => {
    const { tracker, registry, events } = makeTracker();
    registry.register({
      id: 'handle',
      x: 0,
      y: 0,
      width: 20,
      height: 20,
      z: 1,
    });
    tracker.feed(mouseDown(5, 5));
    tracker.feed(mouseMove(6, 6));
    tracker.feed(mouseMove(8, 9));
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({
      kind: 'delta',
      handleId: 'handle',
      dx: 1,
      dy: 1,
    });
    expect(events[1]).toEqual({
      kind: 'delta',
      handleId: 'handle',
      dx: 2,
      dy: 3,
    });
  });

  it('does not emit a delta when position has not changed', () => {
    const { tracker, registry, events } = makeTracker();
    registry.register({
      id: 'handle',
      x: 0,
      y: 0,
      width: 20,
      height: 20,
      z: 1,
    });
    tracker.feed(mouseDown(5, 5));
    tracker.feed(mouseMove(5, 5));
    expect(events).toHaveLength(0);
  });

  it('handles drag-type motion events as well as move', () => {
    const { tracker, registry, events } = makeTracker();
    registry.register({
      id: 'handle',
      x: 0,
      y: 0,
      width: 20,
      height: 20,
      z: 1,
    });
    tracker.feed(mouseDown(5, 5));
    tracker.feed(mouseDrag(7, 8));
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      kind: 'delta',
      handleId: 'handle',
      dx: 2,
      dy: 3,
    });
  });

  it('emits nothing on up if no drag is active', () => {
    const { tracker, events } = makeTracker();
    tracker.feed(mouseUp(5, 5));
    expect(events).toHaveLength(0);
  });

  it('emits nothing on motion if no drag is active', () => {
    const { tracker, events } = makeTracker();
    tracker.feed(mouseMove(5, 5));
    expect(events).toHaveLength(0);
  });

  it('ignores scroll events while dragging', () => {
    const { tracker, registry, events } = makeTracker();
    registry.register({
      id: 'handle',
      x: 0,
      y: 0,
      width: 20,
      height: 20,
      z: 1,
    });
    tracker.feed(mouseDown(5, 5));
    tracker.feed(scrollUp(5, 5));
    tracker.feed(scrollDown(5, 5));
    tracker.feed(mouseMove(8, 8));
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      kind: 'delta',
      handleId: 'handle',
      dx: 3,
      dy: 3,
    });
  });

  it('does not start a new drag after release until next press', () => {
    const { tracker, registry, events } = makeTracker();
    registry.register({
      id: 'handle',
      x: 0,
      y: 0,
      width: 20,
      height: 20,
      z: 1,
    });
    tracker.feed(mouseDown(5, 5));
    tracker.feed(mouseUp(5, 5));
    events.length = 0; // clear
    tracker.feed(mouseMove(8, 8));
    expect(events).toHaveLength(0);
  });

  it('accepts an onDrag callback with vi.fn()', () => {
    const registry = new HitTestRegistry();
    registry.register({ id: 'h', x: 0, y: 0, width: 10, height: 10, z: 1 });
    const cb = vi.fn<(e: DragEvent) => void>();
    const tracker = new DragTracker(registry, (e) => {
      cb(e);
    });
    tracker.feed(mouseDown(5, 5));
    tracker.feed(mouseMove(7, 7));
    expect(cb).toHaveBeenCalledOnce();
    expect(cb.mock.calls[0]?.[0]).toEqual({
      kind: 'delta',
      handleId: 'h',
      dx: 2,
      dy: 2,
    });
  });
});
