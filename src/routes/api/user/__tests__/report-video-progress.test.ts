// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getSession,
  recordLessonProgress,
  evaluateLessonGate,
  getLessonIdBySlug,
  maybePromote,
} = vi.hoisted(() => ({
  getSession: vi.fn(),
  recordLessonProgress: vi.fn(),
  evaluateLessonGate: vi.fn(),
  getLessonIdBySlug: vi.fn(),
  maybePromote: vi.fn(),
}));
vi.mock('#/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('#/db/videos-progress', () => ({ recordLessonProgress }));
vi.mock('#/lib/lesson-gating.server', () => ({ evaluateLessonGate }));
vi.mock('#/db/lesson-access', () => ({ getLessonIdBySlug }));
// The route calls maybePromote after every successful write — stubbed so
// this file never reaches the real db/email modules it pulls in
// transitively (this route is the highest-frequency caller, the video
// beacon).
vi.mock('#/lib/promotion.server', () => ({ maybePromote }));

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
  maybePromote.mockResolvedValue(null);
});

/**
 * Out-of-tier lessons are refused here in BOTH cases, read-only included.
 * Progress rows are what the gate reads to decide what has been watched, so a
 * read-only archive view that could write them would move the pilot's live
 * progress from a tier they have moved past. The client stops reporting in
 * read-only mode; these assert the half that does not depend on the client.
 */
describe('out-of-tier progress reports', () => {
  it('403s a never-completed out-of-tier lesson without writing', async () => {
    evaluateLessonGate.mockResolvedValueOnce({
      subscribed: true,
      level: 'intermediate',
      outOfTier: { readOnly: false },
      lessonLock: { kind: 'open' },
    });
    const res = await reportVideoProgressHandler(
      postReq({ lessonSlug: 'l1', progress: 50 }),
    );
    expect(res.status).toBe(403);
    expect(recordLessonProgress).not.toHaveBeenCalled();
  });

  it('403s a COMPLETED out-of-tier lesson without writing', async () => {
    // Read-only playback is allowed; recording that it happened is not.
    evaluateLessonGate.mockResolvedValueOnce({
      subscribed: true,
      level: 'intermediate',
      outOfTier: { readOnly: true },
      lessonLock: { kind: 'open' },
    });
    const res = await reportVideoProgressHandler(
      postReq({ lessonSlug: 'l1', progress: 95 }),
    );
    expect(res.status).toBe(403);
    expect(recordLessonProgress).not.toHaveBeenCalled();
  });
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

  it('passes the session user id and the body slug to the gate — not a hardcoded or mismatched value', async () => {
    await reportVideoProgressHandler(
      postReq({ lessonSlug: 'l1', progress: 50 }),
    );
    expect(evaluateLessonGate).toHaveBeenCalledWith({
      userId: 'user-1',
      lessonSlug: 'l1',
    });
  });

  it('500 when the db write fails', async () => {
    recordLessonProgress.mockRejectedValueOnce(new Error('db down'));
    const res = await reportVideoProgressHandler(
      postReq({ lessonSlug: 'l1', progress: 50 }),
    );
    expect(res.status).toBe(500);
  });

  it('refuses to record progress for a lesson the caller cannot watch (unsubscribed)', async () => {
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

  it('refuses when the gate resolves to null — no such lesson, or is_available=false', async () => {
    evaluateLessonGate.mockResolvedValueOnce(null);
    const res = await reportVideoProgressHandler(
      postReq({ lessonSlug: 'ghost', progress: 25 }),
    );
    expect(res.status).toBe(403);
    expect(recordLessonProgress).not.toHaveBeenCalled();
  });

  it('refuses when the lesson is locked, even for a subscribed caller', async () => {
    evaluateLessonGate.mockResolvedValueOnce({
      subscribed: true,
      lessonLock: { kind: 'module-locked', moduleSlug: 'm', moduleName: 'M' },
    });
    const res = await reportVideoProgressHandler(
      postReq({ lessonSlug: 'l1', progress: 25 }),
    );
    expect(res.status).toBe(403);
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
