import { describe, it, expect } from 'vitest';
import { formatAge } from './age.js';

/**
 * Table-driven tests for formatAge (Spec 03 §6).
 * One named case per spec-table row plus boundary edges (Spec 08 §6.7).
 *
 * Base: nowMs = 0, creationTimestamp set to represent duration before "now"
 * by using a timestamp that is `duration` ms before epoch.
 */

const BASE_NOW = 1_000_000_000_000; // arbitrary fixed "now"

function tsAt(offsetMs: number): string {
  return new Date(BASE_NOW - offsetMs).toISOString();
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

describe('formatAge', () => {
  describe('seconds range (< 60s)', () => {
    it.each([
      ['0s — just created', 0, '0s'],
      ['1s', SECOND, '1s'],
      ['42s', 42 * SECOND, '42s'],
      ['59s — boundary edge', 59 * SECOND, '59s'],
    ])('%s', (_name, offsetMs, expected) => {
      expect(formatAge(tsAt(offsetMs), BASE_NOW)).toBe(expected);
    });
  });

  describe('minutes range (>= 60s, < 60m)', () => {
    it.each([
      ['1m — exact boundary', MINUTE, '1m'],
      ['1m — 1 second after boundary', MINUTE + SECOND, '1m'],
      ['14m', 14 * MINUTE, '14m'],
      ['59m — boundary edge', 59 * MINUTE, '59m'],
      ['59m 59s — still under 60m', 59 * MINUTE + 59 * SECOND, '59m'],
    ])('%s', (_name, offsetMs, expected) => {
      expect(formatAge(tsAt(offsetMs), BASE_NOW)).toBe(expected);
    });
  });

  describe('hours range (>= 60m, < 24h)', () => {
    it.each([
      ['1h — exact boundary', HOUR, '1h'],
      ['6h', 6 * HOUR, '6h'],
      ['23h', 23 * HOUR, '23h'],
      ['23h 59m — boundary edge', 23 * HOUR + 59 * MINUTE, '23h'],
    ])('%s', (_name, offsetMs, expected) => {
      expect(formatAge(tsAt(offsetMs), BASE_NOW)).toBe(expected);
    });
  });

  describe('days range (>= 24h, < 30d)', () => {
    it.each([
      ['1d — exact boundary', DAY, '1d'],
      ['12d', 12 * DAY, '12d'],
      ['29d', 29 * DAY, '29d'],
      ['29d 23h — boundary edge', 29 * DAY + 23 * HOUR, '29d'],
    ])('%s', (_name, offsetMs, expected) => {
      expect(formatAge(tsAt(offsetMs), BASE_NOW)).toBe(expected);
    });
  });

  describe('months range (>= 30d, < 365d)', () => {
    it.each([
      ['1mo — exact 30d boundary', MONTH, '1mo'],
      ['3mo', 3 * MONTH, '3mo'],
      ['11mo', 11 * MONTH, '11mo'],
      ['364d — just under 1y', 364 * DAY, '12mo'],
    ])('%s', (_name, offsetMs, expected) => {
      expect(formatAge(tsAt(offsetMs), BASE_NOW)).toBe(expected);
    });
  });

  describe('years range (>= 365d)', () => {
    it.each([
      ['1y — exact 365d boundary', YEAR, '1y'],
      ['2y', 2 * YEAR, '2y'],
      ['5y', 5 * YEAR, '5y'],
    ])('%s', (_name, offsetMs, expected) => {
      expect(formatAge(tsAt(offsetMs), BASE_NOW)).toBe(expected);
    });
  });

  it('returns 0s for a future timestamp (negative diff clamped to 0)', () => {
    const future = new Date(BASE_NOW + 5 * SECOND).toISOString();
    expect(formatAge(future, BASE_NOW)).toBe('0s');
  });

  it('returns empty string for an invalid/empty timestamp', () => {
    expect(formatAge('', BASE_NOW)).toBe('');
    expect(formatAge('not-a-date', BASE_NOW)).toBe('');
  });
});
