import { describe, it, expect } from 'vitest';
import {
  renderAccelerator,
  matchAccelerator,
  type AcceleratorButton,
} from './accelerator.js';

describe('renderAccelerator', () => {
  it('underlines the first matching letter inside the label', () => {
    expect(renderAccelerator('Container ▾', 'o')).toEqual([
      { text: 'C', underline: false },
      { text: 'o', underline: true },
      { text: 'ntainer ▾', underline: false },
    ]);
  });

  it('matches case-insensitively but keeps the label letter as written', () => {
    expect(renderAccelerator('YAML', 'y')).toEqual([
      { text: 'Y', underline: true },
      { text: 'AML', underline: false },
    ]);
  });

  it('underlines the first occurrence only', () => {
    expect(renderAccelerator('100 lines ▾', 'l')).toEqual([
      { text: '100 ', underline: false },
      { text: 'l', underline: true },
      { text: 'ines ▾', underline: false },
    ]);
  });

  it('renders a prefix badge when the key is not in the label', () => {
    // Fallback: "p̲:Paused" — the key as an underlined prefix.
    expect(renderAccelerator('Paused', 'q')).toEqual([
      { text: 'q', underline: true },
      { text: ':Paused', underline: false },
    ]);
  });

  it('treats a leading match as a single underlined head segment', () => {
    expect(renderAccelerator('Open', 'o')).toEqual([
      { text: 'O', underline: true },
      { text: 'pen', underline: false },
    ]);
  });

  it('treats a trailing match as a single underlined tail segment', () => {
    expect(renderAccelerator('Tab', 'b')).toEqual([
      { text: 'Ta', underline: false },
      { text: 'b', underline: true },
    ]);
  });
});

describe('matchAccelerator', () => {
  const buttons: readonly AcceleratorButton[] = [
    { id: 'container', accelerator: 'o' },
    { id: 'lines', accelerator: 'l' },
    { id: 'plain' },
  ];

  it('returns the id of the button whose accelerator matches the keypress', () => {
    expect(matchAccelerator(buttons, 'o')).toBe('container');
    expect(matchAccelerator(buttons, 'l')).toBe('lines');
  });

  it('matches case-insensitively', () => {
    expect(matchAccelerator(buttons, 'O')).toBe('container');
  });

  it('returns null when no accelerator matches', () => {
    expect(matchAccelerator(buttons, 'z')).toBeNull();
  });

  it('ignores buttons without an accelerator', () => {
    expect(matchAccelerator([{ id: 'plain' }], 'p')).toBeNull();
  });

  it('returns the first matching button when accelerators collide', () => {
    const dupes: readonly AcceleratorButton[] = [
      { id: 'first', accelerator: 'x' },
      { id: 'second', accelerator: 'x' },
    ];
    expect(matchAccelerator(dupes, 'x')).toBe('first');
  });
});
