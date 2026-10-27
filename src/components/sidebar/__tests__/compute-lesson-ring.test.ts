import { describe, expect, it } from 'vitest';
import { computeLessonRing } from '../compute-lesson-ring';

const now = new Date('2026-10-28T09:00:00Z');
const base = {
  lessonName: 'X',
  percent: 100,
  now,
  timeZone: 'UTC' as const,
};
const facts = (over: Partial<Record<string, unknown>> = {}) => ({
  doneAt: '2026-10-26T09:00:00Z',
  passed: false,
  lastFailedAt: null,
  bearing: true,
  ...over,
});

describe('computeLessonRing', () => {
  it('has no badge when the lesson is not debrief-bearing', () => {
    expect(
      computeLessonRing({
        ...base,
        percent: 40,
        debrief: facts({ bearing: false }) as never,
      }),
    ).toEqual({
      percent: 40,
      badge: null,
      ariaLabel: 'Lesson X, 40% complete',
      refreshAt: null,
    });
  });

  it('shows D when the debrief is open', () => {
    const r = computeLessonRing({ ...base, debrief: facts() as never });
    expect(r.badge).toBe('debrief');
    expect(r.ariaLabel).toBe('Lesson X, 100% complete, debrief ready');
    expect(r.refreshAt).toBeNull();
  });

  it('keeps D and states when it reopens after a below-par attempt', () => {
    const r = computeLessonRing({
      ...base,
      debrief: facts({ lastFailedAt: '2026-10-27T15:40:00Z' }) as never,
    });
    expect(r.badge).toBe('debrief');
    expect(r.ariaLabel).toBe(
      'Lesson X, 100% complete, debrief reopens Wed 28 Oct, 3:40 PM',
    );
    expect(r.refreshAt).toBe('2026-10-28T15:40:00.000Z');
  });

  it('omits the time (SSR-safe) when includeTime is false', () => {
    const r = computeLessonRing({
      ...base,
      includeTime: false,
      debrief: facts({ lastFailedAt: '2026-10-27T15:40:00Z' }) as never,
    });
    expect(r.ariaLabel).toBe('Lesson X, 100% complete, debrief reopens later');
    expect(r.refreshAt).toBe('2026-10-28T15:40:00.000Z');
  });

  it('shows no badge during the first 24h, says when the debrief opens, and schedules the refresh', () => {
    const r = computeLessonRing({
      ...base,
      debrief: facts({ doneAt: '2026-10-28T03:00:00Z' }) as never,
    });
    expect(r.badge).toBeNull();
    expect(r.refreshAt).toBe('2026-10-29T03:00:00.000Z');
    // The wait states its reason: no D yet because the debrief has not opened.
    expect(r.ariaLabel).toBe(
      'Lesson X, 100% complete, debrief opens Thu 29 Oct, 3:00 AM',
    );
  });

  it('says the debrief opens later (SSR-safe) in the first 24h when includeTime is false', () => {
    const r = computeLessonRing({
      ...base,
      includeTime: false,
      debrief: facts({ doneAt: '2026-10-28T03:00:00Z' }) as never,
    });
    expect(r.ariaLabel).toBe('Lesson X, 100% complete, debrief opens later');
    expect(r.refreshAt).toBe('2026-10-29T03:00:00.000Z');
  });

  it('shows the tick and a full ring when passed', () => {
    const r = computeLessonRing({
      ...base,
      percent: 100,
      debrief: facts({ passed: true }) as never,
    });
    expect(r.badge).toBe('passed');
    expect(r.percent).toBe(100);
    expect(r.ariaLabel).toBe('Lesson X, 100% complete, debrief passed');
    expect(r.refreshAt).toBeNull();
  });
});
