// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSession, getLessonProgress, getLessonIdBySlug } = vi.hoisted(() => ({
  getSession: vi.fn(),
  getLessonProgress: vi.fn(),
  getLessonIdBySlug: vi.fn(),
}));
vi.mock('#/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('#/db/videos-progress', () => ({ getLessonProgress }));
vi.mock('#/db/lesson-access', () => ({ getLessonIdBySlug }));

import { getVideoProgressHandler } from '../video-progress';

function req(url: string): Request {
  return new Request(url);
}

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ user: { id: 'user-1' } });
  getLessonProgress.mockResolvedValue({
    milestonesHit: [10, 15],
    watched: false,
  });
  getLessonIdBySlug.mockResolvedValue(10);
});

describe('getVideoProgressHandler', () => {
  it('401 when not authenticated', async () => {
    getSession.mockResolvedValueOnce(null);
    const res = await getVideoProgressHandler(
      req('http://test/api/user/video-progress?lessonSlug=l1'),
    );
    expect(res.status).toBe(401);
    expect(getLessonProgress).not.toHaveBeenCalled();
  });

  it('400 when lessonSlug is missing', async () => {
    const res = await getVideoProgressHandler(
      req('http://test/api/user/video-progress'),
    );
    expect(res.status).toBe(400);
    expect(getLessonProgress).not.toHaveBeenCalled();
  });

  it('returns the single-lesson progress for the authed user', async () => {
    const res = await getVideoProgressHandler(
      req('http://test/api/user/video-progress?lessonSlug=l1'),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      milestonesHit: [10, 15],
      watched: false,
    });
    expect(getLessonProgress).toHaveBeenCalledWith({
      userId: 'user-1',
      lessonId: 10,
    });
  });

  it('403s when the lesson slug cannot be resolved, no gate check needed', async () => {
    getLessonIdBySlug.mockResolvedValueOnce(null);
    const res = await getVideoProgressHandler(
      req('http://test/api/user/video-progress?lessonSlug=ghost'),
    );
    expect(res.status).toBe(403);
    expect(getLessonProgress).not.toHaveBeenCalled();
  });

  it('500 when the db read fails', async () => {
    getLessonProgress.mockRejectedValueOnce(new Error('db down'));
    const res = await getVideoProgressHandler(
      req('http://test/api/user/video-progress?lessonSlug=l1'),
    );
    expect(res.status).toBe(500);
  });
});
