// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getSession,
  recordLessonProgress,
  evaluateLessonGate,
  getLessonIdBySlug,
} = vi.hoisted(() => ({
  getSession: vi.fn(),
  recordLessonProgress: vi.fn(),
  evaluateLessonGate: vi.fn(),
  getLessonIdBySlug: vi.fn(),
}));
vi.mock('#/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('#/db/videos-progress', () => ({ recordLessonProgress }));
vi.mock('#/lib/lesson-gating.server', () => ({ evaluateLessonGate }));
vi.mock('#/db/lesson-access', () => ({ getLessonIdBySlug }));

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
  recordLessonProgress.mockResolvedValue(undefined);
  evaluateLessonGate.mockResolvedValue({
    subscribed: true,
    lessonLock: { kind: 'open' },
  });
  getLessonIdBySlug.mockResolvedValue(10);
});

describe('reportVideoProgressHandler', () => {
  it('401 when not authenticated', async () => {
    getSession.mockResolvedValueOnce(null);
    const res = await reportVideoProgressHandler(
      postReq({ lessonSlug: 'l1', progress: 50 }),
    );
    expect(res.status).toBe(401);
    expect(recordLessonProgress).not.toHaveBeenCalled();
  });

  it('400 on invalid JSON', async () => {
    const bad = new Request('http://test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{bad',
    });
    expect((await reportVideoProgressHandler(bad)).status).toBe(400);
    expect(recordLessonProgress).not.toHaveBeenCalled();
  });

  it('400 when the body fails validation', async () => {
    const res = await reportVideoProgressHandler(
      postReq({ lessonSlug: '', progress: 50 }),
    );
    expect(res.status).toBe(400);
    expect(recordLessonProgress).not.toHaveBeenCalled();
  });

  it('records progress for the authed user and returns 201', async () => {
    const res = await reportVideoProgressHandler(
      postReq({ lessonSlug: 'l1', progress: 50 }),
    );
    expect(res.status).toBe(201);
    expect(recordLessonProgress).toHaveBeenCalledWith({
      userId: 'user-1',
      lessonId: 10,
      progress: 50,
    });
  });

  it('500 when the db write fails', async () => {
    recordLessonProgress.mockRejectedValueOnce(new Error('db down'));
    const res = await reportVideoProgressHandler(
      postReq({ lessonSlug: 'l1', progress: 50 }),
    );
    expect(res.status).toBe(500);
  });

  it('refuses to record progress for a lesson the caller cannot watch', async () => {
    getSession.mockResolvedValue({ user: { id: 'u1' } });
    evaluateLessonGate.mockResolvedValue({
      subscribed: false,
      lessonLock: { kind: 'open' },
    });
    const res = await reportVideoProgressHandler(
      new Request('http://t', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lessonSlug: 'l1', progress: 25 }),
      }),
    );
    expect(res.status).toBe(403);
    // The point: nothing reached the database. Without this the caller can
    // self-report full coverage for any lesson and unlock the whole course.
    expect(recordLessonProgress).not.toHaveBeenCalled();
  });

  it('403s when the gate resolves but the lesson slug cannot be found', async () => {
    getLessonIdBySlug.mockResolvedValueOnce(null);
    const res = await reportVideoProgressHandler(
      postReq({ lessonSlug: 'ghost', progress: 50 }),
    );
    expect(res.status).toBe(403);
    expect(recordLessonProgress).not.toHaveBeenCalled();
  });
});
