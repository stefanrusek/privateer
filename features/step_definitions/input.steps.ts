import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { parseSgrMouse } from '../../src/input/mouse.js';
import type { MouseEvent } from '../../src/input/mouse.js';
import { HitTestRegistry } from '../../src/input/hit-testing.js';
import { DragTracker } from '../../src/input/drag.js';
import type { DragEvent } from '../../src/input/drag.js';
import {
  parseKeys,
  KeySequenceBuffer,
  ModalState,
} from '../../src/input/keyboard.js';
import type { Key } from '../../src/input/keyboard.js';
import { FakeClock } from '../../src/boundaries/clock.fake.js';

// ---------------------------------------------------------------------------
// Shared state (per scenario, isolated by Cucumber world reset)
// ---------------------------------------------------------------------------

let lastMouseEvent: MouseEvent | null = null;
let registry: HitTestRegistry = new HitTestRegistry();
let hitResult: string | null = null;
let dragEvents: DragEvent[] = [];
let dragTracker: DragTracker = new DragTracker(registry, (e) =>
  dragEvents.push(e),
);
let fakeClock: FakeClock = new FakeClock();
let keyBuffer: KeySequenceBuffer;
let emittedKeys: Key[] = [];
let firedSequences: string[] = [];
let modalState: ModalState = new ModalState();

// ---------------------------------------------------------------------------
// Helper: substitute escape / control abbreviations used in feature files
// ---------------------------------------------------------------------------

function expand(raw: string): string {
  return raw
    .replace(/<ESC>/g, '\x1b')
    .replace(/<CR>/g, '\r')
    .replace(/<TAB>/g, '\t')
    .replace(/<DEL>/g, '\x7f')
    .replace(/<ETX>/g, '\x03') // Ctrl+C
    .replace(/<ACK>/g, '\x06') // Ctrl+F
    .replace(/<STX>/g, '\x02') // Ctrl+B
    .replace(/<DC3>/g, '\x13'); // Ctrl+S
}

// ---------------------------------------------------------------------------
// Mouse / SGR parsing steps
// ---------------------------------------------------------------------------

Given('the mouse parser is initialized', function () {
  lastMouseEvent = null;
});

When('I receive the SGR sequence {string}', function (rawSeq: string) {
  lastMouseEvent = parseSgrMouse(expand(rawSeq));
});

Then('the parsed mouse event has type {string}', function (type: string) {
  assert.ok(lastMouseEvent !== null, 'expected a parsed mouse event, got null');
  assert.equal(lastMouseEvent.type, type);
});

Then('the parsed mouse event has button {int}', function (button: number) {
  assert.ok(lastMouseEvent !== null, 'expected a parsed mouse event, got null');
  assert.equal(lastMouseEvent.button, button);
});

Then(
  'the parsed mouse event has x {int} and y {int}',
  function (x: number, y: number) {
    assert.ok(
      lastMouseEvent !== null,
      'expected a parsed mouse event, got null',
    );
    assert.equal(lastMouseEvent.x, x);
    assert.equal(lastMouseEvent.y, y);
  },
);

Then('the parsed mouse event has shift {word}', function (val: string) {
  assert.ok(lastMouseEvent !== null, 'expected a parsed mouse event, got null');
  assert.equal(lastMouseEvent.shift, val === 'true');
});

Then('the parsed mouse event is null', function () {
  assert.equal(lastMouseEvent, null);
});

// ---------------------------------------------------------------------------
// Hit-testing steps
// ---------------------------------------------------------------------------

function clearHitRegistry(): void {
  registry = new HitTestRegistry();
  dragEvents = [];
  dragTracker = new DragTracker(registry, (e) => dragEvents.push(e));
  hitResult = null;
}

// Cucumber requires distinct string/regex per keyword; use a shared helper to avoid duplication
Given('the hit-test registry is cleared', clearHitRegistry);
When('the hit-test registry is reset', clearHitRegistry);

Given(
  'region {string} is registered at x {int} y {int} width {int} height {int} z {int}',
  function (
    id: string,
    x: number,
    y: number,
    width: number,
    height: number,
    z: number,
  ) {
    registry.register({ id, x, y, width, height, z });
  },
);

When('I hit-test point x {int} y {int}', function (x: number, y: number) {
  hitResult = registry.hitTest({ x, y });
});

Then('the hit-test result is {string}', function (expected: string) {
  assert.equal(hitResult, expected);
});

Then('the hit-test result is null', function () {
  assert.equal(hitResult, null);
});

// ---------------------------------------------------------------------------
// Drag tracking steps
// ---------------------------------------------------------------------------

Given('the drag tracker is initialized', function () {
  registry = new HitTestRegistry();
  dragEvents = [];
  dragTracker = new DragTracker(registry, (e) => dragEvents.push(e));
});

Given(
  'region {string} is registered as a drag handle at x {int} y {int} width {int} height {int}',
  function (id: string, x: number, y: number, width: number, height: number) {
    registry.register({ id, x, y, width, height, z: 1 });
  },
);

When('a mouse down event at x {int} y {int}', function (x: number, y: number) {
  dragTracker.feed({
    type: 'down',
    button: 0,
    x,
    y,
    shift: false,
    meta: false,
    ctrl: false,
  });
});

When('a mouse move event at x {int} y {int}', function (x: number, y: number) {
  dragTracker.feed({
    type: 'move',
    button: 0,
    x,
    y,
    shift: false,
    meta: false,
    ctrl: false,
  });
});

When('a mouse up event at x {int} y {int}', function (x: number, y: number) {
  dragTracker.feed({
    type: 'up',
    button: 0,
    x,
    y,
    shift: false,
    meta: false,
    ctrl: false,
  });
});

Then(
  'a drag delta event is emitted with dx {int} dy {int}',
  function (dx: number, dy: number) {
    const delta = dragEvents.find((e) => e.kind === 'delta');
    assert.ok(delta !== undefined, 'expected a delta drag event');
    assert.equal(delta.dx, dx);
    assert.equal(delta.dy, dy);
  },
);

Then('a drag release event is emitted', function () {
  const release = dragEvents.find((e) => e.kind === 'release');
  assert.ok(release !== undefined, 'expected a drag release event');
});

// ---------------------------------------------------------------------------
// Keyboard parsing steps
// ---------------------------------------------------------------------------

Given('the keyboard parser is initialized with a fake clock', function () {
  fakeClock = new FakeClock();
  emittedKeys = [];
  firedSequences = [];
  modalState = new ModalState();
  keyBuffer = new KeySequenceBuffer(fakeClock, (k) => emittedKeys.push(k));
  keyBuffer.registerSequence(['g', 'g'], () => firedSequences.push('gg'));
});

When('I receive the key bytes {string}', function (rawBytes: string) {
  const parsed = parseKeys(expand(rawBytes));
  for (const key of parsed) {
    emittedKeys.push(key);
  }
});

Then('the parsed key event has key {string}', function (expected: string) {
  const last = emittedKeys[emittedKeys.length - 1];
  assert.ok(last !== undefined, 'expected at least one key event');
  assert.equal(last.key, expected);
});

Then('the parsed key event is not a special key', function () {
  const last = emittedKeys[emittedKeys.length - 1];
  assert.ok(last !== undefined, 'expected at least one key event');
  assert.equal(last.ctrl, false);
  assert.equal(last.shift, false);
});

Then('the parsed key event has shift {word}', function (val: string) {
  const last = emittedKeys[emittedKeys.length - 1];
  assert.ok(last !== undefined, 'expected at least one key event');
  assert.equal(last.shift, val === 'true');
});

Then('the parsed key event has ctrl {word}', function (val: string) {
  const last = emittedKeys[emittedKeys.length - 1];
  assert.ok(last !== undefined, 'expected at least one key event');
  assert.equal(last.ctrl, val === 'true');
});

// ---------------------------------------------------------------------------
// Key sequence buffer steps
// ---------------------------------------------------------------------------

When('I press key {string}', function (key: string) {
  keyBuffer.feed({ key, ctrl: false, shift: false, meta: false });
});

When('I advance the clock by {int} ms', function (ms: number) {
  fakeClock.advance(ms);
});

Then('the key sequence {string} fires', function (seq: string) {
  assert.ok(
    firedSequences.includes(seq),
    `expected sequence "${seq}" to fire; fired: ${JSON.stringify(firedSequences)}`,
  );
});

Then('the key sequence {string} does not fire', function (seq: string) {
  assert.ok(
    !firedSequences.includes(seq),
    `expected sequence "${seq}" NOT to fire`,
  );
});

Then('the single key {string} was emitted twice', function (key: string) {
  const count = emittedKeys.filter((k) => k.key === key).length;
  assert.equal(
    count,
    2,
    `expected key "${key}" to be emitted 2 times, got ${String(count)}`,
  );
});

Then('the single key {string} was emitted once', function (key: string) {
  const count = emittedKeys.filter((k) => k.key === key).length;
  assert.equal(
    count,
    1,
    `expected key "${key}" to be emitted 1 time, got ${String(count)}`,
  );
});

// ---------------------------------------------------------------------------
// Modal state steps
// ---------------------------------------------------------------------------

Given('the mode is {string}', function (mode: string) {
  modalState = new ModalState();
  if (mode !== 'normal') {
    modalState.transition(mode as 'search' | 'command' | 'edit');
  }
});

When('the mode transitions to {string}', function (mode: string) {
  modalState.transition(mode as 'normal' | 'search' | 'command' | 'edit');
});

Then('the current mode is {string}', function (expected: string) {
  assert.equal(modalState.mode, expected);
});
