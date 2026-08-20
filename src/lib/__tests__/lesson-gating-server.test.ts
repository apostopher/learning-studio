// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getCourseDetailsWithCache,
  getCourseProgress,
  getCourseSlugForLesson,
  isSubscribedToCourse,
  getUserRoleNames,
  getCurrentLevel,
  isCourseStaff,
} = vi.hoisted(() => ({
  getCourseDetailsWithCache: vi.fn(),
  getCourseProgress: vi.fn(),
  getCourseSlugForLesson: vi.fn(),
  isSubscribedToCourse: vi.fn(),
  getUserRoleNames: vi.fn(),
  getCurrentLevel: vi.fn(),
  isCourseStaff: vi.fn(),
}));

vi.mock('#/db/course', () => ({ getCourseDetailsWithCache }));
vi.mock('#/db/course-progress', () => ({ getCourseProgress }));
// The course-staff bypass runs for every non-admin, so the real (drizzle-
// backed) module would otherwise open a database connection here.
vi.mock('#/db/course-staff', () => ({ isCourseStaff }));
vi.mock('#/db/lesson-access', () => ({
  getCourseSlugForLesson,
  isSubscribedToCourse,
}));
vi.mock('#/db/admin', () => ({ getUserRoleNames }));
vi.mock('#/db/user-levels', () => ({ getCurrentLevel }));

import { evaluateLessonGate } from '#/lib/lesson-gating.server';

const details = {
  modules: [
    {
      id: 1,
      slug: 'm1',
      name: 'Module One',
      dependsOn: [],
      lessons: [
        {
          id: 10,
          slug: 'a',
          name: 'A',
          isAvailable: true,
          hasVideo: true,
          needsVideoWatch: true,
          levels: [],
          dependsOn: [],
        },
        {
          id: 11,
          slug: 'b',
          name: 'B',
          isAvailable: true,
          hasVideo: true,
          needsVideoWatch: true,
          levels: [],
          dependsOn: [{ lessonSlug: 'a', moduleSlug: 'm1' }],
        },
      ],
    },
  ],
};

const progress = (watchedLessonIds: number[]) => ({
  lessons: [
    {
      lessonId: 10,
      moduleId: 1,
      videoId: 'vid-a',
      percent: 0,
      watched: watchedLessonIds.includes(10),
    },
    {
      lessonId: 11,
      moduleId: 1,
      videoId: 'vid-b',
      percent: 0,
      watched: watchedLessonIds.includes(11),
    },
  ],
});

describe('evaluateLessonGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCourseSlugForLesson.mockResolvedValue({
      courseSlug: 'c1',
      courseId: 7,
      isAvailable: true,
    });
    getCourseDetailsWithCache.mockResolvedValue(details);
    getCourseProgress.mockResolvedValue(progress([]));
    isSubscribedToCourse.mockResolvedValue(true);
    getUserRoleNames.mockResolvedValue([]);
    getCurrentLevel.mockResolvedValue('basic');
    isCourseStaff.mockResolvedValue(false);
  });

  it('returns null for a lesson that does not exist', async () => {
    getCourseSlugForLesson.mockResolvedValue(null);
    expect(
      await evaluateLessonGate({ userId: 'u1', lessonSlug: 'nope' }),
    ).toBeNull();
  });

  it('returns null for an is_available = false lesson, so the learner routes 404/403 it', async () => {
    // WIP means "not ready for students". The predicate can't help here: the
    // cached course payload no longer contains unavailable lessons at all, so
    // locate() misses them and every gate reads as OPEN. Without this branch a
    // subscriber who knows a draft slug gets its full material, and the
    // /api/lesson/video route serves its pre-signed download URL.
    getCourseSlugForLesson.mockResolvedValue({
      courseSlug: 'c1',
      courseId: 7,
      isAvailable: false,
    });
    expect(
      await evaluateLessonGate({ userId: 'u1', lessonSlug: 'draft' }),
    ).toBeNull();
  });

  it('returns null for an unavailable lesson even for an admin', async () => {
    // Consistent with the rest of the learner path: getCourseDetails strips
    // WIP lessons for admins too, so the lesson page already renders
    // not-found for them. The admin bypass covers gates, not existence.
    getUserRoleNames.mockResolvedValue(['admin']);
    getCourseSlugForLesson.mockResolvedValue({
      courseSlug: 'c1',
      courseId: 7,
      isAvailable: false,
    });
    expect(
      await evaluateLessonGate({ userId: 'u1', lessonSlug: 'draft' }),
    ).toBeNull();
  });

  it('locks a lesson whose prerequisite is unwatched', async () => {
    const result = await evaluateLessonGate({ userId: 'u1', lessonSlug: 'b' });
    expect(result?.lessonLock).toEqual({
      kind: 'lesson-locked',
      lessonSlug: 'a',
      moduleSlug: 'm1',
      lessonName: 'A',
    });
  });

  it('opens the lesson but locks material once the prerequisite is watched', async () => {
    getCourseProgress.mockResolvedValue(progress([10]));
    const result = await evaluateLessonGate({ userId: 'u1', lessonSlug: 'b' });
    expect(result?.lessonLock).toEqual({ kind: 'open' });
    expect(result?.materialLock).toEqual({ kind: 'video-locked' });
  });

  it('opens everything once the lesson video is watched too', async () => {
    getCourseProgress.mockResolvedValue(progress([10, 11]));
    const result = await evaluateLessonGate({ userId: 'u1', lessonSlug: 'b' });
    expect(result?.lessonLock).toEqual({ kind: 'open' });
    expect(result?.materialLock).toEqual({ kind: 'open' });
  });

  it('forces both locks open for an admin', async () => {
    getUserRoleNames.mockResolvedValue(['admin']);
    const result = await evaluateLessonGate({ userId: 'u1', lessonSlug: 'b' });
    expect(result?.isAdmin).toBe(true);
    expect(result?.lessonLock).toEqual({ kind: 'open' });
    expect(result?.materialLock).toEqual({ kind: 'open' });
  });

  it('reports subscription separately from the gates', async () => {
    isSubscribedToCourse.mockResolvedValue(false);
    const result = await evaluateLessonGate({ userId: 'u1', lessonSlug: 'b' });
    expect(result?.subscribed).toBe(false);
  });

  it('rejects rather than failing open when the course payload is unavailable', async () => {
    // A Redis outage or cache-population race can return null from
    // getCourseDetailsWithCache even though the lesson/course are known
    // good. The gate must not fail open in that case (see decision on
    // "unevaluable gate returns 500, never a silent pass") — assert on the
    // rejection itself, not on some returned "safe" value, since the whole
    // point is that the caller cannot mistake this for success.
    getCourseDetailsWithCache.mockResolvedValue(null);
    await expect(
      evaluateLessonGate({ userId: 'u1', lessonSlug: 'b' }),
    ).rejects.toThrow(/c1/);
  });

  it('rejects for an admin too when the course payload is unavailable', async () => {
    // The admin bypass exists for gate/subscription checks, not for "the
    // data we need to evaluate anything is missing." An admin silently
    // sailing through here would hide a genuine outage.
    getUserRoleNames.mockResolvedValue(['admin']);
    getCourseDetailsWithCache.mockResolvedValue(null);
    await expect(
      evaluateLessonGate({ userId: 'u1', lessonSlug: 'b' }),
    ).rejects.toThrow(/c1/);
  });

  it('maps watched progress by lesson id, not by video id', async () => {
    // progress-summary keys by lessonId; the predicate keys by lesson slug.
    // Getting this mapping wrong silently unlocks or locks the wrong lesson.
    getCourseProgress.mockResolvedValue({
      lessons: [
        {
          lessonId: 10,
          moduleId: 1,
          videoId: 'vid-a',
          percent: 100,
          watched: true,
        },
      ],
    });
    const result = await evaluateLessonGate({ userId: 'u1', lessonSlug: 'b' });
    expect(result?.lessonLock).toEqual({ kind: 'open' });
  });
});
