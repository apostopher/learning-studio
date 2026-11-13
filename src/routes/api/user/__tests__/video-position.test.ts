// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getSession,
  saveResumePosition,
  evaluateLessonGate,
  getLessonIdBySlug,
} = vi.hoisted(() => ({
  getSession: vi.fn(),
  saveResumePosition: vi.fn(),
  evaluateLessonGate: vi.fn(),
  getLessonIdBySlug: vi.fn(),
}));
vi.mock('#/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('#/db/video-resume-positions', () => ({ saveResumePosition }));
vi.mock('#/lib/lesson-gating.server', () => ({ evaluateLessonGate }));
vi.mock('#/db/lesson-access', () => ({ getLessonIdBySlug }));

import { saveVideoPositionHandler } from '../video-position';

const BODY = {
  lessonSlug: 'l1',
  courseSlug: 'c1',
  seconds: 120,
  duration: 600,
};

function postReq(body: unknown): Request {
  return new Request('http://test/api/user/video-position', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ user: { id: 'user-1' } });
  saveResumePosition.mockResolvedValue(undefined);
  evaluateLessonGate.mockResolvedValue({
    subscribed: true,
    lessonLock: { kind: 'open' },
  });
  getLessonIdBySlug.mockResolvedValue(10);
});

describe('saveVideoPositionHandler', () => {
  it('saves the position for the authed user and lesson', async () => {
    const res = await saveVideoPositionHandler(postReq(BODY));
    expect(res.status).toBe(204);
    expect(saveResumePosition).toHaveBeenCalledWith({
      userId: 'user-1',
      lessonId: 10,
      seconds: 120,
      duration: 600,
    });
    expect(evaluateLessonGate).toHaveBeenCalledWith({
      userId: 'user-1',
      lessonSlug: 'l1',
      courseSlug: 'c1',
    });
  });

  it('clamps a position past the end to the duration (a finished video)', async () => {
    await saveVideoPositionHandler(postReq({ ...BODY, seconds: 600.4 }));
    expect(saveResumePosition).toHaveBeenCalledWith(
      expect.objectContaining({ seconds: 600, duration: 600 }),
    );
  });

  it('401 when not authenticated', async () => {
    getSession.mockResolvedValueOnce(null);
    expect((await saveVideoPositionHandler(postReq(BODY))).status).toBe(401);
    expect(saveResumePosition).not.toHaveBeenCalled();
  });

  it.each([
    ['a negative position', { ...BODY, seconds: -1 }],
    ['a zero duration', { ...BODY, duration: 0 }],
    ['a missing course', { ...BODY, courseSlug: '' }],
  ])('400 on %s', async (_label, body) => {
    expect((await saveVideoPositionHandler(postReq(body))).status).toBe(400);
    expect(saveResumePosition).not.toHaveBeenCalled();
  });

  it.each([
    ['no such lesson', null],
    ['not subscribed', { subscribed: false, lessonLock: { kind: 'open' } }],
    [
      'a locked lesson',
      {
        subscribed: true,
        lessonLock: { kind: 'lesson-locked', lessonName: 'Prev' },
      },
    ],
    [
      'an out-of-tier lesson never completed',
      {
        subscribed: true,
        outOfTier: { readOnly: false },
        lessonLock: { kind: 'open' },
      },
    ],
  ])('403 for %s, without writing', async (_label, gate) => {
    evaluateLessonGate.mockResolvedValueOnce(gate);
    expect((await saveVideoPositionHandler(postReq(BODY))).status).toBe(403);
    expect(saveResumePosition).not.toHaveBeenCalled();
  });

  it('saves for a completed out-of-tier lesson: the archive view still resumes', async () => {
    // A playhead is not coverage: the gate never reads it, so recording one
    // from the read-only view cannot move the pilot's live progress.
    evaluateLessonGate.mockResolvedValueOnce({
      subscribed: true,
      outOfTier: { readOnly: true },
      lessonLock: { kind: 'open' },
    });
    expect((await saveVideoPositionHandler(postReq(BODY))).status).toBe(204);
    expect(saveResumePosition).toHaveBeenCalled();
  });

  it('500 when the write fails', async () => {
    saveResumePosition.mockRejectedValueOnce(new Error('db down'));
    expect((await saveVideoPositionHandler(postReq(BODY))).status).toBe(500);
  });
});
