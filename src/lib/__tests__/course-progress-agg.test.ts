import { describe, expect, it } from 'vitest';
import { watchedMilestones } from '#/lib/course-milestones';
import {
  aggregateCourseProgress,
  aggregatePercentByCourse,
  coursePercent,
  type LessonProgressRow,
  lessonOutstanding,
  type ManyCourseProgressRow,
} from '#/lib/course-progress-agg';
import { TRACKED_LESSON_SECTIONS } from '#/lib/lesson-visit-section';

const FULL = watchedMilestones.length; // 18 — all watched-milestones hit

/** The first n tracked sections, in canonical order. */
const secs = (n: number) => TRACKED_LESSON_SECTIONS.slice(0, n);

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
  applicableSectionNames: [],
  tappedSectionNames: [],
  hasDebrief: false,
  debriefBearing: false,
  flagshipDiscipline: false,
  hasQuiz: false,
  quizPlayed: false,
  debriefPassed: false,
  lastFinishedDebriefAt: null,
  hasOpenDebrief: false,
  chunksCleared: 0,
  chunksTotal: null,
  doneAt: null,
  videoWatchedAt: null,
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
        applicableSectionNames: secs(4),
        tappedSectionNames: secs(1),
      }),
      row({
        moduleId: 1,
        lessonId: 11,
        applicableSectionNames: secs(4),
        tappedSectionNames: secs(4),
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
        applicableSectionNames: secs(2),
        tappedSectionNames: secs(5),
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
});

describe('quiz and debrief', () => {
  it('quiz counts even when hasDebrief', () => {
    const { lessons } = aggregateCourseProgress('c', [
      row({
        moduleId: 1,
        lessonId: 10,
        hasVideo: true,
        needsVideoWatch: true,
        watchedHits: FULL,
        hasQuiz: true,
        quizPlayed: false,
        hasDebrief: true,
        debriefBearing: true,
        applicableSectionNames: [],
      }),
    ]);
    expect(lessons[0].percent).toBe(50);
  });

  it('debrief never counts toward lesson percent', () => {
    const { lessons } = aggregateCourseProgress('c', [
      row({
        moduleId: 1,
        lessonId: 10,
        hasVideo: true,
        needsVideoWatch: true,
        watchedHits: FULL,
        hasQuiz: true,
        quizPlayed: true,
        hasDebrief: true,
        debriefBearing: true,
        debriefPassed: false,
      }),
    ]);
    expect(lessons[0].percent).toBe(100);
  });
});

describe('outstanding items', () => {
  const lesson = (over: Partial<LessonProgressRow>) =>
    row({ moduleId: 1, lessonId: 10, ...over });

  it('lists exactly what is missing, in order video, quiz, sections, visit', () => {
    expect(
      lessonOutstanding(
        lesson({
          hasVideo: true,
          needsVideoWatch: true,
          watchedHits: 4,
          hasQuiz: true,
          quizPlayed: false,
          applicableSectionNames: ['keyPoints', 'links', 'assignments'],
          tappedSectionNames: ['keyPoints'],
        }),
      ),
    ).toEqual([
      { kind: 'video' },
      { kind: 'quiz' },
      { kind: 'section', section: 'links' },
      { kind: 'section', section: 'assignments' },
    ]);
  });

  it('an empty lesson is outstanding as visit until visited', () => {
    expect(lessonOutstanding(lesson({}))).toEqual([{ kind: 'visit' }]);
    expect(lessonOutstanding(lesson({ visited: true }))).toEqual([]);
  });

  it('is empty exactly when the lesson reports 100%, and reaches the payload', () => {
    const done = lesson({
      hasQuiz: true,
      quizPlayed: true,
      applicableSectionNames: ['keyPoints'],
      tappedSectionNames: ['keyPoints', 'links'],
    });
    const open = lesson({ lessonId: 11, hasQuiz: true });
    const { lessons } = aggregateCourseProgress('c', [done, open]);
    expect(lessons.map((l) => [l.percent, l.outstanding])).toEqual([
      [100, []],
      [0, [{ kind: 'quiz' }]],
    ]);
  });
});

describe('done and debrief facts', () => {
  it('done comes from doneAt, not percent', () => {
    const { lessons } = aggregateCourseProgress('c', [
      row({
        moduleId: 1,
        lessonId: 10,
        applicableSectionNames: secs(2),
        tappedSectionNames: secs(1),
        doneAt: '2026-10-01T00:00:00Z',
      }),
      row({ moduleId: 1, lessonId: 11, visited: true, doneAt: null }),
    ]);
    expect(lessons.map((l) => [l.percent, l.done])).toEqual([
      [50, true],
      [100, false],
    ]);
  });

  it('passes the debrief facts through to the payload', () => {
    const { lessons } = aggregateCourseProgress('c', [
      row({
        moduleId: 1,
        lessonId: 10,
        debriefBearing: true,
        debriefPassed: true,
        lastFinishedDebriefAt: '2026-10-02T00:00:00Z',
        hasOpenDebrief: true,
        chunksCleared: 5,
        chunksTotal: 7,
        doneAt: '2026-10-01T00:00:00Z',
      }),
    ]);
    expect(lessons[0].debrief).toEqual({
      clockStartAt: '2026-10-01T00:00:00Z',
      passed: true,
      lastFinishedAt: '2026-10-02T00:00:00Z',
      hasOpenAttempt: true,
      mastery: { cleared: 5, total: 7 },
      hasVideo: false,
      bearing: true,
    });
  });

  it('every current chunk cleared reads as passed for the ring too, so it agrees with the 100 in the course percent', () => {
    const { lessons } = aggregateCourseProgress('c', [
      row({
        moduleId: 1,
        lessonId: 10,
        debriefBearing: true,
        debriefPassed: false,
        chunksCleared: 4,
        chunksTotal: 4,
        doneAt: '2026-10-01T00:00:00Z',
      }),
    ]);
    expect(lessons[0].debrief.passed).toBe(true);
  });

  it('a lesson with no stored chunks has null mastery, whatever the cleared count', () => {
    const { lessons } = aggregateCourseProgress('c', [
      row({ moduleId: 1, lessonId: 10, chunksCleared: 3, chunksTotal: null }),
    ]);
    expect(lessons[0].debrief.mastery).toBeNull();
  });

  it('keeps hasVideo on the debrief, for the debrief-status copy', () => {
    const { lessons } = aggregateCourseProgress('c', [
      row({ moduleId: 1, lessonId: 10, hasVideo: true }),
    ]);
    expect(lessons[0].debrief.hasVideo).toBe(true);
  });

  it('starts the debrief clock when the video is watched, before the lesson is done', () => {
    const { lessons } = aggregateCourseProgress('c', [
      row({
        moduleId: 1,
        lessonId: 10,
        hasVideo: true,
        videoWatchedAt: '2026-10-01T08:00:00Z',
        doneAt: null,
      }),
      row({
        moduleId: 1,
        lessonId: 11,
        hasVideo: true,
        videoWatchedAt: '2026-10-01T08:00:00Z',
        doneAt: '2026-10-03T00:00:00Z',
      }),
    ]);
    expect(lessons.map((l) => [l.done, l.debrief.clockStartAt])).toEqual([
      [false, '2026-10-01T08:00:00Z'],
      [true, '2026-10-01T08:00:00Z'],
    ]);
  });

  it("does not start a video lesson's clock on done alone — only the full watch does", () => {
    const { lessons } = aggregateCourseProgress('c', [
      row({
        moduleId: 1,
        lessonId: 10,
        hasVideo: true,
        doneAt: '2026-10-03T00:00:00Z',
      }),
    ]);
    expect(lessons[0].debrief.clockStartAt).toBeNull();
  });

  it('starts the debrief clock at done when there is no watched video', () => {
    const { lessons } = aggregateCourseProgress('c', [
      row({ moduleId: 1, lessonId: 10, doneAt: '2026-10-03T00:00:00Z' }),
    ]);
    expect(lessons[0].debrief.clockStartAt).toBe('2026-10-03T00:00:00Z');
  });
});

describe('ringPercent — the staged ring the learner sees', () => {
  /** Video + quiz + bearing debrief: the full lesson the stages describe. */
  const full = (over: Partial<LessonProgressRow> = {}) =>
    row({
      moduleId: 1,
      lessonId: 10,
      hasVideo: true,
      needsVideoWatch: true,
      hasQuiz: true,
      hasDebrief: true,
      debriefBearing: true,
      ...over,
    });
  const ring = (r: LessonProgressRow) =>
    aggregateCourseProgress('c', [r]).lessons[0].ringPercent;

  it('closes in stages: video 50, quiz 75, passed debrief 100', () => {
    expect(ring(full())).toBe(0);
    expect(ring(full({ watchedHits: FULL }))).toBe(50);
    expect(ring(full({ watchedHits: FULL, quizPlayed: true }))).toBe(75);
    expect(
      ring(full({ watchedHits: FULL, quizPlayed: true, debriefPassed: true })),
    ).toBe(100);
  });

  it('fills the video stage as the video is watched', () => {
    expect(ring(full({ watchedHits: 9 }))).toBe(25);
  });

  it('credits each stage on its own, whatever order they are done in', () => {
    expect(ring(full({ quizPlayed: true }))).toBe(25);
  });

  it('every current chunk cleared counts as passed', () => {
    expect(
      ring(
        full({
          watchedHits: FULL,
          quizPlayed: true,
          chunksCleared: 7,
          chunksTotal: 7,
        }),
      ),
    ).toBe(100);
  });

  it('ignores the material tabs, which still count toward done', () => {
    const r = full({
      watchedHits: FULL,
      quizPlayed: true,
      debriefPassed: true,
      applicableSectionNames: secs(2),
    });
    const [lesson] = aggregateCourseProgress('c', [r]).lessons;
    expect(lesson.ringPercent).toBe(100);
    expect(lesson.percent).toBeLessThan(100);
  });

  it('spreads a missing stage over the ones the lesson has', () => {
    // No quiz: video 2/3, debrief 1/3.
    expect(ring(full({ hasQuiz: false, watchedHits: FULL }))).toBe(67);
    // No bearing debrief: video and quiz finish it.
    expect(
      ring(
        full({ debriefBearing: false, watchedHits: FULL, quizPlayed: true }),
      ),
    ).toBe(100);
  });

  it('debrief switched off: video 50, quiz 100', () => {
    const off = { hasDebrief: false, debriefBearing: false };
    expect(ring(full({ ...off, watchedHits: FULL }))).toBe(50);
    expect(ring(full({ ...off, watchedHits: FULL, quizPlayed: true }))).toBe(
      100,
    );
    expect(ring(full({ ...off, quizPlayed: true }))).toBe(50);
  });

  it('does not ask for a video the lesson does not require', () => {
    expect(ring(full({ needsVideoWatch: false, quizPlayed: true }))).toBe(50);
  });

  it('falls back to the lesson percent when no stage applies', () => {
    expect(
      ring(
        row({
          moduleId: 1,
          lessonId: 10,
          applicableSectionNames: secs(2),
          tappedSectionNames: secs(1),
        }),
      ),
    ).toBe(50);
    expect(ring(row({ moduleId: 1, lessonId: 10, visited: true }))).toBe(100);
  });
});

describe('ringPercent — 3D Airmanship lessons, where the debrief is optional', () => {
  const flagship = (over: Partial<LessonProgressRow> = {}) =>
    row({
      moduleId: 1,
      lessonId: 10,
      flagshipDiscipline: true,
      hasVideo: true,
      needsVideoWatch: true,
      hasQuiz: true,
      hasDebrief: true,
      debriefBearing: true,
      ...over,
    });
  const ring = (r: LessonProgressRow) =>
    aggregateCourseProgress('c', [r]).lessons[0].ringPercent;

  it('closes on the quiz: video 50, quiz 100, no debrief needed', () => {
    expect(ring(flagship())).toBe(0);
    expect(ring(flagship({ watchedHits: FULL }))).toBe(50);
    expect(ring(flagship({ watchedHits: FULL, quizPlayed: true }))).toBe(100);
  });

  it('a passed debrief adds nothing it has not already got', () => {
    expect(ring(flagship({ watchedHits: FULL, debriefPassed: true }))).toBe(50);
  });

  it('with no quiz, the video alone closes it', () => {
    expect(ring(flagship({ hasQuiz: false, watchedHits: FULL }))).toBe(100);
  });

  it('other disciplines still wait for the debrief', () => {
    expect(
      ring(
        flagship({
          flagshipDiscipline: false,
          watchedHits: FULL,
          quizPlayed: true,
        }),
      ),
    ).toBe(75);
  });
});

describe('coursePercent', () => {
  it('is the rounded mean of the lesson rings', () => {
    expect(coursePercent([{ ringPercent: 50 }, { ringPercent: 75 }])).toBe(63);
  });

  it('is 0 for no lessons', () => {
    expect(coursePercent([])).toBe(0);
  });

  it('feeds CourseProgress.percent and module percent from the rings', () => {
    const result = aggregateCourseProgress('c', [
      row({
        moduleId: 1,
        lessonId: 10,
        hasVideo: true,
        needsVideoWatch: true,
        watchedHits: FULL,
        hasQuiz: true,
        debriefBearing: true,
      }),
    ]);
    expect(result.lessons[0].ringPercent).toBe(50);
    expect(result.modules[0].percent).toBe(50);
    expect(result.percent).toBe(50);
  });
});

describe('a lesson with no material', () => {
  it('is complete on the video alone, debrief switch or not', () => {
    // The rule for a video-only lesson: watching it IS finishing it. With no
    // material row there are no applicable sections and no authored quiz, so
    // the video is the only component.
    //
    // `hasDebrief: true` is the case that matters. Such a lesson still OFFERS a
    // debrief, generated from the video transcript, and it renders below the
    // player — but an optional debrief must never hold the lesson below 100%.
    const { lessons } = aggregateCourseProgress('c', [
      row({
        moduleId: 1,
        lessonId: 10,
        hasVideo: true,
        needsVideoWatch: true,
        watchedHits: FULL,
        hasDebrief: true,
      }),
    ]);
    expect(lessons[0].percent).toBe(100);
  });

  it('is not complete before the video is watched', () => {
    // The other half of the same rule: with the video as the only component,
    // the lesson tracks it exactly rather than resting on the visit fallback.
    const { lessons } = aggregateCourseProgress('c', [
      row({
        moduleId: 1,
        lessonId: 10,
        hasVideo: true,
        needsVideoWatch: true,
        watchedHits: 0,
        hasDebrief: true,
        visited: true,
      }),
    ]);
    expect(lessons[0].percent).toBe(0);
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
        applicableSectionNames: secs(4),
        tappedSectionNames: secs(2),
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
        applicableSectionNames: secs(2),
        tappedSectionNames: secs(2),
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
        applicableSectionNames: secs(3),
        tappedSectionNames: secs(3),
        hasDebrief: true,
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

describe('watched vs percent', () => {
  it('reports watched only for a fully watched video, never for completion', () => {
    // A lesson at 100% with no video must NOT report watched — that field
    // feeds the material lock (the lesson's own video unlocking its tabs), so
    // setting it from completion would unlock material for a video nobody
    // watched. Prerequisites read the sticky `done` instead.
    const { lessons, watchedLessons } = aggregateCourseProgress('c', [
      row({ moduleId: 1, lessonId: 10, visited: true }),
      row({
        moduleId: 1,
        lessonId: 11,
        applicableSectionNames: secs(1),
        tappedSectionNames: secs(1),
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
        applicableSectionNames: secs(2),
        tappedSectionNames: secs(0),
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

  it('course% is a flat mean over lessons (lesson-weighted), module% unchanged', () => {
    const result = aggregateCourseProgress('c', [
      watchable(1, 10, FULL),
      watchable(1, 11, FULL),
      ...Array.from({ length: 20 }, (_, i) => watchable(2, 100 + i, 9)),
    ]);
    expect(result.modules.map((m) => m.percent)).toEqual([100, 50]);
    expect(result.percent).toBe(55); // (2*100 + 20*50) / 22, not module-mean 75
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
        applicableSectionNames: secs(2),
        tappedSectionNames: secs(1),
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
