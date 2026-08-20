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
  coursesTable: {},
  lessonDependenciesTable: {},
  lessonMaterialProgressTable: {},
  lessonsTable: {},
  moduleDependenciesTable: {},
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
    applicableSections: 0,
    tappedSections: 0,
    hasDebrief: false,
    hasQuiz: false,
    canDebrief: false,
    quizPlayed: false,
    debriefAnswered: false,
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
