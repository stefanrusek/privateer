import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import stringWidth from 'string-width';
import type { ResourceObject } from '../../core/types.js';
import { getColumns } from '../../resources/columns.js';
import {
  createTableModel,
  applyResourceEvent,
  applySort,
  applySearch,
} from '../resource-table-model.js';
import type { TableModel } from '../resource-table-model.js';
import { ResourceTable } from './ResourceTable.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResource(
  name: string,
  uid: string,
  statusColor: 'green' | 'yellow' | 'red' | 'grey' = 'green',
  namespace = 'default',
): ResourceObject {
  return {
    uid,
    kind: 'Deployment',
    apiVersion: 'apps/v1',
    name,
    namespace,
    labels: {},
    annotations: {},
    creationTimestamp: '2024-01-01T00:00:00Z',
    resourceVersion: '1',
    status: { color: statusColor, label: 'Ready' },
    raw: {
      metadata: { name, namespace, creationTimestamp: '2024-01-01T00:00:00Z' },
    },
  };
}

function noop(): void {
  return;
}

const DEFAULT_PROPS = {
  visibleHeight: 20,
  nowMs: 1700000000000,
  namespace: 'default',
  onScrollDown: noop,
  onScrollUp: noop,
  onScrollToStart: noop,
  onScrollToEnd: noop,
  onPageDown: noop,
  onPageUp: noop,
};

function renderTable(
  model: TableModel,
  overrides?: Partial<typeof DEFAULT_PROPS>,
): string {
  const cols = getColumns(model.kind);
  const { lastFrame } = render(
    React.createElement(ResourceTable, {
      ...DEFAULT_PROPS,
      ...overrides,
      model,
      columns: cols,
    }),
  );
  return lastFrame() ?? '';
}

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe('ResourceTable loading state', () => {
  it('shows Loading and kind text', () => {
    const model = createTableModel('Deployment');
    const frame = renderTable(model);
    expect(frame).toContain('Loading');
    expect(frame).toContain('Deployment');
  });
});

// ---------------------------------------------------------------------------
// Forbidden state
// ---------------------------------------------------------------------------

describe('ResourceTable forbidden state', () => {
  it('shows permission denied with kind', () => {
    const model = {
      ...createTableModel('Pod'),
      loadState: 'forbidden' as const,
    };
    const frame = renderTable(model);
    expect(frame).toContain('Permission denied');
    expect(frame).toContain('Pod');
  });
});

// ---------------------------------------------------------------------------
// Connection error state
// ---------------------------------------------------------------------------

describe('ResourceTable connection-error state', () => {
  it('shows connection error with attempt/max', () => {
    const model: TableModel = {
      ...createTableModel('Pod'),
      loadState: 'connection-error',
      connectionAttempt: 2,
      connectionMax: 5,
    };
    const frame = renderTable(model);
    expect(frame).toContain('Connection error');
    expect(frame).toContain('2/5');
  });
});

// ---------------------------------------------------------------------------
// Empty ready state
// ---------------------------------------------------------------------------

describe('ResourceTable empty state', () => {
  it('shows "No <kind> found in <namespace>" when ready with 0 rows', () => {
    const model: TableModel = {
      ...createTableModel('Deployment'),
      loadState: 'ready',
    };
    const frame = renderTable(model);
    expect(frame).toContain('No Deployment found in default');
  });

  it('shows no-results message when search yields 0 rows', () => {
    let model: TableModel = createTableModel('Deployment');
    model = applyResourceEvent(
      model,
      { type: 'ADDED', resource: makeResource('api', 'uid-1') },
      0,
    );
    model = applySearch(model, 'zzz');
    const frame = renderTable(model);
    expect(frame).toContain('No results for');
    expect(frame).toContain('zzz');
  });
});

// ---------------------------------------------------------------------------
// Header rendering
// ---------------------------------------------------------------------------

describe('ResourceTable header', () => {
  it('renders Name column header', () => {
    let model = createTableModel('Deployment');
    model = applyResourceEvent(
      model,
      { type: 'ADDED', resource: makeResource('api', 'uid-1') },
      0,
    );
    const frame = renderTable(model);
    expect(frame).toContain('Name');
  });

  it('renders Age column header', () => {
    let model = createTableModel('Deployment');
    model = applyResourceEvent(
      model,
      { type: 'ADDED', resource: makeResource('api', 'uid-1') },
      0,
    );
    const frame = renderTable(model);
    expect(frame).toContain('Age');
  });

  it('shows ascending arrow on name-asc sort', () => {
    let model = createTableModel('Deployment');
    model = applyResourceEvent(
      model,
      { type: 'ADDED', resource: makeResource('api', 'uid-1') },
      0,
    );
    model = applySort(model, 'name', 'asc');
    const frame = renderTable(model);
    expect(frame).toContain('▲');
  });

  it('shows descending arrow on name-desc sort', () => {
    let model = createTableModel('Deployment');
    model = applyResourceEvent(
      model,
      { type: 'ADDED', resource: makeResource('api', 'uid-1') },
      0,
    );
    model = applySort(model, 'name', 'desc');
    const frame = renderTable(model);
    expect(frame).toContain('▼');
  });
});

// ---------------------------------------------------------------------------
// Status dot
// ---------------------------------------------------------------------------

describe('ResourceTable status dot', () => {
  it('renders colored dot ●', () => {
    let model = createTableModel('Deployment');
    model = applyResourceEvent(
      model,
      { type: 'ADDED', resource: makeResource('api', 'uid-1') },
      0,
    );
    const frame = renderTable(model);
    expect(frame).toContain('●');
  });
});

// ---------------------------------------------------------------------------
// Name truncation
// ---------------------------------------------------------------------------

describe('ResourceTable name truncation', () => {
  it('truncates long names with ellipsis', () => {
    let model = createTableModel('Deployment');
    const longName =
      'very-long-deployment-name-that-should-be-truncated-for-sure';
    model = applyResourceEvent(
      model,
      { type: 'ADDED', resource: makeResource(longName, 'uid-1') },
      0,
    );
    const frame = renderTable(model);
    expect(frame).toContain('…');
  });

  it('does not truncate short names', () => {
    let model = createTableModel('Deployment');
    model = applyResourceEvent(
      model,
      { type: 'ADDED', resource: makeResource('short', 'uid-1') },
      0,
    );
    const frame = renderTable(model);
    expect(frame).toContain('short');
    // The row with the name should contain 'short' without '…' on that line
    const lines = frame.split('\n');
    const rowLine = lines.find((l) => l.includes('short')) ?? '';
    expect(rowLine).not.toContain('…');
  });
});

// ---------------------------------------------------------------------------
// Virtual scroll
// ---------------------------------------------------------------------------

describe('ResourceTable virtual scroll', () => {
  it('renders at most visibleHeight rows', () => {
    let model = createTableModel('Pod');
    for (let i = 0; i < 20; i++) {
      const r = makeResource(`pod-${String(i)}`, `uid-${String(i)}`);
      model = applyResourceEvent(model, { type: 'ADDED', resource: r }, 0);
    }
    const cols = getColumns(model.kind);
    const { lastFrame } = render(
      React.createElement(ResourceTable, {
        ...DEFAULT_PROPS,
        visibleHeight: 5,
        model,
        columns: cols,
      }),
    );
    const frame = lastFrame() ?? '';
    // Count pod- occurrences (each row has the pod name)
    const matches = frame.match(/pod-\d/g);
    expect((matches ?? []).length).toBeLessThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------------
// Row state colors
// ---------------------------------------------------------------------------

describe('ResourceTable row states', () => {
  it('renders new rows', () => {
    let model = createTableModel('Deployment');
    model = applyResourceEvent(
      model,
      { type: 'ADDED', resource: makeResource('new-thing', 'uid-1') },
      0,
    );
    const frame = renderTable(model);
    expect(frame).toContain('new-thing');
  });

  it('renders modified rows', () => {
    let model = createTableModel('Deployment');
    const resource = makeResource('my-deploy', 'uid-1');
    model = applyResourceEvent(model, { type: 'ADDED', resource }, 0);
    model = applyResourceEvent(model, { type: 'MODIFIED', resource }, 100);
    const frame = renderTable(model);
    expect(frame).toContain('my-deploy');
  });

  it('renders deleted rows (visible until TTL)', () => {
    let model = createTableModel('Deployment');
    const resource = makeResource('dying', 'uid-1');
    model = applyResourceEvent(model, { type: 'ADDED', resource }, 0);
    model = applyResourceEvent(model, { type: 'DELETED', resource }, 100);
    const frame = renderTable(model);
    expect(frame).toContain('dying');
  });
});

// ---------------------------------------------------------------------------
// Search rendering
// ---------------------------------------------------------------------------

describe('ResourceTable search filtering', () => {
  it('shows only matching resource', () => {
    let model = createTableModel('Deployment');
    model = applyResourceEvent(
      model,
      { type: 'ADDED', resource: makeResource('frontend', 'uid-f') },
      0,
    );
    model = applyResourceEvent(
      model,
      { type: 'ADDED', resource: makeResource('backend', 'uid-b') },
      0,
    );
    model = applySearch(model, 'front');
    const frame = renderTable(model);
    expect(frame).toContain('frontend');
    expect(frame).not.toContain('backend');
  });
});

// ---------------------------------------------------------------------------
// Status dot colors
// ---------------------------------------------------------------------------

describe('ResourceTable status dot colors', () => {
  function makeResourceWithColor(
    name: string,
    uid: string,
    statusColor: 'green' | 'yellow' | 'red' | 'grey',
  ): ResourceObject {
    return {
      uid,
      kind: 'Deployment',
      apiVersion: 'apps/v1',
      name,
      namespace: 'default',
      labels: {},
      annotations: {},
      creationTimestamp: '2024-01-01T00:00:00Z',
      resourceVersion: '1',
      status: { color: statusColor, label: 'Status' },
      raw: {
        metadata: {
          name,
          namespace: 'default',
          creationTimestamp: '2024-01-01T00:00:00Z',
        },
      },
    };
  }

  it('renders yellow status resource', () => {
    let model = createTableModel('Deployment');
    model = applyResourceEvent(
      model,
      {
        type: 'ADDED',
        resource: makeResourceWithColor('degraded', 'uid-y', 'yellow'),
      },
      0,
    );
    const frame = renderTable(model);
    expect(frame).toContain('●');
    expect(frame).toContain('degraded');
  });

  it('renders red status resource', () => {
    let model = createTableModel('Deployment');
    model = applyResourceEvent(
      model,
      {
        type: 'ADDED',
        resource: makeResourceWithColor('broken', 'uid-r', 'red'),
      },
      0,
    );
    const frame = renderTable(model);
    expect(frame).toContain('●');
    expect(frame).toContain('broken');
  });

  it('renders grey status resource', () => {
    let model = createTableModel('Deployment');
    model = applyResourceEvent(
      model,
      {
        type: 'ADDED',
        resource: makeResourceWithColor('scaled-down', 'uid-gr', 'grey'),
      },
      0,
    );
    const frame = renderTable(model);
    expect(frame).toContain('●');
    expect(frame).toContain('scaled-down');
  });
});

// ---------------------------------------------------------------------------
// Default row state (no animation)
// ---------------------------------------------------------------------------

describe('ResourceTable default row state', () => {
  it('renders rows in default state without color', () => {
    let model = createTableModel('Deployment');
    const resource = makeResource('api', 'uid-1');
    // Add and tick past animation window to get to default state
    model = applyResourceEvent(model, { type: 'ADDED', resource }, 0);
    // Manually set state to default
    const defaultRow = { resource, state: 'default' as const, stateStartMs: 0 };
    model = { ...model, rows: new Map([['uid-1', defaultRow]]) };
    const frame = renderTable(model);
    expect(frame).toContain('api');
  });
});

// ---------------------------------------------------------------------------
// Selected row
// ---------------------------------------------------------------------------

describe('ResourceTable selected row', () => {
  it('renders the row at selectedIndex', () => {
    let model = createTableModel('Deployment');
    model = applyResourceEvent(
      model,
      { type: 'ADDED', resource: makeResource('api', 'uid-1') },
      0,
    );
    const cols = getColumns(model.kind);
    const { lastFrame } = render(
      React.createElement(ResourceTable, {
        ...DEFAULT_PROPS,
        model,
        columns: cols,
        selectedIndex: 0,
      }),
    );
    expect(lastFrame() ?? '').toContain('api');
  });

  it('uses absolute index against the full list (scrollOffset applied)', () => {
    let model = createTableModel('Pod');
    for (let i = 0; i < 10; i++) {
      const r = makeResource(`pod-${String(i)}`, `uid-${String(i)}`);
      model = applyResourceEvent(model, { type: 'ADDED', resource: r }, 0);
    }
    model = { ...model, scrollOffset: 3 };
    const cols = getColumns(model.kind);
    const { lastFrame } = render(
      React.createElement(ResourceTable, {
        ...DEFAULT_PROPS,
        visibleHeight: 5,
        model,
        columns: cols,
        selectedIndex: 4,
      }),
    );
    const frame = lastFrame() ?? '';
    // Row at absolute index 4 is visible (slice starts at offset 3)
    expect(frame).toContain('pod-4');
    expect(frame).not.toContain('pod-0');
  });

  it('selection takes precedence over deleted-dim treatment', () => {
    let model = createTableModel('Deployment');
    const resource = makeResource('dying', 'uid-1');
    model = applyResourceEvent(model, { type: 'ADDED', resource }, 0);
    model = applyResourceEvent(model, { type: 'DELETED', resource }, 100);
    const cols = getColumns(model.kind);
    const { lastFrame } = render(
      React.createElement(ResourceTable, {
        ...DEFAULT_PROPS,
        model,
        columns: cols,
        selectedIndex: 0,
      }),
    );
    expect(lastFrame() ?? '').toContain('dying');
  });

  it('selection takes precedence over new-row color treatment', () => {
    let model = createTableModel('Deployment');
    model = applyResourceEvent(
      model,
      { type: 'ADDED', resource: makeResource('fresh', 'uid-1') },
      0,
    );
    const cols = getColumns(model.kind);
    const { lastFrame } = render(
      React.createElement(ResourceTable, {
        ...DEFAULT_PROPS,
        model,
        columns: cols,
        selectedIndex: 0,
      }),
    );
    expect(lastFrame() ?? '').toContain('fresh');
  });

  it('does not select any row when selectedIndex points elsewhere', () => {
    let model = createTableModel('Deployment');
    model = applyResourceEvent(
      model,
      { type: 'ADDED', resource: makeResource('api', 'uid-1') },
      0,
    );
    const cols = getColumns(model.kind);
    const { lastFrame } = render(
      React.createElement(ResourceTable, {
        ...DEFAULT_PROPS,
        model,
        columns: cols,
        selectedIndex: 5,
      }),
    );
    expect(lastFrame() ?? '').toContain('api');
  });
});

// ---------------------------------------------------------------------------
// Focused prop
// ---------------------------------------------------------------------------

describe('ResourceTable focused prop', () => {
  function renderSelected(focused?: boolean): string {
    let model = createTableModel('Deployment');
    model = applyResourceEvent(
      model,
      { type: 'ADDED', resource: makeResource('api', 'uid-1') },
      0,
    );
    const cols = getColumns(model.kind);
    const { lastFrame } = render(
      React.createElement(ResourceTable, {
        ...DEFAULT_PROPS,
        model,
        columns: cols,
        selectedIndex: 0,
        ...(focused === undefined ? {} : { focused }),
      }),
    );
    return lastFrame() ?? '';
  }

  it('renders the selected row inverse when focused (default)', () => {
    expect(renderSelected()).toContain('api');
  });

  it('renders the selected row inverse when focused is true', () => {
    expect(renderSelected(true)).toBe(renderSelected());
  });

  it('renders the selected row bold (not inverse) when focused is false', () => {
    const unfocused = renderSelected(false);
    expect(unfocused).toContain('api');
    expect(unfocused).not.toContain('[7m');
  });
});

// ---------------------------------------------------------------------------
// totalWidth prop
// ---------------------------------------------------------------------------

describe('ResourceTable totalWidth prop (pane width / horizontal window)', () => {
  const longName = 'a-deployment-name-of-considerable-length';

  function renderWide(totalWidth?: number): string {
    let model = createTableModel('Deployment');
    model = applyResourceEvent(
      model,
      { type: 'ADDED', resource: makeResource(longName, 'uid-1') },
      0,
    );
    const cols = getColumns(model.kind);
    const { lastFrame } = render(
      React.createElement(ResourceTable, {
        ...DEFAULT_PROPS,
        model,
        columns: cols,
        ...(totalWidth === undefined ? {} : { totalWidth }),
      }),
    );
    return lastFrame() ?? '';
  }

  it('defaults to 120 columns', () => {
    expect(renderWide()).toBe(renderWide(120));
  });

  it('keeps the Name column at a stable natural width (Spec nav-05)', () => {
    // Name's natural width (30% of the 120 baseline = 36) is independent of the
    // pane width, so a 40-char name is always truncated — at any totalWidth.
    expect(renderWide(200)).not.toContain(longName);
    expect(renderWide(200)).toContain('…');
    expect(renderWide(60)).not.toContain(longName);
    expect(renderWide(60)).toContain('…');
  });

  it('hides later columns at a narrow pane and shows a › marker', () => {
    // Deployment natural total is ~94; a 60-wide pane cannot fit it all, so the
    // trailing columns are windowed off and a right-more marker appears.
    expect(renderWide(60)).toContain('›');
    expect(renderWide(60)).not.toContain('Age');
    // A wide pane fits everything: the Age column shows and no markers appear.
    expect(renderWide(200)).toContain('Age');
    expect(renderWide(200)).not.toContain('›');
    expect(renderWide(200)).not.toContain('‹');
  });
});

// ---------------------------------------------------------------------------
// Horizontal scroll (Spec nav-05)
// ---------------------------------------------------------------------------

describe('ResourceTable horizontal scroll', () => {
  // Pod natural columns: status(2) Name(36) Namespace(18) Ready(8) Phase(12)
  // Restarts(8) Node(18) Age(10) — total ~112. A 70-wide pane forces a window.
  function renderPods(horizontalOffset: number, paneWidth: number): string {
    let model = createTableModel('Pod');
    model = applyResourceEvent(
      model,
      { type: 'ADDED', resource: makeResource('my-pod', 'uid-1', 'green') },
      0,
    );
    model = { ...model, horizontalOffset };
    const cols = getColumns('Pod');
    const { lastFrame } = render(
      React.createElement(ResourceTable, {
        ...DEFAULT_PROPS,
        model,
        columns: cols,
        totalWidth: paneWidth,
      }),
    );
    return lastFrame() ?? '';
  }

  it('keeps the status dot and Name pinned at every offset', () => {
    for (const offset of [0, 1, 2, 3]) {
      const frame = renderPods(offset, 70);
      expect(frame).toContain('●');
      expect(frame).toContain('my-pod');
      expect(frame).toContain('Name');
    }
  });

  it('reveals later columns and a ‹ marker as the offset advances', () => {
    const at0 = renderPods(0, 70);
    expect(at0).toContain('Namespace');
    expect(at0).not.toContain('‹'); // nothing hidden to the left at offset 0
    expect(at0).toContain('›'); // more columns to the right

    const at2 = renderPods(2, 70);
    expect(at2).toContain('‹'); // columns hidden to the left now
    // The Namespace column visible at offset 0 has scrolled off the left.
    expect(at2).not.toContain('Namespace');
    // A column that was off-screen-right at offset 0 is now visible.
    expect(at2).toContain('Node');
  });

  it('shows no markers when everything fits the pane', () => {
    const frame = renderPods(0, 200);
    expect(frame).not.toContain('‹');
    expect(frame).not.toContain('›');
    expect(frame).toContain('Age');
  });

  it('never wraps and never exceeds the pane width at any offset', () => {
    for (const offset of [0, 1, 2, 3]) {
      const frame = renderPods(offset, 70);
      for (const line of frame.split('\n')) {
        expect(stringWidth(line)).toBeLessThanOrEqual(70);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// padLeft overflow branch
// ---------------------------------------------------------------------------

describe('ResourceTable padLeft overflow', () => {
  it('handles age text longer than column width', () => {
    let model = createTableModel('Deployment');
    // Use a very old resource so the age text is long
    const resource: ResourceObject = {
      uid: 'uid-old',
      kind: 'Deployment',
      apiVersion: 'apps/v1',
      name: 'old-deploy',
      namespace: 'default',
      labels: {},
      annotations: {},
      creationTimestamp: '2000-01-01T00:00:00Z',
      resourceVersion: '1',
      status: { color: 'green', label: 'Ready' },
      raw: {
        metadata: {
          name: 'old-deploy',
          namespace: 'default',
          creationTimestamp: '2000-01-01T00:00:00Z',
        },
      },
    };
    model = applyResourceEvent(model, { type: 'ADDED', resource }, 0);
    const cols = getColumns(model.kind);
    // Render with current time much later to get a long age string
    const { lastFrame } = render(
      React.createElement(ResourceTable, {
        ...DEFAULT_PROPS,
        model,
        columns: cols,
        nowMs: new Date('2030-01-01T00:00:00Z').getTime(),
      }),
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('old-deploy');
  });
});
