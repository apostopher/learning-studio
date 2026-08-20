// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlaybackResult } from '#/lib/video-providers/resolve.server';

// Fully stub admin-functions.server (see mocking rules: no importOriginal on
// internal alias-using modules). The route imports ForbiddenError from this same
// mocked path, so this stub class is what `instanceof` checks against.
const {
  requireCoursePermission,
  absentResourceResponse,
  ForbiddenError,
  getCourseIdForLessonId,
  resolveLessonPlayback,
} = vi.hoisted(() => {
  class ForbiddenError extends Error {
    constructor() {
      super('Forbidden');
      this.name = 'ForbiddenError';
    }
  }
  return {
    requireCoursePermission: vi.fn(),
    absentResourceResponse: vi.fn(),
    ForbiddenError,
    getCourseIdForLessonId: vi.fn(),
    // Typed so an invalid fixture (e.g. a pre-Task-1 body missing `status`)
    // is a tsc error, not something only a runtime parse would catch.
    resolveLessonPlayback: vi.fn<() => Promise<PlaybackResult | null>>(),
  };
});
vi.mock('#/lib/admin-functions.server', () => ({ ForbiddenError }));
vi.mock('#/lib/permissions.server', () => ({
  requireCoursePermission,
  absentResourceResponse,
}));
vi.mock('#/db/lesson-access', () => ({ getCourseIdForLessonId }));
vi.mock('#/db/admin', () => ({ resolveLessonPlayback }));

import { lessonPlaybackSchema } from '#/lib/admin-schemas';
import { PlaybackError } from '#/lib/video-providers/errors';
import { getVideoPlaybackHandler } from '../lessons.$lessonId.video-playback';

const req = () => new Request('http://test/api/admin/lessons/1/video-playback');

describe('getVideoPlaybackHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCourseIdForLessonId.mockResolvedValue(42);
    requireCoursePermission.mockResolvedValue({ userId: 'u1' });
    // Stands in for the real helper (unit-tested in
    // lib/__tests__/permissions-server.test.ts): it answers 404 to someone on
    // the teaching side and a flat 403 to everyone else, so a missing row
    // cannot be used to enumerate ids.
    absentResourceResponse.mockResolvedValue(
      new Response(null, { status: 404 }),
    );
  });

  it('asks for content:read scoped to the lesson’s course', async () => {
    resolveLessonPlayback.mockResolvedValue({ status: 'rendering' });
    await getVideoPlaybackHandler(req(), '1');
    expect(requireCoursePermission).toHaveBeenCalledWith(
      expect.anything(),
      42,
      'content',
      'read',
    );
  });

  it('returns a resolved playback the client schema can actually parse', async () => {
    const playback: PlaybackResult = {
      status: 'ready',
      url: 'https://x/y.m3u8',
      kind: 'hls',
      expiresInSeconds: 3600,
      poster: 'https://x/poster.jpg',
      captions: { vtt: 'https://x/captions.vtt' },
    };
    resolveLessonPlayback.mockResolvedValue(playback);

    const res = await getVideoPlaybackHandler(req(), '1');

    expect(res.status).toBe(200);
    // Parsed with the real client-side schema — not compared against the
    // same object reference the mock returned (that would pass even if the
    // fixture were a shape the client could never actually read).
    const parsed = lessonPlaybackSchema.parse(await res.json());
    expect(parsed).toEqual(playback);
  });

  it('returns a rendering playback that survives route -> client schema parse', async () => {
    resolveLessonPlayback.mockResolvedValue({ status: 'rendering' });

    const res = await getVideoPlaybackHandler(req(), '1');

    expect(res.status).toBe(200);
    const parsed = lessonPlaybackSchema.parse(await res.json());
    expect(parsed).toEqual({ status: 'rendering' });
  });

  it('403s a refused actor without touching the database', async () => {
    requireCoursePermission.mockRejectedValue(new ForbiddenError());

    const res = await getVideoPlaybackHandler(req(), '1');

    expect(res.status).toBe(403);
    expect(resolveLessonPlayback).not.toHaveBeenCalled();
  });

  /**
   * The enumeration oracle. This handler resolves the row BEFORE guarding, so
   * an unauthenticated caller could walk sequential integer ids and read the
   * id space off the status code — 404 absent, 403 present. The absent branch
   * is delegated to `absentResourceResponse`, which answers 404 only to
   * someone on the teaching side (unit-tested in
   * lib/__tests__/permissions-server.test.ts).
   */
  it('hands an absent lesson to absentResourceResponse and returns its answer', async () => {
    getCourseIdForLessonId.mockResolvedValue(null);
    absentResourceResponse.mockResolvedValue(
      new Response('Forbidden', { status: 403 }),
    );
    const request = req();

    const res = await getVideoPlaybackHandler(request, '999');

    expect(absentResourceResponse).toHaveBeenCalledWith(
      request.headers,
      'Lesson not found',
    );
    expect(res.status).toBe(403);
    expect(resolveLessonPlayback).not.toHaveBeenCalled();
  });

  it('404s a lesson that does not exist, before guarding', async () => {
    getCourseIdForLessonId.mockResolvedValue(null);

    const res = await getVideoPlaybackHandler(req(), '999');

    expect(res.status).toBe(404);
    expect(requireCoursePermission).not.toHaveBeenCalled();
    expect(resolveLessonPlayback).not.toHaveBeenCalled();
  });

  it('400s an invalid lesson id', async () => {
    const res = await getVideoPlaybackHandler(req(), 'abc');

    expect(res.status).toBe(400);
    expect(getCourseIdForLessonId).not.toHaveBeenCalled();
    expect(resolveLessonPlayback).not.toHaveBeenCalled();
  });

  it('404s when no video or credential is configured', async () => {
    resolveLessonPlayback.mockResolvedValue(null);

    const res = await getVideoPlaybackHandler(req(), '1');

    // The client maps 404 to `null`, not to an error — so this must stay
    // distinct from the provider failures below.
    expect(res.status).toBe(404);
  });

  it('502s a refused credential with a machine-readable code', async () => {
    resolveLessonPlayback.mockRejectedValue(
      new PlaybackError(
        'PROVIDER_AUTH_REJECTED',
        'Synthesia refused the stored API key (401).',
      ),
    );

    const res = await getVideoPlaybackHandler(req(), '1');

    expect(res.status).toBe(502);
    // `code` is the contract the admin UI branches on to prompt for a new key.
    expect(await res.json()).toEqual({
      error: 'Synthesia refused the stored API key (401).',
      code: 'PROVIDER_AUTH_REJECTED',
    });
  });

  it('502s a missing video with a different code from a refused key', async () => {
    resolveLessonPlayback.mockRejectedValue(
      new PlaybackError('VIDEO_NOT_AVAILABLE', 'nope'),
    );

    const res = await getVideoPlaybackHandler(req(), '1');

    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe('VIDEO_NOT_AVAILABLE');
  });

  it('lets an unexpected error escape so it is reported, not disguised', async () => {
    resolveLessonPlayback.mockRejectedValue(
      new Error('decrypt failed after key rotation'),
    );

    // Swallowing this as a 502 would make a server misconfiguration look like a
    // provider problem and send the admin off re-entering working keys.
    await expect(getVideoPlaybackHandler(req(), '1')).rejects.toThrow(
      'decrypt failed after key rotation',
    );
  });
});
