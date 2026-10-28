import { describe, expect, it } from 'vitest';
import {
  computeSidebarPercents,
  earliestRefreshAt,
} from '../compute-sidebar-percents';

const details = {
  modules: [
    {
      id: 1,
      lessons: [
        { id: 10, slug: 'a' },
        { id: 11, slug: 'b' },
      ],
    },
    { id: 2, lessons: [] },
  ],
};
const d = (passed: boolean, bearing = true) => ({
  doneAt: '2026-10-20T00:00:00Z',
  passed,
  lastFailedAt: null,
  bearing,
});
const now = new Date('2026-10-28T09:00:00Z');

describe('computeSidebarPercents', () => {
  it('counts debriefs in the course percent but not the module percent', () => {
    const r = computeSidebarPercents(
      details,
      {
        lessons: [
          { lessonId: 10, percent: 100, debrief: d(true) },
          { lessonId: 11, percent: 100, debrief: d(false) },
          // Hidden by level: must not count.
          { lessonId: 99, percent: 0, debrief: d(false) },
        ],
      },
      now,
      { timeZone: 'UTC' },
    );
    expect(r.coursePercent).toBe(75);
    expect(r.modulePercents).toEqual({ 1: 100, 2: 0 });
    expect(r.lessonPercents).toEqual({ a: 100, b: 100 });
  });

  it('exposes a ring per visible lesson, passed one ticked', () => {
    const r = computeSidebarPercents(
      details,
      {
        lessons: [
          { lessonId: 10, percent: 100, debrief: d(true) },
          { lessonId: 11, percent: 100, debrief: d(false) },
        ],
      },
      now,
      { timeZone: 'UTC' },
    );
    expect(r.lessonRings.a?.badge).toBe('passed');
    expect(r.lessonRings.b?.badge).toBe('debrief');
  });

  it('is empty before the data arrives', () => {
    expect(
      computeSidebarPercents(undefined, undefined, now).coursePercent,
    ).toBe(0);
  });
});

describe('earliestRefreshAt', () => {
  it('picks the soonest instant, ignoring nulls', () => {
    const ring = (refreshAt: string | null) => ({
      percent: 0,
      badge: null,
      ariaLabel: '',
      refreshAt,
    });
    expect(
      earliestRefreshAt({
        a: ring('2026-10-29T00:00:00.000Z'),
        b: ring(null),
        c: ring('2026-10-28T12:00:00.000Z'),
      }),
    ).toBe('2026-10-28T12:00:00.000Z');
    expect(earliestRefreshAt({ a: ring(null) })).toBeNull();
  });
});
