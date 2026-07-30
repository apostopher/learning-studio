// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getCourseDetailsWithCache,
  getCourseProgress,
  getCourseSlugForLesson,
  isSubscribedToCourse,
  getUserRoleNames,
} = vi.hoisted(() => ({
  getCourseDetailsWithCache: vi.fn(),
  getCourseProgress: vi.fn(),
  getCourseSlugForLesson: vi.fn(),
  isSubscribedToCourse: vi.fn(),
  getUserRoleNames: vi.fn(),
}));

vi.mock('#/db/course', () => ({ getCourseDetailsWithCache }));
vi.mock('#/db/course-progress', () => ({ getCourseProgress }));
vi.mock('#/db/lesson-access', () => ({
  getCourseSlugForLesson,
  isSubscribedToCourse,
}));
vi.mock('#/db/admin', () => ({ getUserRoleNames }));

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
          videoId: 'vid-a',
          needsVideoWatch: true,
          dependsOn: [],
        },
        {
          id: 11,
          slug: 'b',
          name: 'B',
          isAvailable: true,
          videoId: 'vid-b',
          needsVideoWatch: true,
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
    getCourseSlugForLesson.mockResolvedValue({ courseSlug: 'c1', courseId: 7 });
    getCourseDetailsWithCache.mockResolvedValue(details);
    getCourseProgress.mockResolvedValue(progress([]));
    isSubscribedToCourse.mockResolvedValue(true);
    getUserRoleNames.mockResolvedValue([]);
  });

  it('returns null for a lesson that does not exist', async () => {
    getCourseSlugForLesson.mockResolvedValue(null);
    expect(
      await evaluateLessonGate({ userId: 'u1', lessonSlug: 'nope' }),
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
