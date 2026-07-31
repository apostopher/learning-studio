// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSession, getCourseProgress } = vi.hoisted(() => ({
  getSession: vi.fn(),
  getCourseProgress: vi.fn(),
}));
vi.mock('#/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('#/db/course-progress', () => ({ getCourseProgress }));

import { getCourseProgressHandler } from '../progress-summary';

// Non-empty lessons/modules, deliberately shaped like the real
// aggregateCourseProgress output (LessonProgress has no videoId field) —
// an empty array here would never exercise the lesson/module shape and
// would let a producer/consumer field mismatch go undetected.
const summary = {
  slug: 'ppl',
  percent: 42,
  watchedLessons: 3,
  totalLessons: 8,
  modules: [{ moduleId: 1, percent: 50, watchedLessons: 1, totalLessons: 2 }],
  lessons: [
    { lessonId: 10, moduleId: 1, percent: 100, watched: true },
    { lessonId: 11, moduleId: 1, percent: 0, watched: false },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ user: { id: 'user-1' } });
  getCourseProgress.mockResolvedValue(summary);
});

describe('getCourseProgressHandler', () => {
  it('401 when not authenticated', async () => {
    getSession.mockResolvedValueOnce(null);
    const res = await getCourseProgressHandler(
      new Request('http://test/api/course/progress-summary?slug=ppl'),
    );
    expect(res.status).toBe(401);
    expect(getCourseProgress).not.toHaveBeenCalled();
  });

  it('400 when slug is missing', async () => {
    const res = await getCourseProgressHandler(
      new Request('http://test/api/course/progress-summary'),
    );
    expect(res.status).toBe(400);
    expect(getCourseProgress).not.toHaveBeenCalled();
  });

  it('returns the aggregated summary for the authed user + slug', async () => {
    const res = await getCourseProgressHandler(
      new Request('http://test/api/course/progress-summary?slug=ppl'),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(summary);
    expect(getCourseProgress).toHaveBeenCalledWith({
      userId: 'user-1',
      slug: 'ppl',
    });
  });

  it('500 when the db read fails', async () => {
    getCourseProgress.mockRejectedValueOnce(new Error('db down'));
    const res = await getCourseProgressHandler(
      new Request('http://test/api/course/progress-summary?slug=ppl'),
    );
    expect(res.status).toBe(500);
  });
});
