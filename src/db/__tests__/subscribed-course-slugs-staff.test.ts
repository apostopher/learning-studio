// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `getSubscribedCourseSlugs` is the enrolment guard on `/course/$courseSlug`,
 * and it sits IN FRONT of all eight staff gate-bypass sites: whatever it
 * leaves out, a professor is redirected away from before any bypass behind it
 * can run.
 *
 * The consumer's entire use of the return value is
 * `slugs.includes(params.courseSlug)` (see `routes/_authed/course.$courseSlug`),
 * so membership of the returned list IS what the consumer received.
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
  getStaffCourseSlugs: vi.fn(),
  getStaffCourseIds: vi.fn(),
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
vi.mock('@/integrations/upstash/redis', () => ({
  cacheWithRedis: (_prefix: string, fn: unknown) => fn,
}));
vi.mock('#/db/admin', () => ({ getUserRoleNames: vi.fn() }));
vi.mock('#/db/course-last-viewed-batch', () => ({
  getLastViewedLessonIdsByCourse: vi.fn(),
}));
vi.mock('#/db/user-levels', () => ({ getCurrentLevelsByCourse: vi.fn() }));
vi.mock('#/db/course-staff', () => ({
  getStaffCourseIds: m.getStaffCourseIds,
  getStaffCourseSlugs: m.getStaffCourseSlugs,
}));
vi.mock('#/db/progress-components', () => ({
  progressComponentColumns: () => ({}),
  progressComponentGroupBy: [],
  toComponentFields: () => ({}),
}));

import { getSubscribedCourseSlugs } from '#/db/course';

beforeEach(() => {
  vi.clearAllMocks();
  dbState.rows = [{ slug: 'enrolled-course' }];
  m.getStaffCourseSlugs.mockResolvedValue([]);
});

describe('getSubscribedCourseSlugs — course staff', () => {
  it('admits a course the user staffs but is not enrolled in', async () => {
    // The bug this closes: an admin revoking a professor's enrolment (or an
    // SME's appointee never getting one) redirected them off their own course
    // while `course_staff` still said they authored it.
    m.getStaffCourseSlugs.mockResolvedValue(['staffed-course']);

    const slugs = await getSubscribedCourseSlugs('u1');

    expect(slugs).toContain('staffed-course');
  });

  it('keeps the enrolled courses too', async () => {
    m.getStaffCourseSlugs.mockResolvedValue(['staffed-course']);

    const slugs = await getSubscribedCourseSlugs('u1');

    expect(slugs).toContain('enrolled-course');
  });

  it('lists a course the user both staffs and is enrolled in exactly once', async () => {
    m.getStaffCourseSlugs.mockResolvedValue(['enrolled-course']);

    const slugs = await getSubscribedCourseSlugs('u1');

    expect(slugs).toEqual(['enrolled-course']);
  });

  it('admits nothing extra for a learner who staffs no course', async () => {
    const slugs = await getSubscribedCourseSlugs('u1');

    expect(slugs).toEqual(['enrolled-course']);
  });

  it('asks for the staffed slugs of the session user', async () => {
    await getSubscribedCourseSlugs('u1');

    expect(m.getStaffCourseSlugs).toHaveBeenCalledWith('u1');
  });
});
