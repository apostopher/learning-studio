// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  clampDuration,
  computeAllowance,
  isStale,
  utcDayWindow,
} from '#/lib/video-call-allowance';

const at = (iso: string) => new Date(iso);

describe('utcDayWindow', () => {
  it('starts at 00:00 UTC today and resets at 00:00 UTC tomorrow', () => {
    const { start, resetsAt } = utcDayWindow(at('2026-10-07T00:01:00Z'));
    expect(start.toISOString()).toBe('2026-10-07T00:00:00.000Z');
    expect(resetsAt.toISOString()).toBe('2026-10-08T00:00:00.000Z');
  });
});

describe('computeAllowance', () => {
  const now = at('2026-10-06T12:00:00Z');

  it('gives a fresh user the full day and a 10 minute call', () => {
    const a = computeAllowance([], now);
    expect(a).toMatchObject({
      remainingSeconds: 1800,
      canStart: true,
      reservedSecondsIfStarted: 600,
    });
    expect(a.resetsAt.toISOString()).toBe('2026-10-07T00:00:00.000Z');
  });

  it('counts ended calls by actual duration and active calls by reservation', () => {
    const a = computeAllowance(
      [
        { status: 'ended', reservedSeconds: 600, durationSeconds: 200 },
        { status: 'active', reservedSeconds: 600, durationSeconds: null },
      ],
      now,
    );
    expect(a.remainingSeconds).toBe(1000);
    expect(a.reservedSecondsIfStarted).toBe(600);
  });

  it('caps the next call at what is left today', () => {
    const a = computeAllowance(
      [{ status: 'ended', reservedSeconds: 600, durationSeconds: 1500 }],
      now,
    );
    expect(a.reservedSecondsIfStarted).toBe(300);
  });

  it('refuses a start with under a minute left', () => {
    const a = computeAllowance(
      [{ status: 'ended', reservedSeconds: 600, durationSeconds: 1750 }],
      now,
    );
    expect(a).toMatchObject({ remainingSeconds: 50, canStart: false });
  });

  it('never goes negative', () => {
    const a = computeAllowance(
      [{ status: 'ended', reservedSeconds: 600, durationSeconds: 4000 }],
      now,
    );
    expect(a.remainingSeconds).toBe(0);
  });
});

describe('clampDuration', () => {
  it('clamps to [0, reserved]', () => {
    const start = at('2026-10-06T12:00:00Z');
    expect(clampDuration(start, at('2026-10-06T12:01:30Z'), 600)).toBe(90);
    expect(clampDuration(start, at('2026-10-06T12:30:00Z'), 600)).toBe(600);
    expect(clampDuration(start, at('2026-10-06T11:59:00Z'), 600)).toBe(0);
  });
});

describe('isStale', () => {
  it('is stale only after reservation plus a 2 minute grace', () => {
    const row = { startedAt: at('2026-10-06T12:00:00Z'), reservedSeconds: 600 };
    expect(isStale(row, at('2026-10-06T12:12:00Z'))).toBe(false);
    expect(isStale(row, at('2026-10-06T12:12:01Z'))).toBe(true);
  });
});
