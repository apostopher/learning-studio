// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSession, recordVideoProgress } = vi.hoisted(() => ({
  getSession: vi.fn(),
  recordVideoProgress: vi.fn(),
}));
vi.mock('#/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('#/db/videos-progress', () => ({ recordVideoProgress }));

import { reportVideoProgressHandler } from '../report-video-progress';

function postReq(body: unknown): Request {
  return new Request('http://test/api/user/report-video-progress', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ user: { id: 'user-1' } });
  recordVideoProgress.mockResolvedValue(undefined);
});

describe('reportVideoProgressHandler', () => {
  it('401 when not authenticated', async () => {
    getSession.mockResolvedValueOnce(null);
    const res = await reportVideoProgressHandler(
      postReq({ videoId: 'v1', progress: 50 }),
    );
    expect(res.status).toBe(401);
    expect(recordVideoProgress).not.toHaveBeenCalled();
  });

  it('400 on invalid JSON', async () => {
    const bad = new Request('http://test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{bad',
    });
    expect((await reportVideoProgressHandler(bad)).status).toBe(400);
    expect(recordVideoProgress).not.toHaveBeenCalled();
  });

  it('400 when the body fails validation', async () => {
    const res = await reportVideoProgressHandler(
      postReq({ videoId: '', progress: 50 }),
    );
    expect(res.status).toBe(400);
    expect(recordVideoProgress).not.toHaveBeenCalled();
  });

  it('records progress for the authed user and returns 201', async () => {
    const res = await reportVideoProgressHandler(
      postReq({ videoId: 'v1', progress: 50 }),
    );
    expect(res.status).toBe(201);
    expect(recordVideoProgress).toHaveBeenCalledWith({
      userId: 'user-1',
      videoId: 'v1',
      progress: 50,
    });
  });

  it('500 when the db write fails', async () => {
    recordVideoProgress.mockRejectedValueOnce(new Error('db down'));
    const res = await reportVideoProgressHandler(
      postReq({ videoId: 'v1', progress: 50 }),
    );
    expect(res.status).toBe(500);
  });
});
