import { describe, expect, it } from 'vitest';
import { formatTime } from '../format-time';

describe('formatTime', () => {
  it('formats 0 as 0:00', () => {
    expect(formatTime(0)).toBe('0:00');
  });

  it('formats seconds under a minute as 0:SS', () => {
    expect(formatTime(7)).toBe('0:07');
    expect(formatTime(59)).toBe('0:59');
  });

  it('formats minutes:seconds without hours under one hour', () => {
    expect(formatTime(65)).toBe('1:05');
    expect(formatTime(599)).toBe('9:59');
    expect(formatTime(3599)).toBe('59:59');
  });

  it('formats hours:minutes:seconds at one hour or more', () => {
    expect(formatTime(3600)).toBe('1:00:00');
    expect(formatTime(3661)).toBe('1:01:01');
    expect(formatTime(36061)).toBe('10:01:01');
  });

  it('floors fractional seconds', () => {
    expect(formatTime(65.9)).toBe('1:05');
  });

  it('returns 0:00 for NaN, Infinity, and negative values', () => {
    expect(formatTime(Number.NaN)).toBe('0:00');
    expect(formatTime(Number.POSITIVE_INFINITY)).toBe('0:00');
    expect(formatTime(-5)).toBe('0:00');
  });
});
