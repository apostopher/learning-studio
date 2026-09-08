import { describe, expect, it } from 'vitest';
import type { Offering } from '#/lib/offering-schemas';
import { groupOfferingsByDay } from '../schedule-page-container';

const offering = (over: Partial<Offering> = {}): Offering => ({
  id: 1,
  courseId: 10,
  courseName: '2 Week',
  startsOn: '2026-09-07',
  endsOn: '2026-09-09',
  users: [],
  ...over,
});

describe('groupOfferingsByDay', () => {
  it('puts an offering on every day it covers', () => {
    const byDay = groupOfferingsByDay([offering()]);

    expect([...byDay.keys()].sort()).toEqual([
      '2026-09-07',
      '2026-09-08',
      '2026-09-09',
    ]);
  });

  // Both ends are inclusive: a one-day offering is one day, not zero.
  it('covers a single day when it starts and ends the same day', () => {
    const byDay = groupOfferingsByDay([
      offering({ startsOn: '2026-09-07', endsOn: '2026-09-07' }),
    ]);

    expect([...byDay.keys()]).toEqual(['2026-09-07']);
    expect(byDay.get('2026-09-07')).toHaveLength(1);
  });

  it('spans a month boundary', () => {
    const byDay = groupOfferingsByDay([
      offering({ startsOn: '2026-09-29', endsOn: '2026-10-02' }),
    ]);

    expect([...byDay.keys()].sort()).toEqual([
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
    ]);
  });

  it('spans a year boundary', () => {
    const byDay = groupOfferingsByDay([
      offering({ startsOn: '2026-12-30', endsOn: '2027-01-02' }),
    ]);

    expect([...byDay.keys()].sort()).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
    ]);
  });

  // A day-by-day walk built on 24h arithmetic loses or repeats a day across a
  // clock change; this window straddles one in most zones.
  it('spans a daylight-saving change without skipping or repeating a day', () => {
    const byDay = groupOfferingsByDay([
      offering({ startsOn: '2026-03-27', endsOn: '2026-04-01' }),
    ]);

    expect([...byDay.keys()].sort()).toEqual([
      '2026-03-27',
      '2026-03-28',
      '2026-03-29',
      '2026-03-30',
      '2026-03-31',
      '2026-04-01',
    ]);
  });

  it('stacks two offerings that overlap on the same day', () => {
    const byDay = groupOfferingsByDay([
      offering({ id: 1, startsOn: '2026-09-07', endsOn: '2026-09-09' }),
      offering({ id: 2, startsOn: '2026-09-08', endsOn: '2026-09-10' }),
    ]);

    expect(byDay.get('2026-09-08')?.map((row) => row.id)).toEqual([1, 2]);
    expect(byDay.get('2026-09-07')?.map((row) => row.id)).toEqual([1]);
    expect(byDay.get('2026-09-10')?.map((row) => row.id)).toEqual([2]);
  });

  it('yields nothing for no offerings', () => {
    expect(groupOfferingsByDay([]).size).toBe(0);
  });
});
