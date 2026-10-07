// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  getSession: vi.fn(),
  evaluateLessonGate: vi.fn(),
  getCourseDetailsWithCache: vi.fn(),
  prepareDebrief: vi.fn(),
}));

vi.mock('#/lib/auth', () => ({ auth: { api: { getSession: m.getSession } } }));
vi.mock('#/lib/lesson-gating.server', () => ({
  evaluateLessonGate: m.evaluateLessonGate,
}));
vi.mock('#/db/course', () => ({
  getCourseDetailsWithCache: m.getCourseDetailsWithCache,
}));
vi.mock('#/lib/prepared-debrief.server', () => ({
  prepareDebrief: m.prepareDebrief,
}));

import { prepareTestHandler } from '../prepare';

const post = (body: unknown) =>
  new Request('http://t/api/lesson/ai-test/prepare', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const watchingGate = {
  courseSlug: 'c1',
  courseId: 7,
  subscribed: true,
  level: 'basic',
  outOfTier: null,
  lessonLock: { kind: 'open' },
  materialLock: { kind: 'video-locked' },
};

const detailsWith = (hasDebrief: boolean) => ({
  modules: [{ lessons: [{ slug: 'l1', hasDebrief }] }],
});

beforeEach(() => {
  vi.clearAllMocks();
  m.getSession.mockResolvedValue({ user: { id: 'u1' } });
  m.evaluateLessonGate.mockResolvedValue(watchingGate);
  m.getCourseDetailsWithCache.mockResolvedValue(detailsWith(true));
  m.prepareDebrief.mockResolvedValue('prepared');
});

const body = { lessonSlug: 'l1', courseSlug: 'c1' };

describe('prepare', () => {
  it('prepares for this pilot, in the course the request names', async () => {
    const res = await prepareTestHandler(post(body));
    expect(res.status).toBe(204);
    expect(m.prepareDebrief).toHaveBeenCalledWith({
      userId: 'u1',
      courseId: 7,
      lessonSlug: 'l1',
    });
  });

  it('returns no body, so nothing about the debrief leaks before the video', async () => {
    const res = await prepareTestHandler(post(body));
    expect(await res.text()).toBe('');
  });

  it.each([
    ['the material is already unlocked', { materialLock: { kind: 'open' } }],
    ['the pilot is not subscribed', { subscribed: false }],
    [
      'the lesson is prerequisite-locked',
      { lessonLock: { kind: 'lesson-locked' } },
    ],
    ['the lesson is out of tier', { outOfTier: { readOnly: false } }],
  ])('skips the model when %s', async (_why, override) => {
    m.evaluateLessonGate.mockResolvedValue({ ...watchingGate, ...override });
    const res = await prepareTestHandler(post(body));
    expect(res.status).toBe(204);
    expect(m.prepareDebrief).not.toHaveBeenCalled();
  });

  it('skips a lesson whose tab 2 is the authored quiz', async () => {
    m.getCourseDetailsWithCache.mockResolvedValue(detailsWith(false));
    await prepareTestHandler(post(body));
    expect(m.prepareDebrief).not.toHaveBeenCalled();
  });

  it('skips a lesson the gate cannot find', async () => {
    m.evaluateLessonGate.mockResolvedValue(null);
    await prepareTestHandler(post(body));
    expect(m.prepareDebrief).not.toHaveBeenCalled();
  });

  it('swallows a failed preparation — Start still generates on demand', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    m.prepareDebrief.mockRejectedValue(new Error('model down'));
    const res = await prepareTestHandler(post(body));
    expect(res.status).toBe(204);
  });

  it('401s without a session', async () => {
    m.getSession.mockResolvedValue(null);
    const res = await prepareTestHandler(post(body));
    expect(res.status).toBe(401);
    expect(m.evaluateLessonGate).not.toHaveBeenCalled();
  });

  it('400s without a courseSlug', async () => {
    const res = await prepareTestHandler(post({ lessonSlug: 'l1' }));
    expect(res.status).toBe(400);
  });
});
