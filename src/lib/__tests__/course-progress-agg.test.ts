import { describe, expect, it } from 'vitest';
import { watchedMilestones } from '#/lib/course-milestones';
import {
  aggregateCourseProgress,
  aggregatePercentByCourse,
  type LessonProgressRow,
  type ManyCourseProgressRow,
} from '#/lib/course-progress-agg';

const FULL = watchedMilestones.length; // 18 — all watched-milestones hit

/**
 * A lesson that asks NOTHING: no video, no material, no quiz, no debrief.
 *
 * Every test opts into the components it is about, so each states its own
 * premise and none inherits a component it never mentions. The base is the
 * degenerate case on purpose — it is what the fallback branch exists for.
 */
const row = (
  over: Partial<LessonProgressRow> & {
    moduleId: number;
    lessonId: number | null;
  },
): LessonProgressRow => ({
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
  ...over,
});

/** A lesson measured only by watching, with nothing else to do. */
const watchable = (
  moduleId: number,
  lessonId: number,
  watchedHits: number,
): LessonProgressRow =>
  row({
    moduleId,
    lessonId,
    watchedHits,
    hasVideo: true,
    needsVideoWatch: true,
  });

const EMPTY_MODULE = { lessonId: null } as const;

describe('a single component', () => {
  it('video: percent is round(hits/18·100), watched ⇔ all 18', () => {
    const { lessons } = aggregateCourseProgress('c', [
      watchable(1, 10, FULL),
      watchable(1, 11, 17),
      watchable(1, 12, 0),
    ]);
    expect(lessons.map((l) => l.percent)).toEqual([100, 94, 0]);
    expect(lessons.map((l) => l.watched)).toEqual([true, false, false]);
  });

  it('video: caps at 100% when extra milestones (incl. 100) are hit', () => {
    const { lessons } = aggregateCourseProgress('c', [
      watchable(1, 10, FULL + 1),
    ]);
    expect(lessons[0].percent).toBe(100);
  });

  it('sections: percent is the tapped fraction of the applicable tabs', () => {
    const { lessons } = aggregateCourseProgress('c', [
      row({
        moduleId: 1,
        lessonId: 10,
        applicableSections: 4,
        tappedSections: 1,
      }),
      row({
        moduleId: 1,
        lessonId: 11,
        applicableSections: 4,
        tappedSections: 4,
      }),
    ]);
    expect(lessons.map((l) => l.percent)).toEqual([25, 100]);
  });

  it('sections: a tab emptied after being tapped cannot push past 100%', () => {
    // The tap row survives an admin clearing that tab's content, so the raw
    // count can exceed what is now applicable.
    const { lessons } = aggregateCourseProgress('c', [
      row({
        moduleId: 1,
        lessonId: 10,
        applicableSections: 2,
        tappedSections: 5,
      }),
    ]);
    expect(lessons[0].percent).toBe(100);
  });

  it('quiz: 0 or 1, never partial', () => {
    const { lessons } = aggregateCourseProgress('c', [
      row({ moduleId: 1, lessonId: 10, hasQuiz: true, quizPlayed: false }),
      row({ moduleId: 1, lessonId: 11, hasQuiz: true, quizPlayed: true }),
    ]);
    expect(lessons.map((l) => l.percent)).toEqual([0, 100]);
  });

  it('debrief: 0 or 1, and only when it can actually be generated', () => {
    const { lessons } = aggregateCourseProgress('c', [
      row({ moduleId: 1, lessonId: 10, hasDebrief: true, canDebrief: true }),
      row({
        moduleId: 1,
        lessonId: 11,
        hasDebrief: true,
        canDebrief: true,
        debriefAnswered: true,
      }),
      // No key points to generate from: not merely unfinished, unreachable —
      // so it must not count, and with nothing else to do the lesson falls
      // back to the visit.
      row({
        moduleId: 1,
        lessonId: 12,
        hasDebrief: true,
        canDebrief: false,
        visited: true,
      }),
    ]);
    expect(lessons.map((l) => l.percent)).toEqual([0, 100, 100]);
  });
});

describe('quiz XOR debrief', () => {
  it('ignores the authored quiz entirely when hasDebrief is on', () => {
    // The Quiz tab never renders while hasDebrief is on, so a quiz the learner
    // is never shown must not hold their lesson below 100%.
    const { lessons } = aggregateCourseProgress('c', [
      row({
        moduleId: 1,
        lessonId: 10,
        hasQuiz: true,
        quizPlayed: false,
        hasDebrief: true,
        canDebrief: true,
        debriefAnswered: true,
      }),
    ]);
    expect(lessons[0].percent).toBe(100);
  });

  it('counts the authored quiz when hasDebrief is off', () => {
    const { lessons } = aggregateCourseProgress('c', [
      row({ moduleId: 1, lessonId: 10, hasQuiz: true, quizPlayed: true }),
    ]);
    expect(lessons[0].percent).toBe(100);
  });

  it('falls back to the visit when the quiz is hidden and no debrief is possible', () => {
    // The accepted dead state: the learner sees no second tab at all. Progress
    // must not punish them for content the UI never offered.
    const { lessons } = aggregateCourseProgress('c', [
      row({
        moduleId: 1,
        lessonId: 10,
        hasQuiz: true,
        hasDebrief: true,
        canDebrief: false,
        visited: true,
      }),
    ]);
    expect(lessons[0].percent).toBe(100);
  });
});

describe('combining components', () => {
  it('is the mean of the components that apply', () => {
    // video half-watched + 2 of 4 sections + quiz unplayed → (0.5+0.5+0)/3
    const { lessons } = aggregateCourseProgress('c', [
      row({
        moduleId: 1,
        lessonId: 10,
        hasVideo: true,
        needsVideoWatch: true,
        watchedHits: 9,
        applicableSections: 4,
        tappedSections: 2,
        hasQuiz: true,
      }),
    ]);
    expect(lessons[0].percent).toBe(33);
  });

  it('does not count a video the lesson does not require', () => {
    // needsVideoWatch off → only sections apply, so a fully tapped lesson is
    // done even with the video untouched.
    const { lessons } = aggregateCourseProgress('c', [
      row({
        moduleId: 1,
        lessonId: 10,
        hasVideo: true,
        needsVideoWatch: false,
        watchedHits: 0,
        applicableSections: 2,
        tappedSections: 2,
      }),
    ]);
    expect(lessons[0].percent).toBe(100);
  });

  it('is 100% only when every applicable component is finished', () => {
    const { lessons } = aggregateCourseProgress('c', [
      row({
        moduleId: 1,
        lessonId: 10,
        hasVideo: true,
        needsVideoWatch: true,
        watchedHits: FULL,
        applicableSections: 3,
        tappedSections: 3,
        hasDebrief: true,
        canDebrief: true,
        debriefAnswered: true,
      }),
    ]);
    expect(lessons[0].percent).toBe(100);
  });
});

describe('a lesson that asks nothing', () => {
  it('is 100% once visited and 0% before', () => {
    const { lessons } = aggregateCourseProgress('c', [
      row({ moduleId: 1, lessonId: 10, visited: true }),
      row({ moduleId: 1, lessonId: 11, visited: false }),
    ]);
    expect(lessons.map((l) => l.percent)).toEqual([100, 0]);
  });
});

describe('watched vs percent (D19)', () => {
  it('reports watched only for a fully watched video, never for completion', () => {
    // A lesson at 100% with no video must NOT report watched — that field
    // feeds the prerequisite gate, and setting it would silently turn sections
    // and debriefs into unlock requirements.
    const { lessons, watchedLessons } = aggregateCourseProgress('c', [
      row({ moduleId: 1, lessonId: 10, visited: true }),
      row({
        moduleId: 1,
        lessonId: 11,
        applicableSections: 1,
        tappedSections: 1,
      }),
    ]);
    expect(lessons.map((l) => l.percent)).toEqual([100, 100]);
    expect(lessons.map((l) => l.watched)).toEqual([false, false]);
    expect(watchedLessons).toBe(0);
  });

  it('reports watched for a full video even when the lesson is not complete', () => {
    const { lessons } = aggregateCourseProgress('c', [
      row({
        moduleId: 1,
        lessonId: 10,
        hasVideo: true,
        needsVideoWatch: true,
        watchedHits: FULL,
        applicableSections: 2,
        tappedSections: 0,
      }),
    ]);
    expect(lessons[0].percent).toBe(50);
    expect(lessons[0].watched).toBe(true);
  });
});

describe('rollups', () => {
  it('module% is the average of its lessons; counts watched/total', () => {
    const { modules } = aggregateCourseProgress('c', [
      watchable(1, 10, FULL),
      watchable(1, 11, 9),
    ]);
    expect(modules).toEqual([
      { moduleId: 1, percent: 75, watchedLessons: 1, totalLessons: 2 },
    ]);
  });

  it('course% is the average of module percents (not lesson-weighted)', () => {
    const result = aggregateCourseProgress('c', [
      watchable(1, 10, FULL),
      watchable(1, 11, FULL),
      ...Array.from({ length: 20 }, (_, i) => watchable(2, 100 + i, 9)),
    ]);
    expect(result.modules.map((m) => m.percent)).toEqual([100, 50]);
    expect(result.percent).toBe(75); // (100 + 50) / 2, not lesson-weighted 55
    expect(result.totalLessons).toBe(22);
    expect(result.watchedLessons).toBe(2);
  });

  it('preserves the row order for modules and lessons', () => {
    const result = aggregateCourseProgress('c', [
      watchable(5, 50, 0),
      watchable(5, 51, 0),
      watchable(3, 30, 0),
    ]);
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

describe('empty modules', () => {
  it('are returned at 0% but excluded from the course average', () => {
    const result = aggregateCourseProgress('c', [
      watchable(1, 10, FULL),
      row({ moduleId: 2, ...EMPTY_MODULE }),
    ]);
    expect(result.modules).toEqual([
      { moduleId: 1, percent: 100, watchedLessons: 1, totalLessons: 1 },
      { moduleId: 2, percent: 0, watchedLessons: 0, totalLessons: 0 },
    ]);
    // A learner who finished everything that exists reads 100%, not 50%, even
    // though an unbuilt module still renders its heading.
    expect(result.percent).toBe(100);
    expect(result.lessons).toHaveLength(1); // placeholder is not a lesson
  });

  it('leave a course of nothing but empty modules at 0%, never 100%', () => {
    // A course still being built is ALL empty modules. Scoring them 100 (what
    // the old platform did) would show every enrolled learner a finished
    // course on day one.
    const result = aggregateCourseProgress('c', [
      row({ moduleId: 1, ...EMPTY_MODULE }),
      row({ moduleId: 2, ...EMPTY_MODULE }),
    ]);
    expect(result.percent).toBe(0);
    expect(result.totalLessons).toBe(0);
  });
});

describe('aggregatePercentByCourse', () => {
  const many = (
    over: Partial<ManyCourseProgressRow> & {
      courseId: number;
      moduleId: number | null;
      lessonId: number | null;
    },
  ): ManyCourseProgressRow => ({
    ...row({ moduleId: 0, lessonId: null }),
    ...over,
  });

  it('computes each course independently', () => {
    const percents = aggregatePercentByCourse([
      many({
        courseId: 1,
        moduleId: 10,
        lessonId: 100,
        hasVideo: true,
        needsVideoWatch: true,
        watchedHits: FULL,
      }),
      many({
        courseId: 2,
        moduleId: 20,
        lessonId: 200,
        hasVideo: true,
        needsVideoWatch: true,
        watchedHits: 9,
      }),
    ]);
    expect(percents.get(1)).toBe(100);
    expect(percents.get(2)).toBe(50);
  });

  it('carries the component model through to the card percentage', () => {
    // The /app card and the sidebar read from different queries; both must
    // score the same lesson the same way or they visibly disagree.
    const percents = aggregatePercentByCourse([
      many({
        courseId: 1,
        moduleId: 10,
        lessonId: 100,
        applicableSections: 2,
        tappedSections: 1,
      }),
    ]);
    expect(percents.get(1)).toBe(50);
  });

  it('separates rows from different courses that share module/lesson ids', () => {
    const percents = aggregatePercentByCourse([
      many({ courseId: 1, moduleId: 1, lessonId: 1, visited: true }),
      many({ courseId: 2, moduleId: 1, lessonId: 1, visited: false }),
    ]);
    expect(percents.get(1)).toBe(100);
    expect(percents.get(2)).toBe(0);
  });

  it('registers a course with a null-moduleId placeholder row at 0%, not omitted', () => {
    const percents = aggregatePercentByCourse([
      many({ courseId: 3, moduleId: null, lessonId: null }),
    ]);
    expect(percents.has(3)).toBe(true);
    expect(percents.get(3)).toBe(0);
  });

  it('ignores a null-moduleId row for a course that also has real module rows', () => {
    // Should not happen from the real query (a course either has modules or it
    // doesn't), but a stray null row must not drag down a complete course.
    const percents = aggregatePercentByCourse([
      many({ courseId: 4, moduleId: null, lessonId: null }),
      many({ courseId: 4, moduleId: 40, lessonId: 400, visited: true }),
    ]);
    expect(percents.get(4)).toBe(100);
  });

  it('returns an empty map for no rows', () => {
    expect(aggregatePercentByCourse([]).size).toBe(0);
  });
});
