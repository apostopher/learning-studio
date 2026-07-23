// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSession, getVideoProgress } = vi.hoisted(() => ({
  getSession: vi.fn(),
  getVideoProgress: vi.fn(),
}));
vi.mock('#/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('#/db/videos-progress', () => ({ getVideoProgress }));

import { getVideoProgressHandler } from '../video-progress';

function req(url: string): Request {
  return new Request(url);
}

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ user: { id: 'user-1' } });
  getVideoProgress.mockResolvedValue({ milestonesHit: [10, 15], watched: false });
});

describe('getVideoProgressHandler', () => {
  it('401 when not authenticated', async () => {
    getSession.mockResolvedValueOnce(null);
    const res = await getVideoProgressHandler(
      req('http://test/api/user/video-progress?videoId=v1'),
    );
    expect(res.status).toBe(401);
    expect(getVideoProgress).not.toHaveBeenCalled();
  });

  it('400 when videoId is missing', async () => {
    const res = await getVideoProgressHandler(
      req('http://test/api/user/video-progress'),
    );
    expect(res.status).toBe(400);
    expect(getVideoProgress).not.toHaveBeenCalled();
  });

  it('returns the single-video progress for the authed user', async () => {
    const res = await getVideoProgressHandler(
      req('http://test/api/user/video-progress?videoId=v1'),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ milestonesHit: [10, 15], watched: false });
    expect(getVideoProgress).toHaveBeenCalledWith({
      userId: 'user-1',
      videoId: 'v1',
    });
  });

  it('500 when the db read fails', async () => {
    getVideoProgress.mockRejectedValueOnce(new Error('db down'));
    const res = await getVideoProgressHandler(
      req('http://test/api/user/video-progress?videoId=v1'),
    );
    expect(res.status).toBe(500);
  });
});
