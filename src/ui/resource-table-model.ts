/**
 * Pure logic module for ResourceTable state management (Spec 04 §2).
 * No React, no Ink, no I/O — all functions are pure and time-injectable.
 */

import type { ResourceObject, WatchEventType } from '../core/types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RowState = 'default' | 'new' | 'modified' | 'deleted';

export interface TableRow {
  resource: ResourceObject;
  state: RowState;
  stateStartMs: number;
}

export type SortKey = 'name' | 'status';
export type SortDir = 'asc' | 'desc';
export type TableLoadState =
  | 'loading'
  | 'ready'
  | 'forbidden'
  | 'connection-error';

export interface TableModel {
  kind: string;
  rows: ReadonlyMap<string, TableRow>;
  sortKey: SortKey;
  sortDir: SortDir;
  search: string;
  loadState: TableLoadState;
  connectionAttempt: number;
  connectionMax: number;
  scrollOffset: number;
}

// ---------------------------------------------------------------------------
// Status sort order: red < yellow < green/grey (errors first when asc)
// ---------------------------------------------------------------------------

function statusOrder(resource: ResourceObject): number {
  switch (resource.status.color) {
    case 'red':
      return 0;
    case 'yellow':
      return 1;
    case 'green':
      return 2;
    case 'grey':
      return 3;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createTableModel(kind: string): TableModel {
  const isPod = kind === 'Pod';
  return {
    kind,
    rows: new Map<string, TableRow>(),
    sortKey: isPod ? 'status' : 'name',
    sortDir: 'asc',
    search: '',
    loadState: 'loading',
    connectionAttempt: 0,
    connectionMax: 0,
    scrollOffset: 0,
  };
}

// ---------------------------------------------------------------------------
// Mutations (all pure — return new model)
// ---------------------------------------------------------------------------

export function applyResourceEvent(
  model: TableModel,
  event: { type: WatchEventType; resource: ResourceObject },
  nowMs: number,
): TableModel {
  const newRows = new Map<string, TableRow>(model.rows);

  if (event.type === 'DELETED') {
    const existing = newRows.get(event.resource.uid);
    if (existing !== undefined) {
      newRows.set(event.resource.uid, {
        resource: event.resource,
        state: 'deleted',
        stateStartMs: nowMs,
      });
      return { ...model, rows: newRows };
    }
    return model;
  }

  const existing = newRows.get(event.resource.uid);
  const rowState: RowState = existing !== undefined ? 'modified' : 'new';

  newRows.set(event.resource.uid, {
    resource: event.resource,
    state: rowState,
    stateStartMs: nowMs,
  });

  return {
    ...model,
    rows: newRows,
    loadState: 'ready',
  };
}

const NEW_MODIFIED_TTL_MS = 300;
const DELETED_TTL_MS = 500;

export function tickAnimations(model: TableModel, nowMs: number): TableModel {
  let changed = false;
  const newRows = new Map<string, TableRow>(model.rows);

  for (const [uid, row] of newRows) {
    const elapsed = nowMs - row.stateStartMs;

    if (row.state === 'deleted' && elapsed >= DELETED_TTL_MS) {
      newRows.delete(uid);
      changed = true;
    } else if (
      (row.state === 'new' || row.state === 'modified') &&
      elapsed >= NEW_MODIFIED_TTL_MS
    ) {
      newRows.set(uid, { ...row, state: 'default' });
      changed = true;
    }
  }

  if (!changed) {
    return model;
  }

  return { ...model, rows: newRows };
}

// ---------------------------------------------------------------------------
// Sorting & filtering
// ---------------------------------------------------------------------------

export function getSortedFilteredRows(model: TableModel): TableRow[] {
  const searchLower = model.search.toLowerCase();
  const rows: TableRow[] = [];

  for (const row of model.rows.values()) {
    if (
      searchLower.length > 0 &&
      !row.resource.name.toLowerCase().includes(searchLower)
    ) {
      continue;
    }
    rows.push(row);
  }

  const multiplier = model.sortDir === 'asc' ? 1 : -1;

  rows.sort((a, b) => {
    if (model.sortKey === 'status') {
      const diff = statusOrder(a.resource) - statusOrder(b.resource);
      if (diff !== 0) {
        return diff * multiplier;
      }
      // Secondary sort by name
      return a.resource.name.localeCompare(b.resource.name) * multiplier;
    }
    // name sort
    return a.resource.name.localeCompare(b.resource.name) * multiplier;
  });

  return rows;
}

export function getVisibleRows(
  model: TableModel,
  scrollOffset: number,
  visibleHeight: number,
): TableRow[] {
  const sorted = getSortedFilteredRows(model);
  return sorted.slice(scrollOffset, scrollOffset + visibleHeight);
}

// ---------------------------------------------------------------------------
// Sort / search / scroll
// ---------------------------------------------------------------------------

export function applySort(
  model: TableModel,
  key: SortKey,
  dir: SortDir,
): TableModel {
  return { ...model, sortKey: key, sortDir: dir };
}

export function applySearch(model: TableModel, search: string): TableModel {
  return { ...model, search, scrollOffset: 0 };
}

export function scrollDown(model: TableModel, delta: number): TableModel {
  const sorted = getSortedFilteredRows(model);
  const maxOffset = Math.max(0, sorted.length - 1);
  const newOffset = Math.min(model.scrollOffset + delta, maxOffset);
  return { ...model, scrollOffset: newOffset };
}

export function scrollUp(model: TableModel, delta: number): TableModel {
  const newOffset = Math.max(0, model.scrollOffset - delta);
  return { ...model, scrollOffset: newOffset };
}

export function scrollToStart(model: TableModel): TableModel {
  return { ...model, scrollOffset: 0 };
}

export function scrollToEnd(
  model: TableModel,
  visibleHeight: number,
): TableModel {
  const sorted = getSortedFilteredRows(model);
  const maxOffset = Math.max(0, sorted.length - visibleHeight);
  return { ...model, scrollOffset: maxOffset };
}
