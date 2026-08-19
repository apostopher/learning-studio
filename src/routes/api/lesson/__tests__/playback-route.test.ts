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

/**
 * Out-of-tier lessons. The gate reports `lessonLock: open` for these — the
 * course is filtered to the pilot's level before the locks are evaluated — so
 * the guard above cannot catch them and this branch is the only thing between
 * a pilot and a signed, directly-playable URL for content outside their level.
 */
describe('out-of-tier playback', () => {
  it('403s a never-completed out-of-tier lesson without minting a URL', async () => {
    m.evaluateLessonGate.mockResolvedValueOnce({
      subscribed: true,
      level: 'intermediate',
      outOfTier: { readOnly: false },
      lessonLock: { kind: 'open' },
    });
    expect((await getLessonPlaybackHandler(req('l1'))).status).toBe(403);
    // The whole point: a 403 that had already resolved the URL would have
    // handed the provider request out anyway.
    expect(m.getLessonPlayback).not.toHaveBeenCalled();
  });

  it('still plays a lesson completed at an earlier level', async () => {
    // The read-only page exists to show the pilot their own earlier work. A
    // dead player there would be a broken promise, and nothing on this path
    // writes — the milestone beacon is refused separately.
    m.evaluateLessonGate.mockResolvedValueOnce({
      subscribed: true,
      level: 'intermediate',
      outOfTier: { readOnly: true },
      lessonLock: { kind: 'open' },
    });
    expect((await getLessonPlaybackHandler(req('l1'))).status).toBe(200);
    expect(m.getLessonPlayback).toHaveBeenCalledOnce();
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

  it('returns the playback body for an open lesson, reading the cache by default', async () => {
    const res = await getLessonPlaybackHandler(req('l1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      status: 'ready',
      url: 'https://cdn/v.mp4',
    });
    expect(m.getLessonPlayback).toHaveBeenCalledWith('l1', {
      skipCache: false,
    });
  });

  // Regression guard: a handler that hardcoded the session id or read the
  // wrong slug from the request would still pass every status-code assertion
  // above (the gate mock resolves the same way regardless of its input), so
  // nothing here previously proved the gate was even asked about THIS caller
  // and THIS lesson. Model: report-video-progress.test.ts's equivalent test.
  it('passes the session user id and the request lesson slug to the gate — not a hardcoded or mismatched value', async () => {
    m.getSession.mockResolvedValueOnce({ user: { id: 'u-real' } });

    await getLessonPlaybackHandler(req('lesson-real'));

    expect(m.evaluateLessonGate).toHaveBeenCalledWith({
      userId: 'u-real',
      lessonSlug: 'lesson-real',
    });
  });

  it('passes skipCache through only when the caller sends fresh=1, after the same gate checks', async () => {
    const res = await getLessonPlaybackHandler(
      new Request('http://t/api/lesson/playback?lessonSlug=l1&fresh=1'),
    );
    expect(res.status).toBe(200);
    // Gate is still evaluated before this — mocked to succeed in beforeEach,
    // so a fresh=1 request that were somehow unauthenticated/ungated would
    // still 401/403 above, never reach this call at all.
    expect(m.evaluateLessonGate).toHaveBeenCalledTimes(1);
    expect(m.getLessonPlayback).toHaveBeenCalledWith('l1', {
      skipCache: true,
    });
  });

  it('ignores a fresh value other than exactly "1"', async () => {
    await getLessonPlaybackHandler(
      new Request('http://t/api/lesson/playback?lessonSlug=l1&fresh=true'),
    );
    expect(m.getLessonPlayback).toHaveBeenCalledWith('l1', {
      skipCache: false,
    });
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
