// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Fully stub admin-functions.server (see mocking rules: no importOriginal on
// internal alias-using modules). The route imports ForbiddenError from this same
// mocked path, so this stub class is what `instanceof` checks against.
const { requireAdmin, ForbiddenError, resolveLessonPlayback } = vi.hoisted(
  () => {
    class ForbiddenError extends Error {
      constructor() {
        super('Forbidden');
        this.name = 'ForbiddenError';
      }
    }
    return {
      requireAdmin: vi.fn(),
      ForbiddenError,
      resolveLessonPlayback: vi.fn(),
    };
  },
);
vi.mock('#/lib/admin-functions.server', () => ({
  requireAdmin,
  ForbiddenError,
}));
vi.mock('#/db/admin', () => ({ resolveLessonPlayback }));

import { PlaybackError } from '#/lib/video-providers/errors';
import { getVideoPlaybackHandler } from '../lessons.$lessonId.video-playback';

const req = () => new Request('http://test/api/admin/lessons/1/video-playback');

describe('getVideoPlaybackHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdmin.mockResolvedValue({ id: 'admin' });
  });

  it('returns the resolved playback on success', async () => {
    const playback = {
      url: 'https://x/y.m3u8',
      kind: 'hls',
      expiresInSeconds: 3600,
    };
    resolveLessonPlayback.mockResolvedValue(playback);

    const res = await getVideoPlaybackHandler(req(), '1');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(playback);
  });

  it('403s a non-admin without touching the database', async () => {
    requireAdmin.mockRejectedValue(new ForbiddenError());

    const res = await getVideoPlaybackHandler(req(), '1');

    expect(res.status).toBe(403);
    expect(resolveLessonPlayback).not.toHaveBeenCalled();
  });

  it('400s an invalid lesson id', async () => {
    const res = await getVideoPlaybackHandler(req(), 'abc');

    expect(res.status).toBe(400);
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
