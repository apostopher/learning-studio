// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  getCourseSlugForLesson: vi.fn(),
  getUserRoleNames: vi.fn(),
  getCourseDetailsWithCache: vi.fn(),
  getCourseProgress: vi.fn(),
  isSubscribedToCourse: vi.fn(),
  getCurrentLevel: vi.fn(),
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
vi.mock('#/db/user-levels', () => ({ getCurrentLevel: m.getCurrentLevel }));

import { evaluateLessonGate } from '#/lib/lesson-gating.server';

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
    courseSlug: 'c1',
    courseId: 7,
    isAvailable: true,
  });
  m.getUserRoleNames.mockResolvedValue([]);
  m.getCourseDetailsWithCache.mockResolvedValue(DETAILS);
  m.isSubscribedToCourse.mockResolvedValue(true);
  m.getCourseProgress.mockResolvedValue({ lessons: [] });
});

describe('level enforcement', () => {
  it('asks for the level of the course the lesson belongs to', async () => {
    // The mocks are only load-bearing if they actually replaced the modules.
    // A wrong vi.mock path leaves the real drizzle-backed getCurrentLevel in
    // place, which would never be called with these arguments.
    m.getCurrentLevel.mockResolvedValue('intermediate');
    await evaluateLessonGate({ userId: 'u1', lessonSlug: 'inter-1' });
    expect(m.getCurrentLevel).toHaveBeenCalledWith('u1', 7);
  });

  it('opens a lesson at the pilot’s own tier', async () => {
    m.getCurrentLevel.mockResolvedValue('intermediate');
    const result = await evaluateLessonGate({
      userId: 'u1',
      lessonSlug: 'inter-1',
    });
    expect(result?.outOfTier).toBeNull();
  });

  it('marks an out-of-tier lesson out of tier, not open', async () => {
    m.getCurrentLevel.mockResolvedValue('intermediate');
    const result = await evaluateLessonGate({
      userId: 'u1',
      lessonSlug: 'basic-1',
    });
    expect(result?.outOfTier).not.toBeNull();
  });

  it('makes an out-of-tier lesson read-only when it was completed', async () => {
    m.getCurrentLevel.mockResolvedValue('intermediate');
    m.getCourseProgress.mockResolvedValue({
      lessons: [{ lessonId: 10, moduleId: 1, percent: 100, watched: true }],
    });
    const result = await evaluateLessonGate({
      userId: 'u1',
      lessonSlug: 'basic-1',
    });
    expect(result?.outOfTier).toEqual({ readOnly: true });
  });

  it('refuses an out-of-tier lesson that was never completed', async () => {
    m.getCurrentLevel.mockResolvedValue('intermediate');
    m.getCourseProgress.mockResolvedValue({
      lessons: [{ lessonId: 10, moduleId: 1, percent: 60, watched: false }],
    });
    const result = await evaluateLessonGate({
      userId: 'u1',
      lessonSlug: 'basic-1',
    });
    expect(result?.outOfTier).toEqual({ readOnly: false });
  });

  it('does not let a hidden lesson gate a visible one', async () => {
    // inter-1 sits after basic-1 in a sequential module. An intermediate pilot
    // has never watched basic-1, so an unfiltered gate would lock inter-1.
    m.getCurrentLevel.mockResolvedValue('intermediate');
    const result = await evaluateLessonGate({
      userId: 'u1',
      lessonSlug: 'inter-1',
    });
    expect(result?.lessonLock).toEqual({ kind: 'open' });
  });

  it('reports the level so callers can name it in copy', async () => {
    m.getCurrentLevel.mockResolvedValue('advanced');
    const result = await evaluateLessonGate({
      userId: 'u1',
      lessonSlug: 'inter-1',
    });
    expect(result?.level).toBe('advanced');
  });

  it('rejects rather than skipping the check when the payload omits the lesson', async () => {
    // The lesson resolved in getCourseSlugForLesson and is available, so a
    // payload that does not contain it is a broken payload. Returning a
    // verdict here would skip the level check and hand the decision to locks
    // that answer `open` for a lesson they cannot locate — the one line the
    // fail-closed intent rests on would be the line that fails open.
    m.getCurrentLevel.mockResolvedValue('intermediate');
    m.getCourseSlugForLesson.mockResolvedValue({
      courseSlug: 'c1',
      courseId: 7,
      isAvailable: true,
    });
    await expect(
      evaluateLessonGate({ userId: 'u1', lessonSlug: 'not-in-payload' }),
    ).rejects.toThrow(/not-in-payload/);
  });

  it('bypasses the level entirely for an admin', async () => {
    // The admin path must not consult the level at all: an admin authors every
    // tier, and a level lookup there is a chance for the bypass to acquire a
    // tier-shaped condition it should never have.
    m.getUserRoleNames.mockResolvedValue(['admin']);
    const result = await evaluateLessonGate({
      userId: 'u1',
      lessonSlug: 'basic-1',
    });
    expect(result?.outOfTier).toBeNull();
    expect(result?.lessonLock).toEqual({ kind: 'open' });
    expect(m.getCurrentLevel).not.toHaveBeenCalled();
  });
});
