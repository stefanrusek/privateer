import { describe, it, expect } from 'vitest';
import {
  projectLogsDisplay,
  projectLogsView,
  offsetForMatch,
  type LogsViewInput,
} from './logs-view.js';

const raw = [
  '2024-01-01T00:00:00Z alpha',
  '2024-01-01T00:00:01Z bravo',
  '2024-01-01T00:00:02Z charlie',
  '2024-01-01T00:00:03Z delta',
  '2024-01-01T00:00:04Z echo',
];

describe('projectLogsDisplay', () => {
  it('keeps timestamps when enabled', () => {
    expect(projectLogsDisplay(raw, true)).toEqual(raw);
  });

  it('strips the leading timestamp token when disabled', () => {
    expect(projectLogsDisplay(raw, false)).toEqual([
      'alpha',
      'bravo',
      'charlie',
      'delta',
      'echo',
    ]);
  });

  it('leaves a line with no space untouched when stripping', () => {
    expect(projectLogsDisplay(['solid'], false)).toEqual(['solid']);
  });
});

function input(over: Partial<LogsViewInput>): LogsViewInput {
  return {
    raw,
    offset: 0,
    viewportHeight: 3,
    timestamps: false,
    live: true,
    ...over,
  };
}

describe('projectLogsView — live pins to bottom', () => {
  it('shows the newest viewportHeight lines and reports atBottom', () => {
    const v = projectLogsView(input({ live: true }));
    expect(v.visible).toEqual(['charlie', 'delta', 'echo']);
    expect(v.atBottom).toBe(true);
    expect(v.offset).toBe(2);
  });

  it('ignores a stale offset while live (always bottom)', () => {
    const v = projectLogsView(input({ live: true, offset: 0 }));
    expect(v.visible).toEqual(['charlie', 'delta', 'echo']);
  });
});

describe('projectLogsView — paused honors the offset', () => {
  it('shows the window at the offset', () => {
    const v = projectLogsView(input({ live: false, offset: 1 }));
    expect(v.visible).toEqual(['bravo', 'charlie', 'delta']);
    expect(v.atBottom).toBe(false);
  });

  it('clamps an over-large offset', () => {
    const v = projectLogsView(input({ live: false, offset: 99 }));
    expect(v.visible).toEqual(['charlie', 'delta', 'echo']);
    expect(v.atBottom).toBe(true);
  });

  it('clamps a negative offset to the top', () => {
    const v = projectLogsView(input({ live: false, offset: -5 }));
    expect(v.visible).toEqual(['alpha', 'bravo', 'charlie']);
  });
});

describe('projectLogsView — display fields', () => {
  it('strips timestamps from both display and visible when disabled', () => {
    const v = projectLogsView(
      input({ timestamps: false, live: false, offset: 0 }),
    );
    expect(v.display).toEqual(['alpha', 'bravo', 'charlie', 'delta', 'echo']);
    expect(v.visible).toEqual(['alpha', 'bravo', 'charlie']);
  });

  it('exposes a scrollbar when content exceeds the viewport', () => {
    const v = projectLogsView(input({ live: false, offset: 0 }));
    expect(v.scrollbar).not.toBeNull();
  });

  it('omits the scrollbar when content fits', () => {
    const v = projectLogsView(input({ viewportHeight: 10 }));
    expect(v.scrollbar).toBeNull();
  });
});

describe('offsetForMatch — scroll the match into view', () => {
  it('keeps an already-visible match in place', () => {
    // match at line 1, current offset 0, viewport 3 → visible [0..2]: stays.
    expect(offsetForMatch(0, 1, 5, 3)).toBe(0);
  });

  it('scrolls down so a match below the window becomes visible', () => {
    // match at line 4, viewport 3 → offset 2 puts it on the last visible row.
    expect(offsetForMatch(0, 4, 5, 3)).toBe(2);
  });

  it('scrolls up so a match above the window becomes visible', () => {
    expect(offsetForMatch(3, 0, 5, 3)).toBe(0);
  });

  it('returns the offset unchanged for a non-existent match (-1)', () => {
    expect(offsetForMatch(2, -1, 5, 3)).toBe(2);
  });
});
