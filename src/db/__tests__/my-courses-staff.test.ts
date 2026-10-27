// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `getMyCourses` decides the author bypass ONCE for a list of cards, so this
 * file watches two things at the same time: that a staffed course gets the
 * bypass while every other card on the same grid stays gated, and that the
 * staff lookup is one query for the whole grid rather than one per card.
 *
 * db/course.ts pulls in the real drizzle client, `@/db/schema` (whose
 * `@/types` value import vitest cannot resolve — see memory: vitest can't
 * resolve @/, use #/), and a real `Redis.fromEnv()` at module scope. Following
 * the repo's "fully stub, never importOriginal an internal module with `@/`
 * value imports" pattern, all of it is stubbed: the query chain ignores every
 * argument and resolves with whatever rows the test set.
 */
const dbState = vi.hoisted(() => ({ rows: [] as unknown[] }));
const m = vi.hoisted(() => ({
  getUserRoleNames: vi.fn(),
  getLastViewedLessonIdsByCourse: vi.fn(),
  getCurrentLevelsByCourse: vi.fn(),
  getStaffCourseIds: vi.fn(),
  resolveCardResume: vi.fn(),
}));

vi.mock('#/db', () => {
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    leftJoin: () => chain,
    where: () => chain,
    groupBy: () => chain,
    orderBy: () => Promise.resolve(dbState.rows),
  };
  return { db: { select: () => chain } };
});
vi.mock('@/db/schema', () => ({
  courseSubscriptionsTable: {},
  courseModulesTable: {},
  coursesTable: {},
  lessonDependenciesTable: {},
  lessonMaterialProgressTable: {},
  lessonsTable: {},
  moduleDependenciesTable: {},
  moduleLessonsTable: {},
  modulesTable: {},
  orgLessonsTable: {},
  orgsTable: {},
  videoProgressTable: {},
}));
// Course payloads come back per slug, so each card's `resolveCardResume` call
// can be told apart by the course it carries.
vi.mock('@/integrations/upstash/redis', () => ({
  cacheWithRedis: (_prefix: string, _fn: unknown) => async (slug: string) => ({
    id: slug === 'own-course' ? 7 : 8,
    slug,
    modules: [],
  }),
}));
vi.mock('#/db/admin', () => ({ getUserRoleNames: m.getUserRoleNames }));
vi.mock('#/db/course-last-viewed-batch', () => ({
  getLastViewedLessonIdsByCourse: m.getLastViewedLessonIdsByCourse,
}));
vi.mock('#/db/user-levels', () => ({
  getCurrentLevelsByCourse: m.getCurrentLevelsByCourse,
}));
vi.mock('#/db/course-staff', () => ({
  getStaffCourseIds: m.getStaffCourseIds,
  // course.ts imports this for `getSubscribedCourseSlugs`; unused here, but a
  // factory that omits it fails the module import outright.
  getStaffCourseSlugs: vi.fn(),
}));
vi.mock('#/db/progress-components', () => ({
  progressComponentColumns: () => ({}),
  progressComponentGroupBy: [],
  toComponentFields: () => ({
    hasVideo: true,
    needsVideoWatch: true,
    applicableSectionNames: [],
    tappedSectionNames: [],
    hasDebrief: false,
    hasQuiz: false,
    quizPlayed: false,
    debriefBearing: false,
    debriefPassed: false,
    lastFailedDebriefAt: null,
    doneAt: null,
    visited: false,
  }),
}));
// The collaborator this site actually reports to: `level` and `bypassLocks`
// are the whole of what the bypass produces here, and `course-card-resume.ts`
// takes both as parameters — which is why that file needs no change of its own.
vi.mock('#/lib/course-card-resume', () => ({
  resolveCardResume: m.resolveCardResume,
}));

import { getMyCourses } from '#/db/course';

const row = (courseId: number, slug: string, name: string) => ({
  courseId,
  name,
  slug,
  imageUrlAvif: null,
  imageUrlWebp: null,
  moduleId: 1,
  lessonId: courseId * 10,
  levels: ['basic'],
  watchedHits: 0,
});

/** The arguments the card for this course id was resolved with. */
const argsForCourse = (id: number) => {
  const call = m.resolveCardResume.mock.calls.find(
    ([arg]) => (arg as { details: { id: number } }).details.id === id,
  );
  if (!call) throw new Error(`resolveCardResume was never called for ${id}`);
  return call[0] as { level: unknown; bypassLocks: boolean };
};

beforeEach(() => {
  vi.clearAllMocks();
  dbState.rows = [
    row(7, 'own-course', 'A Course They Staff'),
    row(8, 'other-course', 'Someone Else’s Course'),
  ];
  m.getUserRoleNames.mockResolvedValue([]);
  m.getLastViewedLessonIdsByCourse.mockResolvedValue(new Map());
  m.getCurrentLevelsByCourse.mockResolvedValue(
    new Map([
      [7, 'intermediate'],
      [8, 'intermediate'],
    ]),
  );
  m.getStaffCourseIds.mockResolvedValue(new Set<number>());
  m.resolveCardResume.mockReturnValue({ kind: 'none', reason: 'no-lessons' });
});

describe('getMyCourses — done lessons', () => {
  it('hands each card the lessons with a completion row in that course', async () => {
    // `doneAt` is the row's `lesson_completions` subquery. Done, not watched,
    // is what unlocks the next lesson, so the card must receive it.
    dbState.rows = [
      { ...row(7, 'own-course', 'A'), lessonId: 70, doneAt: new Date() },
      { ...row(7, 'own-course', 'A'), lessonId: 71, doneAt: null },
      { ...row(8, 'other-course', 'B'), lessonId: 80, doneAt: null },
    ];

    await getMyCourses('u1');

    const doneOf = (id: number) =>
      (argsForCourse(id) as unknown as { doneLessonIds: Set<number> })
        .doneLessonIds;
    expect([...doneOf(7)]).toEqual([70]);
    expect([...doneOf(8)]).toEqual([]);
  });
});

describe('getMyCourses — course staff', () => {
  it('bypasses locks and the tier on the card for a course they staff', async () => {
    m.getStaffCourseIds.mockResolvedValue(new Set([7]));

    await getMyCourses('u1');

    expect(argsForCourse(7)).toMatchObject({ level: null, bypassLocks: true });
  });

  it('leaves every other card on the same grid fully gated', async () => {
    // The property that makes "staff are also students" true: one grid, two
    // cards, and only the staffed one reads as an author's.
    m.getStaffCourseIds.mockResolvedValue(new Set([7]));

    await getMyCourses('u1');

    expect(argsForCourse(8)).toMatchObject({
      level: 'intermediate',
      bypassLocks: false,
    });
  });

  it('gates both cards for a learner who staffs nothing', async () => {
    m.getStaffCourseIds.mockResolvedValue(new Set<number>());

    await getMyCourses('u1');

    expect(argsForCourse(7)).toMatchObject({
      level: 'intermediate',
      bypassLocks: false,
    });
    expect(argsForCourse(8)).toMatchObject({
      level: 'intermediate',
      bypassLocks: false,
    });
  });

  it('hands a learner with no level row in a course a null level, never a guessed basic', async () => {
    // Strict levels: no level means the card resolves against nothing, so
    // it says "your level has not been set" rather than linking into Basic.
    m.getCurrentLevelsByCourse.mockResolvedValue(new Map([[8, 'advanced']]));

    await getMyCourses('u1');

    expect(argsForCourse(7)).toMatchObject({ level: null, bypassLocks: false });
    expect(argsForCourse(8)).toMatchObject({
      level: 'advanced',
      bypassLocks: false,
    });
  });

  it('gives a learner with no level in a course 0%, however much they watched', async () => {
    // Both courses' only lesson is Basic and fully watched. Course 8 has a
    // Basic level, so it is the control: the same rows score above 0 there.
    dbState.rows = [
      { ...row(7, 'own-course', 'A Course They Staff'), watchedHits: 99 },
      { ...row(8, 'other-course', 'Someone Else’s Course'), watchedHits: 99 },
    ];
    m.getCurrentLevelsByCourse.mockResolvedValue(new Map([[8, 'basic']]));

    const cards = await getMyCourses('u1');
    const percentOf = (id: number) => cards.find((c) => c.id === id)?.percent;

    expect(percentOf(8)).toBeGreaterThan(0);
    expect(percentOf(7)).toBe(0);
  });

  it('resolves the staffed courses in ONE query, not one per card', async () => {
    m.getStaffCourseIds.mockResolvedValue(new Set([7]));

    await getMyCourses('u1');

    // /app is the landing page; a per-card lookup here is an N+1 on it.
    expect(m.getStaffCourseIds).toHaveBeenCalledTimes(1);
    expect(m.getStaffCourseIds).toHaveBeenCalledWith('u1');
  });

  it('does not query staff for an admin — they bypass on role alone', async () => {
    m.getUserRoleNames.mockResolvedValue(['admin']);

    await getMyCourses('a1');

    expect(m.getStaffCourseIds).not.toHaveBeenCalled();
    expect(argsForCourse(7)).toMatchObject({ level: null, bypassLocks: true });
    expect(argsForCourse(8)).toMatchObject({ level: null, bypassLocks: true });
  });
});
