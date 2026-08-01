import { describe, expect, it } from 'vitest';
import { courseProgressSummarySchema } from '#/data-hooks/use-course-progress-summary';
import { aggregateCourseProgress } from '#/lib/course-progress-agg';

/**
 * The producer/consumer seam for course progress: whatever
 * `aggregateCourseProgress` actually emits (the server's real aggregation —
 * `getCourseProgress` returns its output directly) must be exactly what
 * `courseProgressSummarySchema` accepts. Field-level drift between the two
 * is invisible to either side's own unit tests, because each only checks
 * itself against its own fixture — this is the check that would have caught
 * `videoId` staying required in the client schema after an earlier task
 * dropped it from `LessonProgress` on the server.
 */
describe('courseProgressSummarySchema accepts real aggregateCourseProgress output', () => {
  it('parses a non-empty, multi-module course summary without throwing', () => {
    const base = {
      watchedHits: 0,
      hasVideo: false,
      needsVideoWatch: false,
      applicableSections: 0,
      tappedSections: 0,
      hasDebrief: false,
      hasQuiz: false,
      canDebrief: false,
      quizPlayed: false,
      debriefAnswered: false,
      visited: false,
    };
    const real = aggregateCourseProgress('ppl', [
      // one of each regime, so the parsed summary exercises them all
      {
        ...base,
        moduleId: 1,
        lessonId: 10,
        hasVideo: true,
        needsVideoWatch: true,
        watchedHits: 18,
      },
      {
        ...base,
        moduleId: 1,
        lessonId: 11,
        applicableSections: 2,
        tappedSections: 1,
      },
      { ...base, moduleId: 1, lessonId: 12, visited: true },
      { ...base, moduleId: 2, lessonId: null }, // empty-module placeholder
    ]);

    expect(() => courseProgressSummarySchema.parse(real)).not.toThrow();
    expect(courseProgressSummarySchema.parse(real)).toEqual(real);
  });
});
