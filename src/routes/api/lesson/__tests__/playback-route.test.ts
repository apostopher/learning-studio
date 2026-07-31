// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  getSession: vi.fn(),
  evaluateLessonGate: vi.fn(),
  getLessonPlayback: vi.fn(),
}));
vi.mock('#/lib/auth', () => ({ auth: { api: { getSession: m.getSession } } }));
vi.mock('#/lib/lesson-gating.server', () => ({
  evaluateLessonGate: m.evaluateLessonGate,
}));
vi.mock('#/db/lesson-playback', () => ({
  getLessonPlayback: m.getLessonPlayback,
}));

import { getLessonPlaybackHandler } from '../playback';

const req = (slug: string) =>
  new Request(`http://t/api/lesson/playback?lessonSlug=${slug}`);

beforeEach(() => {
  vi.clearAllMocks();
  m.getSession.mockResolvedValue({ user: { id: 'u1' } });
  m.evaluateLessonGate.mockResolvedValue({
    subscribed: true,
    lessonLock: { kind: 'open' },
  });
  m.getLessonPlayback.mockResolvedValue({
    status: 'ready',
    url: 'https://cdn/v.mp4',
    kind: 'file',
    expiresInSeconds: 60,
    poster: null,
    captions: null,
  });
});

describe('getLessonPlaybackHandler', () => {
  it('401s an anonymous caller before resolving anything', async () => {
    m.getSession.mockResolvedValueOnce(null);
    expect((await getLessonPlaybackHandler(req('l1'))).status).toBe(401);
    expect(m.getLessonPlayback).not.toHaveBeenCalled();
  });

  it('403s a locked lesson without resolving a signed URL', async () => {
    m.evaluateLessonGate.mockResolvedValueOnce({
      subscribed: true,
      lessonLock: { kind: 'module-locked', moduleSlug: 'm', moduleName: 'M' },
    });
    expect((await getLessonPlaybackHandler(req('l1'))).status).toBe(403);
    // Resolving would mint a playable URL for content the caller cannot reach.
    expect(m.getLessonPlayback).not.toHaveBeenCalled();
  });

  it('403s an unsubscribed caller', async () => {
    m.evaluateLessonGate.mockResolvedValueOnce({
      subscribed: false,
      lessonLock: { kind: 'open' },
    });
    expect((await getLessonPlaybackHandler(req('l1'))).status).toBe(403);
    // Resolving would mint a playable URL for content the caller cannot reach.
    expect(m.getLessonPlayback).not.toHaveBeenCalled();
  });

  it('returns the playback body for an open lesson', async () => {
    const res = await getLessonPlaybackHandler(req('l1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      status: 'ready',
      url: 'https://cdn/v.mp4',
    });
    expect(m.getLessonPlayback).toHaveBeenCalledWith('l1');
  });

  it('403s a lesson with no video, never 404', async () => {
    m.getLessonPlayback.mockResolvedValueOnce(null);
    expect((await getLessonPlaybackHandler(req('nope'))).status).toBe(403);
  });

  it('produces byte-identical bodies for different refusal reasons', async () => {
    // Restored after being lost when the old video.test.ts's equivalent
    // ("reports every lookup failure identically") was deleted alongside
    // video.ts — a status-only check would pass even if the two refusal
    // paths ever diverged in body, which is exactly the enumeration oracle
    // the uniform 403 exists to close.
    m.evaluateLessonGate.mockResolvedValueOnce({
      subscribed: true,
      lessonLock: { kind: 'module-locked', moduleSlug: 'm', moduleName: 'M' },
    });
    const locked = await getLessonPlaybackHandler(req('l1'));

    m.getLessonPlayback.mockResolvedValueOnce(null);
    const noVideo = await getLessonPlaybackHandler(req('l2'));

    expect(locked.status).toBe(403);
    expect(noVideo.status).toBe(403);
    expect(await locked.text()).toBe(await noVideo.text());
  });
});
