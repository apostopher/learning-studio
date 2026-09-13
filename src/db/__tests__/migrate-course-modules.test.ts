import { describe, expect, it } from 'vitest';
import { planCourseModuleBackfill } from '../migrate-course-modules';

describe('planCourseModuleBackfill', () => {
  it('gives every module a row in its owning course, keeping its rank', () => {
    expect(
      planCourseModuleBackfill([
        { id: 10, courseId: 2, rank: '0.500000000000000' },
        { id: 19, courseId: 2, rank: '1.000000000000000' },
        { id: 12, courseId: 6, rank: '1.000000000000000' },
      ]),
    ).toEqual([
      { courseId: 2, moduleId: 10, rank: '0.500000000000000' },
      { courseId: 2, moduleId: 19, rank: '1.000000000000000' },
      { courseId: 6, moduleId: 12, rank: '1.000000000000000' },
    ]);
  });

  // The rank string is carried across verbatim, not parsed. `numeric(30,15)`
  // arrives from pg as a string, and Number() on it loses precision at the
  // 15th decimal — which is exactly where fractional ranks from repeated
  // drag-and-drop live.
  it('does not round-trip rank through a number', () => {
    const [row] = planCourseModuleBackfill([
      { id: 1, courseId: 1, rank: '1.333333333333333' },
    ]);
    expect(row.rank).toBe('1.333333333333333');
  });

  it('plans nothing for an empty database', () => {
    expect(planCourseModuleBackfill([])).toEqual([]);
  });
});
