// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  evaluateLessonGate: vi.fn(),
  getCourseDetailsWithCache: vi.fn(),
  getDebriefFacts: vi.fn(),
}));

vi.mock('#/lib/lesson-gating.server', () => ({
  evaluateLessonGate: m.evaluateLessonGate,
}));
vi.mock('#/db/course', () => ({
  getCourseDetailsWithCache: m.getCourseDetailsWithCache,
}));
vi.mock('#/db/lesson-test', () => ({ getDebriefFacts: m.getDebriefFacts }));

// `#/lib/debrief-schedule` is deliberately real: it is pure, and the point of
// this module is that the state it returns IS that function's answer.
import { getDebriefAccess } from '../debrief-access.server';

const openGate = {
  courseSlug: 'c1',
  courseId: 7,
  isAdmin: false,
  subscribed: true,
  level: 'basic',
  outOfTier: null,
  lessonLock: { kind: 'open' },
  materialLock: { kind: 'open' },
};

const detailsWith = (hasDebrief: boolean) => ({
  modules: [
    { lessons: [{ id: 99, slug: 'other', hasDebrief: true }] },
    { lessons: [{ id: 41, slug: 'l1', hasDebrief }] },
  ],
});

const now = new Date('2026-10-27T12:00:00.000Z');
const args = { userId: 'u1', lessonSlug: 'l1', courseSlug: 'c1', now };

beforeEach(() => {
  vi.clearAllMocks();
  m.evaluateLessonGate.mockResolvedValue(openGate);
  m.getCourseDetailsWithCache.mockResolvedValue(detailsWith(true));
  m.getDebriefFacts.mockResolvedValue({
    doneAt: null,
    passed: false,
    lastFailedAt: null,
  });
});

describe('getDebriefAccess refusals', () => {
  it.each([
    [
      'a never-completed out-of-tier lesson',
      { outOfTier: { readOnly: false } },
    ],
    [
      'a COMPLETED (read-only) out-of-tier lesson',
      { outOfTier: { readOnly: true } },
    ],
    ['a prerequisite-locked lesson', { lessonLock: { kind: 'lesson-locked' } }],
    ['a non-subscriber', { subscribed: false }],
  ])('403s %s without reading the facts', async (_why, override) => {
    m.evaluateLessonGate.mockResolvedValue({ ...openGate, ...override });
    expect(await getDebriefAccess(args)).toEqual({ ok: false, status: 403 });
    expect(m.getDebriefFacts).not.toHaveBeenCalled();
  });

  it('403s a lesson the gate cannot find — opaque, not an enumeration oracle', async () => {
    m.evaluateLessonGate.mockResolvedValue(null);
    expect(await getDebriefAccess(args)).toEqual({ ok: false, status: 403 });
  });

  it('404s a lesson whose debrief is switched off', async () => {
    m.getCourseDetailsWithCache.mockResolvedValue(detailsWith(false));
    expect(await getDebriefAccess(args)).toEqual({ ok: false, status: 404 });
    expect(m.getDebriefFacts).not.toHaveBeenCalled();
  });
});

describe('getDebriefAccess state', () => {
  it('gates the session user in the requested course', async () => {
    await getDebriefAccess(args);
    expect(m.evaluateLessonGate).toHaveBeenCalledWith({
      userId: 'u1',
      lessonSlug: 'l1',
      courseSlug: 'c1',
    });
    expect(m.getCourseDetailsWithCache).toHaveBeenCalledWith('c1');
  });

  it("reads the facts for the session user and THIS lesson's id", async () => {
    await getDebriefAccess(args);
    expect(m.getDebriefFacts).toHaveBeenCalledWith('u1', 'l1', 41);
  });

  it('returns computeDebriefState of those facts at `now`', async () => {
    m.getDebriefFacts.mockResolvedValue({
      doneAt: '2026-10-27T00:00:00.000Z',
      passed: false,
      lastFailedAt: null,
    });
    expect(await getDebriefAccess(args)).toEqual({
      ok: true,
      courseId: 7,
      lessonId: 41,
      state: { kind: 'waiting', availableAt: '2026-10-28T00:00:00.000Z' },
    });
  });

  it('is open 24h after done', async () => {
    m.getDebriefFacts.mockResolvedValue({
      doneAt: '2026-10-26T12:00:00.000Z',
      passed: false,
      lastFailedAt: null,
    });
    const access = await getDebriefAccess(args);
    expect(access.ok && access.state).toEqual({ kind: 'open', retake: false });
  });

  it('does not refuse on a video-locked material lock — preparation runs while the video plays', async () => {
    m.evaluateLessonGate.mockResolvedValue({
      ...openGate,
      materialLock: { kind: 'video-locked' },
    });
    const access = await getDebriefAccess(args);
    expect(access.ok && access.state).toEqual({ kind: 'not-done' });
  });

  it('applies the schedule to an admin too (the gate bypasses locks, not the clock)', async () => {
    m.evaluateLessonGate.mockResolvedValue({ ...openGate, isAdmin: true });
    const access = await getDebriefAccess(args);
    expect(access.ok && access.state).toEqual({ kind: 'not-done' });
  });
});
