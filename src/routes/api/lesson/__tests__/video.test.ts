// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getSession,
  getVideoDetailsWithCache,
  getLessonByVideoId,
  evaluateLessonGate,
} = vi.hoisted(() => ({
  getSession: vi.fn(),
  getVideoDetailsWithCache: vi.fn(),
  getLessonByVideoId: vi.fn(),
  evaluateLessonGate: vi.fn(),
}));

vi.mock('#/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('#/integrations/synthesia/videos', () => ({
  getVideoDetailsWithCache,
}));
vi.mock('#/db/lesson-access', () => ({ getLessonByVideoId }));
vi.mock('#/lib/lesson-gating.server', () => ({ evaluateLessonGate }));

import { getLessonVideoHandler } from '../video';

const req = (query = '?videoId=vid_1') =>
  new Request(`http://test/api/lesson/video${query}`);

const details = {
  id: 'vid_1',
  status: 'complete',
  download: 'https://cdn.synthesia.io/v.mp4?Expires=999',
};

describe('getLessonVideoHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({ user: { id: 'u1' } });
    getLessonByVideoId.mockResolvedValue({
      lessonSlug: 'b',
      courseSlug: 'c1',
      courseId: 7,
    });
    evaluateLessonGate.mockResolvedValue({
      courseSlug: 'c1',
      courseId: 7,
      isAdmin: false,
      subscribed: true,
      lessonLock: { kind: 'open' },
      materialLock: { kind: 'open' },
    });
  });

  it('returns video details for a signed-in user', async () => {
    getVideoDetailsWithCache.mockResolvedValue(details);

    const res = await getLessonVideoHandler(req());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(details);
  });

  it('401s an anonymous caller without contacting Synthesia', async () => {
    getSession.mockResolvedValue(null);

    const res = await getLessonVideoHandler(req());

    expect(res.status).toBe(401);
    // The response body embeds a pre-signed download URL, so an unauthenticated
    // request must not reach the provider at all.
    expect(getVideoDetailsWithCache).not.toHaveBeenCalled();
  });

  it('checks the session before validating input', async () => {
    getSession.mockResolvedValue(null);

    const res = await getLessonVideoHandler(req(''));

    // A missing videoId must not shortcut past the auth gate into a 400 that
    // tells an anonymous caller the route exists and what it wants.
    expect(res.status).toBe(401);
  });

  it('400s a signed-in request with no videoId', async () => {
    const res = await getLessonVideoHandler(req(''));

    expect(res.status).toBe(400);
    expect(getVideoDetailsWithCache).not.toHaveBeenCalled();
  });

  it('reports every lookup failure identically', async () => {
    getVideoDetailsWithCache.mockRejectedValue(new Error('404 from provider'));
    const missing = await getLessonVideoHandler(req());

    getVideoDetailsWithCache.mockRejectedValue(new Error('503 from provider'));
    const broken = await getLessonVideoHandler(req());

    // Same status and body either way: differing responses would let a
    // signed-in caller enumerate which video IDs exist in the account.
    expect(missing.status).toBe(502);
    expect(broken.status).toBe(502);
    expect(await missing.text()).toBe(await broken.text());
  });

  it('403s when the lesson is locked by its prerequisites', async () => {
    evaluateLessonGate.mockResolvedValue({
      courseSlug: 'c1',
      courseId: 7,
      isAdmin: false,
      subscribed: true,
      lessonLock: {
        kind: 'lesson-locked',
        lessonSlug: 'a',
        moduleSlug: 'm1',
        lessonName: 'A',
      },
      materialLock: { kind: 'open' },
    });

    const res = await getLessonVideoHandler(req());

    expect(res.status).toBe(403);
    // The body embeds a pre-signed download URL — a locked lesson must not
    // reach the provider at all.
    expect(getVideoDetailsWithCache).not.toHaveBeenCalled();
  });

  it('403s when the caller is not subscribed', async () => {
    evaluateLessonGate.mockResolvedValue({
      courseSlug: 'c1',
      courseId: 7,
      isAdmin: false,
      subscribed: false,
      lessonLock: { kind: 'open' },
      materialLock: { kind: 'open' },
    });

    expect((await getLessonVideoHandler(req())).status).toBe(403);
    expect(getVideoDetailsWithCache).not.toHaveBeenCalled();
  });

  it('403s a videoId that belongs to no lesson', async () => {
    getLessonByVideoId.mockResolvedValue(null);

    const res = await getLessonVideoHandler(req());

    // Fail closed: an unresolvable videoId is exactly the enumeration hole
    // this gate exists to close, so it must not fall through to the provider.
    expect(res.status).toBe(403);
    expect(getVideoDetailsWithCache).not.toHaveBeenCalled();
  });

  it('serves the video when the lesson is open', async () => {
    getVideoDetailsWithCache.mockResolvedValue(details);
    const res = await getLessonVideoHandler(req());
    expect(res.status).toBe(200);
  });

  it('serves the video for an admin regardless of gates', async () => {
    evaluateLessonGate.mockResolvedValue({
      courseSlug: 'c1',
      courseId: 7,
      isAdmin: true,
      subscribed: true,
      lessonLock: { kind: 'open' },
      materialLock: { kind: 'open' },
    });
    getVideoDetailsWithCache.mockResolvedValue(details);
    expect((await getLessonVideoHandler(req())).status).toBe(200);
  });
});
