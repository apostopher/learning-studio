// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  getLessonInCourse: vi.fn(),
  getUserRoleNames: vi.fn(),
  getCourseDetailsWithCache: vi.fn(),
  getCourseProgress: vi.fn(),
  isSubscribedToCourse: vi.fn(),
  getCurrentLevel: vi.fn(),
  isCourseStaff: vi.fn(),
}));

vi.mock('#/db/lesson-access', () => ({
  getLessonInCourse: m.getLessonInCourse,
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
// The course-staff bypass runs for every non-admin, so the real (drizzle-
// backed) module would otherwise open a database connection here.
vi.mock('#/db/course-staff', () => ({ isCourseStaff: m.isCourseStaff }));
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
          levelGated: true,
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
          levelGated: true,
        },
      ],
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  m.getLessonInCourse.mockResolvedValue({
    courseId: 7,
    isAvailable: true,
  });
  m.getUserRoleNames.mockResolvedValue([]);
  m.getCourseDetailsWithCache.mockResolvedValue(DETAILS);
  m.isSubscribedToCourse.mockResolvedValue(true);
  m.getCourseProgress.mockResolvedValue({ lessons: [] });
  m.isCourseStaff.mockResolvedValue(false);
});

describe('level enforcement', () => {
  it('asks for the level of the course the lesson belongs to', async () => {
    // The mocks are only load-bearing if they actually replaced the modules.
    // A wrong vi.mock path leaves the real drizzle-backed getCurrentLevel in
    // place, which would never be called with these arguments.
    m.getCurrentLevel.mockResolvedValue('intermediate');
    await evaluateLessonGate({
      userId: 'u1',
      lessonSlug: 'inter-1',
      courseSlug: 'c1',
    });
    expect(m.getCurrentLevel).toHaveBeenCalledWith('u1', 7);
  });

  it('opens a lesson at the pilot’s own tier', async () => {
    m.getCurrentLevel.mockResolvedValue('intermediate');
    const result = await evaluateLessonGate({
      userId: 'u1',
      lessonSlug: 'inter-1',
      courseSlug: 'c1',
    });
    expect(result?.outOfTier).toBeNull();
  });

  it('opens a lesson of another tier as optional: not out of tier, never locked', async () => {
    // basic-1 is not an intermediate pilot's work, but it is theirs to watch
    // if they want (2026-11-27). It is outside the required tree the locks
    // run on, so nothing can lock it.
    m.getCurrentLevel.mockResolvedValue('intermediate');
    const result = await evaluateLessonGate({
      userId: 'u1',
      lessonSlug: 'basic-1',
      courseSlug: 'c1',
    });
    expect(result?.outOfTier).toBeNull();
    expect(result?.lessonLock).toEqual({ kind: 'open' });
  });

  it('still refuses every 3D lesson to a pilot with no level', async () => {
    m.getCurrentLevel.mockResolvedValue(null);
    const result = await evaluateLessonGate({
      userId: 'u1',
      lessonSlug: 'basic-1',
      courseSlug: 'c1',
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
      courseSlug: 'c1',
    });
    expect(result?.lessonLock).toEqual({ kind: 'open' });
  });

  it('reports the level so callers can name it in copy', async () => {
    m.getCurrentLevel.mockResolvedValue('advanced');
    const result = await evaluateLessonGate({
      userId: 'u1',
      lessonSlug: 'inter-1',
      courseSlug: 'c1',
    });
    expect(result?.level).toBe('advanced');
  });

  it('rejects rather than skipping the check when the payload omits the lesson', async () => {
    // The lesson resolved in getLessonInCourse and is available, so a
    // payload that does not contain it is a broken payload. Returning a
    // verdict here would skip the level check and hand the decision to locks
    // that answer `open` for a lesson they cannot locate — the one line the
    // fail-closed intent rests on would be the line that fails open.
    m.getCurrentLevel.mockResolvedValue('intermediate');
    m.getLessonInCourse.mockResolvedValue({
      courseId: 7,
      isAvailable: true,
    });
    await expect(
      evaluateLessonGate({
        userId: 'u1',
        lessonSlug: 'not-in-payload',
        courseSlug: 'c1',
      }),
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
      courseSlug: 'c1',
    });
    expect(result?.outOfTier).toBeNull();
    expect(result?.lessonLock).toEqual({ kind: 'open' });
    expect(m.getCurrentLevel).not.toHaveBeenCalled();
  });
});

describe("a lesson tagged 'none'", () => {
  it('is gated closed at every learner level', async () => {
    m.getCourseDetailsWithCache.mockResolvedValue({
      modules: [
        {
          ...DETAILS.modules[0],
          lessons: [
            {
              ...DETAILS.modules[0].lessons[0],
              id: 12,
              slug: 'none-1',
              levels: ['none'],
            },
          ],
        },
      ],
    });
    for (const level of ['basic', 'intermediate', 'advanced'] as const) {
      m.getCurrentLevel.mockResolvedValue(level);
      const result = await evaluateLessonGate({
        userId: 'u1',
        lessonSlug: 'none-1',
        courseSlug: 'c1',
      });
      expect(result?.outOfTier).toEqual({ readOnly: false });
    }
  });

  it('stays closed even for a pilot who completed it: None means withdrawn', async () => {
    m.getCourseDetailsWithCache.mockResolvedValue({
      modules: [
        {
          ...DETAILS.modules[0],
          lessons: [
            {
              ...DETAILS.modules[0].lessons[0],
              id: 12,
              slug: 'none-1',
              levels: ['none'],
            },
          ],
        },
      ],
    });
    m.getCourseProgress.mockResolvedValue({
      lessons: [
        { lessonId: 12, moduleId: 1, percent: 100, watched: true, done: true },
      ],
    });
    m.getCurrentLevel.mockResolvedValue('basic');
    const result = await evaluateLessonGate({
      userId: 'u1',
      lessonSlug: 'none-1',
      courseSlug: 'c1',
    });
    expect(result?.outOfTier).toEqual({ readOnly: false });
  });
});

describe('strict levels: an untagged lesson, and a pilot with no level', () => {
  const withLesson = (lesson: Record<string, unknown>) => ({
    modules: [
      {
        ...DETAILS.modules[0],
        lessons: [{ ...DETAILS.modules[0].lessons[0], ...lesson }],
      },
    ],
  });

  it('closes an untagged lesson at every learner level', async () => {
    m.getCourseDetailsWithCache.mockResolvedValue(
      withLesson({ id: 13, slug: 'untagged-1', levels: [] }),
    );
    for (const level of ['basic', 'intermediate', 'advanced'] as const) {
      m.getCurrentLevel.mockResolvedValue(level);
      const result = await evaluateLessonGate({
        userId: 'u1',
        lessonSlug: 'untagged-1',
        courseSlug: 'c1',
      });
      expect(result?.outOfTier).toEqual({ readOnly: false });
    }
  });

  it('keeps an untagged lesson closed even when the pilot completed it', async () => {
    // It was never moved to another tier, so there is no "earlier level" it
    // could be the archive of — it is simply not anyone's.
    m.getCourseDetailsWithCache.mockResolvedValue(
      withLesson({ id: 13, slug: 'untagged-1', levels: [] }),
    );
    m.getCourseProgress.mockResolvedValue({
      lessons: [
        { lessonId: 13, moduleId: 1, percent: 100, watched: true, done: true },
      ],
    });
    m.getCurrentLevel.mockResolvedValue('basic');
    const result = await evaluateLessonGate({
      userId: 'u1',
      lessonSlug: 'untagged-1',
      courseSlug: 'c1',
    });
    expect(result?.outOfTier).toEqual({ readOnly: false });
  });

  it('closes every lesson to a pilot with no level, and reports level null', async () => {
    m.getCurrentLevel.mockResolvedValue(null);
    const result = await evaluateLessonGate({
      userId: 'u1',
      lessonSlug: 'basic-1',
      courseSlug: 'c1',
    });
    expect(result?.outOfTier).toEqual({ readOnly: false });
    expect(result?.level).toBeNull();
  });

  it('does not offer a no-level pilot a read-only copy of work they completed', async () => {
    m.getCurrentLevel.mockResolvedValue(null);
    m.getCourseProgress.mockResolvedValue({
      lessons: [
        { lessonId: 10, moduleId: 1, percent: 100, watched: true, done: true },
      ],
    });
    const result = await evaluateLessonGate({
      userId: 'u1',
      lessonSlug: 'basic-1',
      courseSlug: 'c1',
    });
    expect(result?.outOfTier).toEqual({ readOnly: false });
  });
});

describe('a lesson outside 3D Airmanship', () => {
  const [mod] = DETAILS.modules;
  const uas = (levels: string[]) => ({
    ...mod.lessons[0],
    id: 20,
    slug: 'uas-1',
    levels,
    levelGated: false,
  });

  it.each([
    ['intermediate', []],
    ['intermediate', ['none']],
    ['intermediate', ['basic']],
    [null, []],
  ] as const)('is open at level %s tagged %j', async (level, levels) => {
    m.getCurrentLevel.mockResolvedValue(level);
    m.getCourseDetailsWithCache.mockResolvedValue({
      // After 3D Airmanship lessons the pilot cannot see, which must not gate it.
      modules: [{ ...mod, lessons: [mod.lessons[0], uas([...levels])] }],
    });
    const result = await evaluateLessonGate({
      userId: 'u1',
      lessonSlug: 'uas-1',
      courseSlug: 'c1',
    });
    expect(result?.outOfTier).toBeNull();
    expect(result?.lessonLock).toEqual({ kind: 'open' });
  });

  it('still waits for a UAS lesson before it', async () => {
    m.getCurrentLevel.mockResolvedValue(null);
    m.getCourseDetailsWithCache.mockResolvedValue({
      modules: [
        { ...mod, lessons: [uas([]), { ...uas([]), id: 21, slug: 'uas-2' }] },
      ],
    });
    const result = await evaluateLessonGate({
      userId: 'u1',
      lessonSlug: 'uas-2',
      courseSlug: 'c1',
    });
    expect(result?.lessonLock.kind).not.toBe('open');
  });
});
