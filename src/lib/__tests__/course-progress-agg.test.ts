import { describe, expect, it } from 'vitest';
import { watchedMilestones } from '#/lib/course-milestones';
import {
  aggregateCourseProgress,
  aggregatePercentByCourse,
  type LessonProgressRow,
  type ManyCourseProgressRow,
} from '#/lib/course-progress-agg';

const FULL = watchedMilestones.length; // 18 — all watched-milestones hit

describe('aggregateCourseProgress', () => {
  it('rolls a lesson up by its id, with no video identifier involved', () => {
    const result = aggregateCourseProgress('c', [
      { moduleId: 1, lessonId: 10, watchedHits: 18 },
      { moduleId: 1, lessonId: 11, watchedHits: 9 },
    ]);
    expect(result.lessons.map((l) => l.lessonId)).toEqual([10, 11]);
    expect(result.lessons[0]).not.toHaveProperty('videoId');
    expect(result.percent).toBe(75);
  });

  it('lesson% is round(hits/18·100); watched ⇔ all 18 hit', () => {
    const rows: LessonProgressRow[] = [
      { moduleId: 1, lessonId: 10, watchedHits: FULL }, // 100, watched
      { moduleId: 1, lessonId: 11, watchedHits: 17 }, // 94, not watched
      { moduleId: 1, lessonId: 12, watchedHits: 0 }, // 0
    ];
    const { lessons } = aggregateCourseProgress('c', rows);
    expect(lessons).toEqual([
      {
        lessonId: 10,
        moduleId: 1,
        percent: 100,
        watched: true,
      },
      {
        lessonId: 11,
        moduleId: 1,
        percent: 94,
        watched: false,
      },
      {
        lessonId: 12,
        moduleId: 1,
        percent: 0,
        watched: false,
      },
    ]);
  });

  it('caps a lesson at 100% even if extra milestones (incl. 100) are hit', () => {
    const rows: LessonProgressRow[] = [
      { moduleId: 1, lessonId: 10, watchedHits: FULL + 1 },
    ];
    const { lessons } = aggregateCourseProgress('c', rows);
    expect(lessons[0].percent).toBe(100);
    expect(lessons[0].watched).toBe(true);
  });

  it('module% is the average of its lessons; counts watched/total', () => {
    const rows: LessonProgressRow[] = [
      { moduleId: 1, lessonId: 10, watchedHits: FULL }, // 100
      { moduleId: 1, lessonId: 11, watchedHits: 9 }, // 50
    ];
    const { modules } = aggregateCourseProgress('c', rows);
    expect(modules).toEqual([
      { moduleId: 1, percent: 75, watchedLessons: 1, totalLessons: 2 },
    ]);
  });

  it('course% is the average of module percents (not lesson-weighted)', () => {
    const rows: LessonProgressRow[] = [
      // module A: 2 lessons, both 100% → module 100%
      { moduleId: 1, lessonId: 10, watchedHits: FULL },
      { moduleId: 1, lessonId: 11, watchedHits: FULL },
      // module B: 20 lessons at 50% each → module 50%
      ...Array.from({ length: 20 }, (_, i) => ({
        moduleId: 2,
        lessonId: 100 + i,
        watchedHits: 9,
      })),
    ];
    const result = aggregateCourseProgress('c', rows);
    expect(result.modules.map((m) => m.percent)).toEqual([100, 50]);
    expect(result.percent).toBe(75); // (100 + 50) / 2, not lesson-weighted 55
    expect(result.totalLessons).toBe(22);
    expect(result.watchedLessons).toBe(2);
  });

  it('keeps an empty module as 0% and includes it in the course average', () => {
    const rows: LessonProgressRow[] = [
      { moduleId: 1, lessonId: 10, watchedHits: FULL }, // module 100%
      { moduleId: 2, lessonId: null, watchedHits: 0 }, // empty module → 0%
    ];
    const result = aggregateCourseProgress('c', rows);
    expect(result.modules).toEqual([
      { moduleId: 1, percent: 100, watchedLessons: 1, totalLessons: 1 },
      { moduleId: 2, percent: 0, watchedLessons: 0, totalLessons: 0 },
    ]);
    expect(result.percent).toBe(50); // (100 + 0) / 2
    expect(result.lessons).toHaveLength(1); // placeholder is not a lesson
  });

  it('preserves the row order for modules and lessons', () => {
    const rows: LessonProgressRow[] = [
      { moduleId: 5, lessonId: 50, watchedHits: 0 },
      { moduleId: 5, lessonId: 51, watchedHits: 0 },
      { moduleId: 3, lessonId: 30, watchedHits: 0 },
    ];
    const result = aggregateCourseProgress('c', rows);
    expect(result.modules.map((m) => m.moduleId)).toEqual([5, 3]);
    expect(result.lessons.map((l) => l.lessonId)).toEqual([50, 51, 30]);
  });

  it('returns a zeroed summary for a course with no rows', () => {
    expect(aggregateCourseProgress('empty', [])).toEqual({
      slug: 'empty',
      percent: 0,
      watchedLessons: 0,
      totalLessons: 0,
      modules: [],
      lessons: [],
    });
  });
});

describe('aggregatePercentByCourse', () => {
  const FULL_ROW = { watchedHits: watchedMilestones.length };

  it('computes each course independently, matching aggregateCourseProgress on the same rows', () => {
    const rows: ManyCourseProgressRow[] = [
      {
        courseId: 1,
        moduleId: 10,
        lessonId: 100,
        ...FULL_ROW,
      },
      {
        courseId: 2,
        moduleId: 20,
        lessonId: 200,
        watchedHits: 9,
      },
    ];
    const percents = aggregatePercentByCourse(rows);
    expect(percents.get(1)).toBe(100);
    expect(percents.get(2)).toBe(50);
  });

  it('separates rows from different courses that happen to share module/lesson ids', () => {
    // moduleId/lessonId are only unique within a course's own rows here —
    // grouping must key on courseId, not accidentally merge across courses.
    const rows: ManyCourseProgressRow[] = [
      { courseId: 1, moduleId: 1, lessonId: 1, ...FULL_ROW },
      { courseId: 2, moduleId: 1, lessonId: 1, watchedHits: 0 },
    ];
    const percents = aggregatePercentByCourse(rows);
    expect(percents.get(1)).toBe(100);
    expect(percents.get(2)).toBe(0);
  });

  it('registers a course with a null-moduleId placeholder row at 0%, not omitted', () => {
    const rows: ManyCourseProgressRow[] = [
      {
        courseId: 3,
        moduleId: null,
        lessonId: null,
        watchedHits: 0,
      },
    ];
    const percents = aggregatePercentByCourse(rows);
    expect(percents.has(3)).toBe(true);
    expect(percents.get(3)).toBe(0);
  });

  it('ignores a null-moduleId row for a course that also has real module rows', () => {
    // Should not happen from the real query (a course either has modules or
    // it doesn't), but the function must not let a stray null row drag down
    // an otherwise-complete course.
    const rows: ManyCourseProgressRow[] = [
      {
        courseId: 4,
        moduleId: null,
        lessonId: null,
        watchedHits: 0,
      },
      {
        courseId: 4,
        moduleId: 40,
        lessonId: 400,
        ...FULL_ROW,
      },
    ];
    const percents = aggregatePercentByCourse(rows);
    expect(percents.get(4)).toBe(100);
  });

  it('returns an empty map for no rows', () => {
    expect(aggregatePercentByCourse([]).size).toBe(0);
  });
});
