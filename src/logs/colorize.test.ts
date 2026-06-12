import { describe, it, expect } from 'vitest';
import { colorizeLine } from './colorize.js';

describe('colorizeLine', () => {
  it('colors lines containing ERROR red', () => {
    expect(colorizeLine('2026 ERROR boom')).toBe('red');
  });

  it('colors lines containing FATAL red', () => {
    expect(colorizeLine('FATAL: panic')).toBe('red');
  });

  it('colors lines containing lowercase error red', () => {
    expect(colorizeLine('connection error occurred')).toBe('red');
  });

  it('colors lines containing WARNING yellow', () => {
    expect(colorizeLine('WARNING low disk')).toBe('yellow');
  });

  it('colors lines containing WARN yellow', () => {
    expect(colorizeLine('WARN retry attempt 1')).toBe('yellow');
  });

  it('colors lines containing lowercase warn yellow', () => {
    expect(colorizeLine('a warn message')).toBe('yellow');
  });

  it('colors lines containing DEBUG grey', () => {
    expect(colorizeLine('DEBUG trace id=5')).toBe('grey');
  });

  it('colors lines containing lowercase debug grey', () => {
    expect(colorizeLine('debug payload')).toBe('grey');
  });

  it('colors other lines white', () => {
    expect(colorizeLine('INFO server listening')).toBe('white');
  });

  it('prioritizes error over warn when both present', () => {
    expect(colorizeLine('WARN and ERROR together')).toBe('red');
  });

  it('prioritizes warn over debug when both present', () => {
    expect(colorizeLine('WARN with debug info')).toBe('yellow');
  });

  it('treats empty line as white', () => {
    expect(colorizeLine('')).toBe('white');
  });
});
