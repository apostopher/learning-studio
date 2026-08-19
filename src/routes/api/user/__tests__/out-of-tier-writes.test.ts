// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  getSession: vi.fn(),
  evaluateLessonGate: vi.fn(),
  recordLastViewedLesson: vi.fn(),
  recordLessonSectionTap: vi.fn(),
  maybePromote: vi.fn(),
}));

vi.mock('#/lib/auth', () => ({ auth: { api: { getSession: m.getSession } } }));
vi.mock('#/lib/lesson-gating.server', () => ({
  evaluateLessonGate: m.evaluateLessonGate,
}));
vi.mock('#/db/course-last-viewed', () => ({
  recordLastViewedLesson: m.recordLastViewedLesson,
}));
vi.mock('#/db/lesson-visit', () => ({
  recordLessonSectionTap: m.recordLessonSectionTap,
}));
// lesson-section calls maybePromote after a successful tap — stubbed so this
// file never reaches the real db/email modules it pulls in transitively.
vi.mock('#/lib/promotion.server', () => ({ maybePromote: m.maybePromote }));

import { recordLastViewedHandler } from '../last-viewed';
import { recordLessonSectionHandler } from '../lesson-section';

const post = (path: string, body: unknown) =>
  new Request(`http://t${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const inTier = {
  courseSlug: 'c1',
  courseId: 7,
  isAdmin: false,
  subscribed: true,
  level: 'basic',
  outOfTier: null,
  lessonLock: { kind: 'open' },
  materialLock: { kind: 'open' },
};

beforeEach(() => {
  vi.clearAllMocks();
  m.getSession.mockResolvedValue({ user: { id: 'u1' } });
  m.evaluateLessonGate.mockResolvedValue(inTier);
  m.recordLastViewedLesson.mockResolvedValue(true);
  m.recordLessonSectionTap.mockResolvedValue(undefined);
  m.maybePromote.mockResolvedValue(null);
});

/**
 * These two routes are writes, and what they write feeds `lessonPercent` —
 * which the level gate reads back to decide whether an out-of-tier lesson
 * opens read-only. Left ungated, a caller could POST one tap per section on a
 * material-only lesson outside their tier, drive percent to 100, and turn
 * `/api/lesson/material`'s `403 out-of-tier` into a 200 serving the full text.
 *
 * Every case asserts the WRITER was not called, not merely the status: a 403
 * that already performed the write would have handed over the escalation.
 *
 * Both refuse in both read-only states — an archive view writes nothing — and
 * both deliberately still ignore `lessonLock`/`materialLock`, which is
 * asserted below so the narrow scope cannot drift wider unnoticed.
 */
describe('out-of-tier writes are refused', () => {
  describe('lesson-section', () => {
    const body = { lessonSlug: 'l1', section: 'keyPoints' };

    it('403s a never-completed out-of-tier lesson without recording the tap', async () => {
      m.evaluateLessonGate.mockResolvedValue({
        ...inTier,
        level: 'intermediate',
        outOfTier: { readOnly: false },
      });
      const res = await recordLessonSectionHandler(
        post('/api/user/lesson-section', body),
      );
      expect(res.status).toBe(403);
      expect(m.recordLessonSectionTap).not.toHaveBeenCalled();
    });

    it('403s a COMPLETED out-of-tier lesson without recording the tap', async () => {
      m.evaluateLessonGate.mockResolvedValue({
        ...inTier,
        level: 'intermediate',
        outOfTier: { readOnly: true },
      });
      const res = await recordLessonSectionHandler(
        post('/api/user/lesson-section', body),
      );
      expect(res.status).toBe(403);
      expect(m.recordLessonSectionTap).not.toHaveBeenCalled();
    });

    it('still records a tap on a locked but in-tier lesson', async () => {
      // The scope is deliberately narrow: honouring lessonLock here would 403
      // flows that succeed today, which is a separate decision. If someone
      // widens it, this goes red and they have to say so.
      m.evaluateLessonGate.mockResolvedValue({
        ...inTier,
        lessonLock: { kind: 'lesson-locked', lessonSlug: 'a', moduleSlug: 'm' },
        materialLock: { kind: 'video-locked' },
      });
      const res = await recordLessonSectionHandler(
        post('/api/user/lesson-section', body),
      );
      expect(res.status).toBe(201);
      expect(m.recordLessonSectionTap).toHaveBeenCalledOnce();
    });
  });

  describe('last-viewed', () => {
    const body = { lessonSlug: 'l1' };

    it('403s a never-completed out-of-tier lesson without moving the pointer', async () => {
      m.evaluateLessonGate.mockResolvedValue({
        ...inTier,
        level: 'intermediate',
        outOfTier: { readOnly: false },
      });
      const res = await recordLastViewedHandler(
        post('/api/user/last-viewed', body),
      );
      expect(res.status).toBe(403);
      expect(m.recordLastViewedLesson).not.toHaveBeenCalled();
    });

    it('403s a COMPLETED out-of-tier lesson without moving the pointer', async () => {
      m.evaluateLessonGate.mockResolvedValue({
        ...inTier,
        level: 'intermediate',
        outOfTier: { readOnly: true },
      });
      const res = await recordLastViewedHandler(
        post('/api/user/last-viewed', body),
      );
      expect(res.status).toBe(403);
      expect(m.recordLastViewedLesson).not.toHaveBeenCalled();
    });

    it('still moves the pointer for a locked but in-tier lesson', async () => {
      m.evaluateLessonGate.mockResolvedValue({
        ...inTier,
        lessonLock: { kind: 'lesson-locked', lessonSlug: 'a', moduleSlug: 'm' },
      });
      const res = await recordLastViewedHandler(
        post('/api/user/last-viewed', body),
      );
      expect(res.status).toBe(201);
      expect(m.recordLastViewedLesson).toHaveBeenCalledOnce();
    });
  });
});

/**
 * A signed-in caller is not a subscriber. Every one of these writes feeds
 * `lessonPercent`, and in a video-less course a percent of 100 is enough to
 * drive `maybePromote` into appending a durable level row and sending a real
 * promotion email — for a course the caller does not own.
 *
 * Each case asserts the WRITER and the PROMOTER were not reached, not merely
 * the status: a 403 issued after the write would have handed over exactly what
 * the guard exists to withhold.
 */
describe('writes from a non-subscriber are refused', () => {
  const unsubscribed = { ...inTier, subscribed: false };

  it('403s a lesson-section tap without recording it or checking promotion', async () => {
    m.evaluateLessonGate.mockResolvedValue(unsubscribed);
    const res = await recordLessonSectionHandler(
      post('/api/user/lesson-section', {
        lessonSlug: 'l1',
        section: 'keyPoints',
      }),
    );
    expect(res.status).toBe(403);
    expect(m.recordLessonSectionTap).not.toHaveBeenCalled();
    expect(m.maybePromote).not.toHaveBeenCalled();
  });

  it('403s a last-viewed write without moving the pointer', async () => {
    m.evaluateLessonGate.mockResolvedValue(unsubscribed);
    const res = await recordLastViewedHandler(
      post('/api/user/last-viewed', { lessonSlug: 'l1' }),
    );
    expect(res.status).toBe(403);
    expect(m.recordLastViewedLesson).not.toHaveBeenCalled();
  });

  it('403s rather than 404s an unknown lesson, so the route is not an oracle', async () => {
    m.evaluateLessonGate.mockResolvedValue(null);
    const res = await recordLastViewedHandler(
      post('/api/user/last-viewed', { lessonSlug: 'nope' }),
    );
    expect(res.status).toBe(403);
    expect(m.recordLastViewedLesson).not.toHaveBeenCalled();
  });
});
