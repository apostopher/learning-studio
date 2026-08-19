// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  getSession: vi.fn(),
  evaluateLessonGate: vi.fn(),
  saveLessonQuizAnswers: vi.fn(),
  maybePromote: vi.fn(),
}));

vi.mock('#/lib/auth', () => ({ auth: { api: { getSession: m.getSession } } }));
vi.mock('#/lib/lesson-gating.server', () => ({
  evaluateLessonGate: m.evaluateLessonGate,
}));
vi.mock('#/db/lesson-quiz', () => ({
  saveLessonQuizAnswers: m.saveLessonQuizAnswers,
}));
// The route calls maybePromote after a successful write — stubbed so this
// file never reaches the real db/email modules it pulls in transitively.
vi.mock('#/lib/promotion.server', () => ({ maybePromote: m.maybePromote }));

import { submitLessonQuizHandler } from '../answers';

const post = (body: unknown) =>
  new Request('http://t/api/lesson/quiz/answers', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const answers = [
  {
    id: 'q1',
    question: 'Why?',
    options: [{ id: 'a', value: 'Because' }],
    correctOptionId: 'a',
    userOptionId: 'a',
  },
];

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
  m.saveLessonQuizAnswers.mockResolvedValue({ id: 1 });
  m.maybePromote.mockResolvedValue(null);
});

/**
 * A saved attempt feeds `quizPlayed`, which feeds `lessonPercent` — the same
 * number `lesson-gating.server.ts` reads to decide `readOnly`. Left ungated, a
 * caller could POST a quiz attempt for a lesson outside their tier and turn
 * `/api/lesson/material`'s `403 out-of-tier` into a 200 serving the full
 * material.
 *
 * Every case asserts the WRITER was not called, not merely the status: a 403
 * that already performed the write would have handed over the escalation.
 *
 * Both refuse in both read-only states — an archive view writes nothing —
 * and deliberately still ignore `lessonLock`/`materialLock`, pinned below so
 * the narrow scope cannot drift wider unnoticed.
 */
describe('out-of-tier quiz submissions are refused', () => {
  const body = { lessonSlug: 'l1', answers };

  it('403s a never-completed out-of-tier lesson without recording the attempt', async () => {
    m.evaluateLessonGate.mockResolvedValue({
      ...inTier,
      level: 'intermediate',
      outOfTier: { readOnly: false },
    });
    const res = await submitLessonQuizHandler(post(body));
    expect(res.status).toBe(403);
    expect(m.saveLessonQuizAnswers).not.toHaveBeenCalled();
  });

  it('403s a COMPLETED out-of-tier lesson without recording the attempt', async () => {
    m.evaluateLessonGate.mockResolvedValue({
      ...inTier,
      level: 'intermediate',
      outOfTier: { readOnly: true },
    });
    const res = await submitLessonQuizHandler(post(body));
    expect(res.status).toBe(403);
    expect(m.saveLessonQuizAnswers).not.toHaveBeenCalled();
  });

  it('still records an attempt on a locked but in-tier lesson', async () => {
    // The scope is deliberately narrow: honouring lessonLock here would 403
    // flows that succeed today, which is a separate decision. If someone
    // widens it, this goes red and they have to say so.
    m.evaluateLessonGate.mockResolvedValue({
      ...inTier,
      lessonLock: { kind: 'lesson-locked', lessonSlug: 'a', moduleSlug: 'm' },
      materialLock: { kind: 'video-locked' },
    });
    const res = await submitLessonQuizHandler(post(body));
    expect(res.status).toBe(200);
    expect(m.saveLessonQuizAnswers).toHaveBeenCalledOnce();
  });
});

/**
 * A signed-in caller is not a subscriber. A saved attempt feeds `quizPlayed`
 * → `lessonPercent`, and in a video-less course that is enough to drive
 * `maybePromote` into appending a durable level row and sending a real
 * promotion email for a course the caller does not own.
 */
describe('quiz submit from a non-subscriber', () => {
  it('403s without recording the attempt or checking promotion', async () => {
    m.evaluateLessonGate.mockResolvedValue({ ...inTier, subscribed: false });
    const res = await submitLessonQuizHandler(
      post({ lessonSlug: 'l1', answers }),
    );
    expect(res.status).toBe(403);
    expect(m.saveLessonQuizAnswers).not.toHaveBeenCalled();
    expect(m.maybePromote).not.toHaveBeenCalled();
  });

  it('403s an unknown lesson rather than writing against it', async () => {
    m.evaluateLessonGate.mockResolvedValue(null);
    const res = await submitLessonQuizHandler(
      post({ lessonSlug: 'nope', answers }),
    );
    expect(res.status).toBe(403);
    expect(m.saveLessonQuizAnswers).not.toHaveBeenCalled();
  });
});
