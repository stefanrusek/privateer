import { describe, it, expect } from 'vitest';
import type { ResourceObject } from '../core/types.js';
import {
  createTableModel,
  applyResourceEvent,
  tickAnimations,
  getVisibleRows,
  getSortedFilteredRows,
  applySort,
  applySearch,
  scrollDown,
  scrollUp,
  scrollToStart,
  scrollToEnd,
} from './resource-table-model.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResource(
  name: string,
  uid: string,
  statusColor: 'green' | 'yellow' | 'red' | 'grey' = 'green',
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
    status: { color: statusColor, label: 'Ready' },
    raw: {},
  };
}

// ---------------------------------------------------------------------------
// createTableModel
// ---------------------------------------------------------------------------

describe('createTableModel', () => {
  it('creates a Pod model with status-asc defaults', () => {
    const model = createTableModel('Pod');
    expect(model.kind).toBe('Pod');
    expect(model.sortKey).toBe('status');
    expect(model.sortDir).toBe('asc');
    expect(model.loadState).toBe('loading');
    expect(model.rows.size).toBe(0);
    expect(model.scrollOffset).toBe(0);
    expect(model.search).toBe('');
    expect(model.connectionAttempt).toBe(0);
    expect(model.connectionMax).toBe(0);
  });

  it('creates a non-Pod model with name-asc defaults', () => {
    const model = createTableModel('Deployment');
    expect(model.sortKey).toBe('name');
    expect(model.sortDir).toBe('asc');
  });

  it('creates a Service model with name-asc defaults', () => {
    const model = createTableModel('Service');
    expect(model.sortKey).toBe('name');
    expect(model.sortDir).toBe('asc');
  });
});

// ---------------------------------------------------------------------------
// applyResourceEvent
// ---------------------------------------------------------------------------

describe('applyResourceEvent', () => {
  it('adds a new row with state "new" on ADDED', () => {
    const model = createTableModel('Deployment');
    const resource = makeResource('my-deploy', 'uid-1');
    const next = applyResourceEvent(model, { type: 'ADDED', resource }, 1000);
    expect(next.rows.size).toBe(1);
    const row = next.rows.get('uid-1');
    expect(row?.state).toBe('new');
    expect(row?.stateStartMs).toBe(1000);
    expect(next.loadState).toBe('ready');
  });

  it('marks existing row as "modified" on MODIFIED', () => {
    const model = createTableModel('Deployment');
    const resource = makeResource('my-deploy', 'uid-1');
    const after1 = applyResourceEvent(model, { type: 'ADDED', resource }, 0);
    const resource2 = makeResource('my-deploy', 'uid-1', 'yellow');
    const after2 = applyResourceEvent(
      after1,
      { type: 'MODIFIED', resource: resource2 },
      500,
    );
    const row = after2.rows.get('uid-1');
    expect(row?.state).toBe('modified');
    expect(row?.stateStartMs).toBe(500);
  });

  it('marks existing row as "deleted" on DELETED', () => {
    const model = createTableModel('Deployment');
    const resource = makeResource('my-deploy', 'uid-1');
    const after1 = applyResourceEvent(model, { type: 'ADDED', resource }, 0);
    const after2 = applyResourceEvent(
      after1,
      { type: 'DELETED', resource },
      1000,
    );
    const row = after2.rows.get('uid-1');
    expect(row?.state).toBe('deleted');
    expect(row?.stateStartMs).toBe(1000);
  });

  it('ignores DELETED for non-existent resource', () => {
    const model = createTableModel('Deployment');
    const resource = makeResource('ghost', 'uid-ghost');
    const next = applyResourceEvent(model, { type: 'DELETED', resource }, 0);
    expect(next.rows.size).toBe(0);
  });

  it('transitions loadState from loading to ready on ADDED', () => {
    const model = createTableModel('Deployment');
    expect(model.loadState).toBe('loading');
    const resource = makeResource('r1', 'uid-1');
    const next = applyResourceEvent(model, { type: 'ADDED', resource }, 0);
    expect(next.loadState).toBe('ready');
  });

  it('does not change non-loading loadState on DELETED', () => {
    let model = createTableModel('Deployment');
    const resource = makeResource('r1', 'uid-1');
    model = applyResourceEvent(model, { type: 'ADDED', resource }, 0);
    // Set to forbidden manually
    model = { ...model, loadState: 'forbidden' };
    const next = applyResourceEvent(model, { type: 'DELETED', resource }, 1);
    expect(next.loadState).toBe('forbidden');
  });

  it('keeps loadState as loading when DELETED on loading model without rows', () => {
    const model = createTableModel('Deployment');
    const resource = makeResource('ghost', 'uid-ghost');
    const next = applyResourceEvent(model, { type: 'DELETED', resource }, 0);
    expect(next.loadState).toBe('loading');
  });
});

// ---------------------------------------------------------------------------
// tickAnimations
// ---------------------------------------------------------------------------

describe('tickAnimations', () => {
  it('transitions "new" to "default" at 300ms', () => {
    let model = createTableModel('Deployment');
    const resource = makeResource('r1', 'uid-1');
    model = applyResourceEvent(model, { type: 'ADDED', resource }, 0);
    const ticked = tickAnimations(model, 300);
    expect(ticked.rows.get('uid-1')?.state).toBe('default');
  });

  it('does not transition "new" before 300ms', () => {
    let model = createTableModel('Deployment');
    const resource = makeResource('r1', 'uid-1');
    model = applyResourceEvent(model, { type: 'ADDED', resource }, 0);
    const ticked = tickAnimations(model, 299);
    expect(ticked.rows.get('uid-1')?.state).toBe('new');
  });

  it('transitions "modified" to "default" at 300ms', () => {
    let model = createTableModel('Deployment');
    const resource = makeResource('r1', 'uid-1');
    model = applyResourceEvent(model, { type: 'ADDED', resource }, 0);
    // Force stateStartMs=0 for modified test
    model = applyResourceEvent(
      {
        ...model,
        rows: new Map([
          ['uid-1', { resource, state: 'default', stateStartMs: 0 }],
        ]),
      },
      { type: 'MODIFIED', resource },
      0,
    );
    const ticked = tickAnimations(model, 300);
    expect(ticked.rows.get('uid-1')?.state).toBe('default');
  });

  it('removes "deleted" row at 500ms', () => {
    let model = createTableModel('Deployment');
    const resource = makeResource('r1', 'uid-1');
    model = applyResourceEvent(model, { type: 'ADDED', resource }, 0);
    model = applyResourceEvent(model, { type: 'DELETED', resource }, 0);
    const ticked = tickAnimations(model, 500);
    expect(ticked.rows.has('uid-1')).toBe(false);
  });

  it('does not remove "deleted" before 500ms', () => {
    let model = createTableModel('Deployment');
    const resource = makeResource('r1', 'uid-1');
    model = applyResourceEvent(model, { type: 'ADDED', resource }, 0);
    model = applyResourceEvent(model, { type: 'DELETED', resource }, 0);
    const ticked = tickAnimations(model, 499);
    expect(ticked.rows.has('uid-1')).toBe(true);
  });

  it('returns same model reference when nothing changed', () => {
    const model = createTableModel('Deployment');
    const result = tickAnimations(model, 1000);
    expect(result).toBe(model);
  });
});

// ---------------------------------------------------------------------------
// getSortedFilteredRows
// ---------------------------------------------------------------------------

describe('getSortedFilteredRows', () => {
  it('returns all rows sorted by name asc by default for Deployment', () => {
    let model = createTableModel('Deployment');
    model = applyResourceEvent(
      model,
      { type: 'ADDED', resource: makeResource('beta', 'uid-b') },
      0,
    );
    model = applyResourceEvent(
      model,
      { type: 'ADDED', resource: makeResource('alpha', 'uid-a') },
      0,
    );
    const rows = getSortedFilteredRows(model);
    expect(rows[0]?.resource.name).toBe('alpha');
    expect(rows[1]?.resource.name).toBe('beta');
  });

  it('sorts by name descending', () => {
    let model = createTableModel('Deployment');
    model = applySort(model, 'name', 'desc');
    model = applyResourceEvent(
      model,
      { type: 'ADDED', resource: makeResource('alpha', 'uid-a') },
      0,
    );
    model = applyResourceEvent(
      model,
      { type: 'ADDED', resource: makeResource('beta', 'uid-b') },
      0,
    );
    const rows = getSortedFilteredRows(model);
    expect(rows[0]?.resource.name).toBe('beta');
    expect(rows[1]?.resource.name).toBe('alpha');
  });

  it('sorts by status asc (red first)', () => {
    let model = createTableModel('Pod');
    // Pod defaults to status-asc
    model = applyResourceEvent(
      model,
      { type: 'ADDED', resource: makeResource('healthy', 'uid-g', 'green') },
      0,
    );
    model = applyResourceEvent(
      model,
      { type: 'ADDED', resource: makeResource('crasher', 'uid-r', 'red') },
      0,
    );
    model = applyResourceEvent(
      model,
      { type: 'ADDED', resource: makeResource('pending', 'uid-y', 'yellow') },
      0,
    );
    const rows = getSortedFilteredRows(model);
    expect(rows[0]?.resource.name).toBe('crasher');
    expect(rows[1]?.resource.name).toBe('pending');
    expect(rows[2]?.resource.name).toBe('healthy');
  });

  it('sorts by status desc (green first)', () => {
    let model = createTableModel('Pod');
    model = applySort(model, 'status', 'desc');
    model = applyResourceEvent(
      model,
      { type: 'ADDED', resource: makeResource('healthy', 'uid-g', 'green') },
      0,
    );
    model = applyResourceEvent(
      model,
      { type: 'ADDED', resource: makeResource('crasher', 'uid-r', 'red') },
      0,
    );
    const rows = getSortedFilteredRows(model);
    expect(rows[0]?.resource.name).toBe('healthy');
    expect(rows[1]?.resource.name).toBe('crasher');
  });

  it('secondary sort by name when status is equal', () => {
    let model = createTableModel('Pod');
    model = applyResourceEvent(
      model,
      { type: 'ADDED', resource: makeResource('z-pod', 'uid-z', 'red') },
      0,
    );
    model = applyResourceEvent(
      model,
      { type: 'ADDED', resource: makeResource('a-pod', 'uid-a', 'red') },
      0,
    );
    const rows = getSortedFilteredRows(model);
    expect(rows[0]?.resource.name).toBe('a-pod');
    expect(rows[1]?.resource.name).toBe('z-pod');
  });

  it('filters by search (case-insensitive)', () => {
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
    const rows = getSortedFilteredRows(model);
    expect(rows.length).toBe(1);
    expect(rows[0]?.resource.name).toBe('frontend');
  });

  it('search is case-insensitive', () => {
    let model = createTableModel('Deployment');
    model = applyResourceEvent(
      model,
      { type: 'ADDED', resource: makeResource('MyApp', 'uid-m') },
      0,
    );
    model = applyResourceEvent(
      model,
      { type: 'ADDED', resource: makeResource('other', 'uid-o') },
      0,
    );
    model = applySearch(model, 'myapp');
    const rows = getSortedFilteredRows(model);
    expect(rows.length).toBe(1);
    expect(rows[0]?.resource.name).toBe('MyApp');
  });

  it('returns empty when no search match', () => {
    let model = createTableModel('Deployment');
    model = applyResourceEvent(
      model,
      { type: 'ADDED', resource: makeResource('api', 'uid-1') },
      0,
    );
    model = applySearch(model, 'zzz');
    const rows = getSortedFilteredRows(model);
    expect(rows.length).toBe(0);
  });

  it('handles grey status in sort order', () => {
    let model = createTableModel('Pod');
    model = applyResourceEvent(
      model,
      { type: 'ADDED', resource: makeResource('grey-pod', 'uid-gr', 'grey') },
      0,
    );
    model = applyResourceEvent(
      model,
      { type: 'ADDED', resource: makeResource('red-pod', 'uid-r', 'red') },
      0,
    );
    const rows = getSortedFilteredRows(model);
    expect(rows[0]?.resource.name).toBe('red-pod');
    expect(rows[1]?.resource.name).toBe('grey-pod');
  });
});

// ---------------------------------------------------------------------------
// getVisibleRows
// ---------------------------------------------------------------------------

describe('getVisibleRows', () => {
  function makeModelWithN(n: number): ReturnType<typeof createTableModel> {
    let model = createTableModel('Pod');
    for (let i = 0; i < n; i++) {
      const resource = makeResource(
        `pod-${String(i).padStart(3, '0')}`,
        `uid-${String(i)}`,
      );
      model = applyResourceEvent(model, { type: 'ADDED', resource }, 0);
    }
    return model;
  }

  it('returns only visible rows based on offset and height', () => {
    const model = makeModelWithN(10);
    const visible = getVisibleRows(model, 2, 3);
    expect(visible.length).toBe(3);
  });

  it('returns fewer rows when near the end', () => {
    const model = makeModelWithN(5);
    const visible = getVisibleRows(model, 4, 10);
    expect(visible.length).toBe(1);
  });

  it('returns empty when offset beyond total rows', () => {
    const model = makeModelWithN(3);
    const visible = getVisibleRows(model, 10, 5);
    expect(visible.length).toBe(0);
  });

  it('returns all rows when height > total', () => {
    const model = makeModelWithN(3);
    const visible = getVisibleRows(model, 0, 100);
    expect(visible.length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// applySort / applySearch
// ---------------------------------------------------------------------------

describe('applySort', () => {
  it('updates sortKey and sortDir', () => {
    const model = createTableModel('Deployment');
    const updated = applySort(model, 'status', 'desc');
    expect(updated.sortKey).toBe('status');
    expect(updated.sortDir).toBe('desc');
  });
});

describe('applySearch', () => {
  it('updates search and resets scrollOffset', () => {
    let model = createTableModel('Deployment');
    model = { ...model, scrollOffset: 5 };
    const updated = applySearch(model, 'nginx');
    expect(updated.search).toBe('nginx');
    expect(updated.scrollOffset).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Scroll operations
// ---------------------------------------------------------------------------

describe('scrollDown', () => {
  function makeModelWithRows(n: number): ReturnType<typeof createTableModel> {
    let model = createTableModel('Deployment');
    for (let i = 0; i < n; i++) {
      const resource = makeResource(`r-${String(i)}`, `uid-${String(i)}`);
      model = applyResourceEvent(model, { type: 'ADDED', resource }, 0);
    }
    return model;
  }

  it('increments scrollOffset by delta', () => {
    const model = makeModelWithRows(10);
    const updated = scrollDown(model, 3);
    expect(updated.scrollOffset).toBe(3);
  });

  it('clamps at max (totalRows - 1)', () => {
    const model = makeModelWithRows(5);
    const updated = scrollDown(model, 100);
    expect(updated.scrollOffset).toBe(4);
  });

  it('clamps at 0 when no rows', () => {
    const model = createTableModel('Deployment');
    const updated = scrollDown(model, 5);
    expect(updated.scrollOffset).toBe(0);
  });
});

describe('scrollUp', () => {
  it('decrements scrollOffset by delta', () => {
    let model = createTableModel('Deployment');
    const resource = makeResource('r1', 'uid-1');
    model = applyResourceEvent(model, { type: 'ADDED', resource }, 0);
    model = { ...model, scrollOffset: 5 };
    const updated = scrollUp(model, 2);
    expect(updated.scrollOffset).toBe(3);
  });

  it('clamps at 0', () => {
    let model = createTableModel('Deployment');
    model = { ...model, scrollOffset: 2 };
    const updated = scrollUp(model, 10);
    expect(updated.scrollOffset).toBe(0);
  });

  it('stays at 0 when already at 0', () => {
    const model = createTableModel('Deployment');
    const updated = scrollUp(model, 1);
    expect(updated.scrollOffset).toBe(0);
  });
});

describe('scrollToStart', () => {
  it('resets scrollOffset to 0', () => {
    let model = createTableModel('Deployment');
    model = { ...model, scrollOffset: 10 };
    const updated = scrollToStart(model);
    expect(updated.scrollOffset).toBe(0);
  });
});

describe('scrollToEnd', () => {
  it('sets scrollOffset to totalRows - visibleHeight', () => {
    let model = createTableModel('Deployment');
    for (let i = 0; i < 20; i++) {
      const resource = makeResource(`r-${String(i)}`, `uid-${String(i)}`);
      model = applyResourceEvent(model, { type: 'ADDED', resource }, 0);
    }
    const updated = scrollToEnd(model, 5);
    expect(updated.scrollOffset).toBe(15);
  });

  it('clamps at 0 when rows <= visibleHeight', () => {
    let model = createTableModel('Deployment');
    for (let i = 0; i < 3; i++) {
      const resource = makeResource(`r-${String(i)}`, `uid-${String(i)}`);
      model = applyResourceEvent(model, { type: 'ADDED', resource }, 0);
    }
    const updated = scrollToEnd(model, 10);
    expect(updated.scrollOffset).toBe(0);
  });

  it('handles empty model', () => {
    const model = createTableModel('Deployment');
    const updated = scrollToEnd(model, 5);
    expect(updated.scrollOffset).toBe(0);
  });
});
