// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSession, getCourseProgress } = vi.hoisted(() => ({
  getSession: vi.fn(),
  getCourseProgress: vi.fn(),
}));
vi.mock('#/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('#/db/course-progress', () => ({ getCourseProgress }));

import { getCourseProgressHandler } from '../progress-summary';

const summary = {
  slug: 'ppl',
  percent: 42,
  watchedLessons: 3,
  totalLessons: 8,
  modules: [],
  lessons: [],
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
