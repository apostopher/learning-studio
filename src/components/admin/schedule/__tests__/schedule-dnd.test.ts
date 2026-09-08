import { describe, expect, it } from 'vitest';
import {
  offeringTone,
  parseScheduleCourseDndId,
  parseScheduleDayDndId,
  scheduleCourseDndId,
  scheduleDayDndId,
} from '../schedule-dnd';

describe('schedule dnd ids', () => {
  it('round-trips a course id', () => {
    expect(parseScheduleCourseDndId(scheduleCourseDndId(42))).toBe(42);
  });

  it('round-trips a day key', () => {
    expect(parseScheduleDayDndId(scheduleDayDndId('2026-09-07'))).toBe(
      '2026-09-07',
    );
  });

  // The two id spaces share a prefix word. A parser that matched loosely
  // would read a day as a course and hand `NaN` to the API.
  it('refuses the other kind of id', () => {
    expect(parseScheduleCourseDndId(scheduleDayDndId('2026-09-07'))).toBeNull();
    expect(parseScheduleDayDndId(scheduleCourseDndId(42))).toBeNull();
  });

  it("refuses the editor's ids, which live in a different space", () => {
    expect(parseScheduleCourseDndId('library-lesson-5')).toBeNull();
    expect(parseScheduleDayDndId('module-5')).toBeNull();
  });

  // This string becomes an offering's `startsOn` and is sent to the server.
  it('refuses a day id whose key is not a date', () => {
    expect(parseScheduleDayDndId('schedule-day-not-a-date')).toBeNull();
    expect(parseScheduleDayDndId('schedule-day-2026-9-7')).toBeNull();
    expect(parseScheduleDayDndId('schedule-day-')).toBeNull();
  });

  it('refuses a course id that is not an integer', () => {
    expect(parseScheduleCourseDndId('schedule-course-abc')).toBeNull();
    expect(parseScheduleCourseDndId('schedule-course-')).toBeNull();
  });
});

describe('offeringTone', () => {
  // A colour belongs to the offering, not to its position: unscheduling one
  // must never recolour the rest.
  it('gives the same offering the same tone every time', () => {
    expect(offeringTone(7)).toBe(offeringTone(7));
  });

  it('always returns a real pair of classes', () => {
    for (const id of [0, 1, 4, 5, 99, 1000]) {
      expect(offeringTone(id)).toMatch(/^bg-[a-z]+-9 text-[a-z]+-contrast$/);
    }
  });
});
