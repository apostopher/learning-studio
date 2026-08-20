// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  getCourseSlugForLesson: vi.fn(),
  getUserRoleNames: vi.fn(),
  getCourseDetailsWithCache: vi.fn(),
  getCourseProgress: vi.fn(),
  isSubscribedToCourse: vi.fn(),
  getCurrentLevel: vi.fn(),
  isCourseStaff: vi.fn(),
}));

vi.mock('#/db/lesson-access', () => ({
  getCourseSlugForLesson: m.getCourseSlugForLesson,
  isSubscribedToCourse: m.isSubscribedToCourse,
}));
// `getUserRoleNames` lives in #/db/admin, not #/db/permissions — a vi.mock on
// the wrong specifier mocks nothing and lets the real drizzle module load.
vi.mock('#/db/admin', () => ({ getUserRoleNames: m.getUserRoleNames }));
vi.mock('#/db/course', () => ({
  getCourseDetailsWithCache: m.getCourseDetailsWithCache,
}));
vi.mock('#/db/course-progress', () => ({
  getCourseProgress: m.getCourseProgress,
}));
vi.mock('#/db/course-staff', () => ({ isCourseStaff: m.isCourseStaff }));
vi.mock('#/db/user-levels', () => ({ getCurrentLevel: m.getCurrentLevel }));

import { evaluateLessonGate } from '#/lib/lesson-gating.server';

/** Course 7. `basic-1` is `levels:['basic']` — invisible to an intermediate. */
const DETAILS = {
  modules: [
    {
      id: 1,
      slug: 'm1',
      name: 'Module 1',
      dependsOn: [],
      sequentialLessons: true,
      lessons: [
        {
          id: 10,
          slug: 'basic-1',
          name: 'Basic 1',
          isAvailable: true,
          hasVideo: true,
          needsVideoWatch: true,
          dependsOn: [],
          levels: ['basic'],
        },
        {
          id: 11,
          slug: 'inter-1',
          name: 'Inter 1',
          isAvailable: true,
          hasVideo: true,
          needsVideoWatch: true,
          dependsOn: [],
          levels: ['intermediate'],
        },
      ],
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  m.getCourseSlugForLesson.mockResolvedValue({
    courseSlug: 'comp-sci',
    courseId: 7,
    isAvailable: true,
  });
  m.getUserRoleNames.mockResolvedValue([]);
  m.getCourseDetailsWithCache.mockResolvedValue(DETAILS);
  m.isSubscribedToCourse.mockResolvedValue(true);
  m.getCourseProgress.mockResolvedValue({ lessons: [] });
  m.getCurrentLevel.mockResolvedValue('intermediate');
  m.isCourseStaff.mockResolvedValue(false);
});

describe('course staff bypass', () => {
  it('bypasses every gate for a subject expert on their own course', async () => {
    m.getUserRoleNames.mockResolvedValue([]);
    m.isCourseStaff.mockResolvedValue(true);

    const result = await evaluateLessonGate({
      userId: 'u1',
      lessonSlug: 'basic-1',
    });

    expect(result?.outOfTier).toBeNull();
    expect(result?.lessonLock).toEqual({ kind: 'open' });
    expect(result?.materialLock).toEqual({ kind: 'open' });
    // The staff row is asked about THIS course, not "any course" — the whole
    // difference between a course-scoped grant and a global one.
    expect(m.isCourseStaff).toHaveBeenCalledWith('u1', 7);
  });

  it('reports the bypass so the UI can render the author preview notice', async () => {
    // `isAdmin` now means "viewing as author": an SME previewing their own
    // course is exactly the situation <AdminPreviewNote /> describes, and a
    // silent bypass would be indistinguishable from a broken gate.
    m.isCourseStaff.mockResolvedValue(true);

    const result = await evaluateLessonGate({
      userId: 'u1',
      lessonSlug: 'basic-1',
    });

    expect(result?.isAdmin).toBe(true);
    expect(result?.subscribed).toBe(true);
  });

  it('does not consult the tier at all for course staff', async () => {
    // The bypass must not acquire a tier-shaped condition: staff author every
    // tier of their own course, the same short-circuit admins get.
    m.isCourseStaff.mockResolvedValue(true);

    await evaluateLessonGate({ userId: 'u1', lessonSlug: 'basic-1' });

    expect(m.getCurrentLevel).not.toHaveBeenCalled();
    expect(m.isSubscribedToCourse).not.toHaveBeenCalled();
  });

  it('gates a subject expert normally on a course they do not staff', async () => {
    // The Biology professor opening Computer Science. They hold
    // `subject-expert` — on course 99, not on course 7 — so here they are an
    // ordinary intermediate learner, and `basic-1` is out of their tier.
    m.getUserRoleNames.mockResolvedValue([]);
    m.isCourseStaff.mockImplementation(
      async (_userId: string, courseId: number) => courseId === 99,
    );
    m.getCurrentLevel.mockResolvedValue('intermediate');

    const result = await evaluateLessonGate({
      userId: 'u1',
      lessonSlug: 'basic-1',
    });

    expect(result?.outOfTier).not.toBeNull();
    expect(result?.isAdmin).toBe(false);
    expect(m.isCourseStaff).toHaveBeenCalledWith('u1', 7);
  });

  it('enforces enrolment on a course they do not staff', async () => {
    m.isCourseStaff.mockResolvedValue(false);
    m.isSubscribedToCourse.mockResolvedValue(false);

    const result = await evaluateLessonGate({
      userId: 'u1',
      lessonSlug: 'inter-1',
    });

    expect(result?.subscribed).toBe(false);
  });

  it('does not query staff for an admin — they bypass on role alone', async () => {
    m.getUserRoleNames.mockResolvedValue(['admin']);

    await evaluateLessonGate({ userId: 'u1', lessonSlug: 'basic-1' });

    // This path runs on every gated request, including the video-progress
    // beacon's repeated calls. An admin must not pay a query for authority
    // their role already settles.
    expect(m.isCourseStaff).not.toHaveBeenCalled();
  });

  it('does not query staff for an owner either', async () => {
    m.getUserRoleNames.mockResolvedValue(['owner']);

    const result = await evaluateLessonGate({
      userId: 'u1',
      lessonSlug: 'basic-1',
    });

    expect(result?.isAdmin).toBe(true);
    expect(m.isCourseStaff).not.toHaveBeenCalled();
  });
});
