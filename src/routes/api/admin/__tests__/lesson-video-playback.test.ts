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
  getCourseIdsForLesson,
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
    getCourseIdsForLesson: vi.fn<() => Promise<number[]>>(),
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
// Task 6b: the route no longer infers a course from the lesson. The client
// names the course it is editing; the plural membership read only confirms
// the lesson is placed there.
vi.mock('#/db/placements', () => ({ getCourseIdsForLesson }));
vi.mock('#/db/admin', () => ({ resolveLessonPlayback }));

import { lessonPlaybackSchema } from '#/lib/admin-schemas';
import { PlaybackError } from '#/lib/video-providers/errors';
import { getVideoPlaybackHandler } from '../lessons.$lessonId.video-playback';

/**
 * The editor always knows its course (`/admin/$courseId/editor`), so the
 * request names it. Defaults to 42, one of the courses `beforeEach` places
 * lesson 1 in; `courseId: null` builds a request with no param at all.
 */
const req = (courseId: string | null = '42') =>
  new Request(
    courseId === null
      ? 'http://test/api/admin/lessons/1/video-playback'
      : `http://test/api/admin/lessons/1/video-playback?courseId=${courseId}`,
  );

describe('getVideoPlaybackHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Lesson 1 is placed in courses 42 and 99. Two, so a test naming one of
    // them proves the route used the NAMED course and not the first (or
    // lowest) one it found.
    getCourseIdsForLesson.mockResolvedValue([42, 99]);
    requireCoursePermission.mockResolvedValue({ userId: 'u1' });
    // Stands in for the real helper (unit-tested in
    // lib/__tests__/permissions-server.test.ts): it answers 404 to someone on
    // the teaching side and a flat 403 to everyone else, so a missing row
    // cannot be used to enumerate ids.
    absentResourceResponse.mockResolvedValue(
      new Response(null, { status: 404 }),
    );
  });

  it('asks for content:read scoped to the course the client named', async () => {
    resolveLessonPlayback.mockResolvedValue({ status: 'rendering' });
    await getVideoPlaybackHandler(req('99'), '1');
    expect(requireCoursePermission).toHaveBeenCalledWith(
      expect.anything(),
      99,
      'content',
      'read',
    );
    // Not 42 — the other course this lesson is in, and the one a "first
    // placement wins" regression would guard on.
    expect(requireCoursePermission).not.toHaveBeenCalledWith(
      expect.anything(),
      42,
      'content',
      'read',
    );
  });

  // Fix round 1 (Minor 1): resolveLessonPlayback previously re-derived its
  // own course independently of the guard above, via its own "lowest course
  // id" query — the two happened to agree only because both used the same
  // tie-break, an invisible coincidence that breaks the moment a lesson's
  // placements' provider credentials genuinely differ per course. Task 6b:
  // there is no inference on either side any more — the course the CLIENT
  // named is what the guard checks and what picks the provider credentials,
  // so a regression to an independent lookup on either side can't silently
  // reintroduce that mismatch.
  it('resolves playback with the course the client named, the same one it guarded', async () => {
    resolveLessonPlayback.mockResolvedValue({ status: 'rendering' });

    await getVideoPlaybackHandler(req('99'), '1');

    expect(resolveLessonPlayback).toHaveBeenCalledWith(1, 99);
  });

  /**
   * A course id the lesson is NOT placed in is indistinguishable from an
   * unknown lesson: the same `absentResourceResponse` path, so the answer
   * reveals nothing about placement to someone off the teaching side, and
   * neither the guard nor the provider is ever consulted for it.
   */
  it('treats a course the lesson is not placed in exactly like an absent lesson', async () => {
    absentResourceResponse.mockResolvedValue(
      new Response('Forbidden', { status: 403 }),
    );
    const request = req('7');

    const res = await getVideoPlaybackHandler(request, '1');

    expect(getCourseIdsForLesson).toHaveBeenCalledWith(1);
    expect(absentResourceResponse).toHaveBeenCalledWith(
      request.headers,
      'Lesson not found',
    );
    expect(res.status).toBe(403);
    expect(requireCoursePermission).not.toHaveBeenCalled();
    expect(resolveLessonPlayback).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', null],
    ['non-integer', 'abc'],
    ['fractional', '4.2'],
    ['non-positive', '0'],
  ])('400s a %s courseId without touching the database', async (_label, raw) => {
    const res = await getVideoPlaybackHandler(req(raw), '1');

    expect(res.status).toBe(400);
    expect(getCourseIdsForLesson).not.toHaveBeenCalled();
    expect(requireCoursePermission).not.toHaveBeenCalled();
    expect(resolveLessonPlayback).not.toHaveBeenCalled();
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
    getCourseIdsForLesson.mockResolvedValue([]);
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
    getCourseIdsForLesson.mockResolvedValue([]);

    const res = await getVideoPlaybackHandler(req(), '999');

    expect(res.status).toBe(404);
    expect(requireCoursePermission).not.toHaveBeenCalled();
    expect(resolveLessonPlayback).not.toHaveBeenCalled();
  });

  it('400s an invalid lesson id', async () => {
    const res = await getVideoPlaybackHandler(req(), 'abc');

    expect(res.status).toBe(400);
    expect(getCourseIdsForLesson).not.toHaveBeenCalled();
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
