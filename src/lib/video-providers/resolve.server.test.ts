import { beforeEach, describe, expect, it, vi } from 'vitest';

const { signPlaybackId } = vi.hoisted(() => ({
  signPlaybackId: vi.fn(),
}));

vi.mock('@mux/mux-node', () => ({
  default: vi.fn().mockImplementation(() => ({
    jwt: { signPlaybackId },
  })),
}));

const { getVideoDetails, getVideoExpiry, SynthesiaRequestError } = vi.hoisted(
  () => {
    // Declared inside vi.hoisted, not as a top-level const: the vi.mock factory
    // below is hoisted above module-level declarations and would capture this
    // binding before initialization.
    //
    // It must also be the class the mock exports, because resolve.server
    // narrows on it with `instanceof` — a separate stub would make every
    // classification branch silently fall through to PROVIDER_UNAVAILABLE.
    class SynthesiaRequestError extends Error {
      readonly status: number;
      constructor(status: number) {
        super('GET_VIDEO_URL_ERROR');
        this.name = 'SynthesiaRequestError';
        this.status = status;
      }
    }
    return {
      getVideoDetails: vi.fn(),
      getVideoExpiry: vi.fn(),
      SynthesiaRequestError,
    };
  },
);

// Relative path, not `@/` — this repo's vitest (vite@7 peer, vs vite@8 in
// the app) does not resolve the `@/` tsconfig-paths alias at all, so
// resolve.server.ts's own imports were switched to relative paths too
// (mirroring the existing crypto.server.ts precedent) to make this
// module loadable under vitest in the first place.
vi.mock('../../integrations/synthesia/videos', () => ({
  getVideoDetails,
  getVideoExpiry,
  SynthesiaRequestError,
}));

import { PlaybackError } from './errors';
import { resolvePlayback, validateCredentials } from './resolve.server';

const muxCreds = { keyId: 'key_123', privateKey: 'priv_abc' };
const synthesiaCreds = { apiKey: 'sk_test_123' };

const availableVideo = {
  id: 'vid_1',
  status: 'complete' as const,
  download: 'https://cdn.synthesia.io/video.mp4',
  captions: { srt: null, vtt: null },
  thumbnail: { gif: null, image: null },
};

describe('resolvePlayback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mints a signed Mux playback token with the expected JWT sign options', async () => {
    signPlaybackId.mockResolvedValue('signed-jwt-token');

    const result = await resolvePlayback('mux', 'playback123', muxCreds);
    if (result.status !== 'ready') throw new Error('expected ready');

    // Real behavior: the returned URL embeds the ref and the signed token.
    expect(result.kind).toBe('hls');
    expect(result.url).toBe(
      'https://stream.mux.com/playback123.m3u8?token=signed-jwt-token',
    );
    // A TTL, not a timestamp. This used to be `Date.now()/1000 + TTL` here
    // while the Synthesia branch returned seconds-remaining under the same
    // field name and type.
    expect(result.expiresInSeconds).toBe(3600);

    // The exact option keys the implementation passes to the Mux SDK.
    expect(signPlaybackId).toHaveBeenCalledWith('playback123', {
      keyId: 'key_123',
      keySecret: 'priv_abc',
      expiration: '3600s',
      type: 'video',
    });
  });

  it('signs the Mux poster with a separate thumbnail-audience token, not the video token', async () => {
    // The two token "types" are distinct JWT audiences on Mux's end
    // (image.mux.com only accepts a `t` claim, stream.mux.com a `v` claim) —
    // distinguishing the mock by the `type` the implementation passed is
    // what actually proves a second, correctly-audienced token was minted,
    // rather than the stream token being reused for the poster.
    signPlaybackId.mockImplementation(
      async (_id: string, config?: { type?: string }) =>
        config?.type === 'thumbnail' ? 'thumb-token' : 'video-token',
    );

    const result = await resolvePlayback('mux', 'playback123', muxCreds);
    if (result.status !== 'ready') throw new Error('expected ready');

    expect(result.url).toBe(
      'https://stream.mux.com/playback123.m3u8?token=video-token',
    );
    expect(result.poster).toBe(
      'https://image.mux.com/playback123/thumbnail.jpg?token=thumb-token',
    );
    expect(signPlaybackId).toHaveBeenCalledWith(
      'playback123',
      expect.objectContaining({
        type: 'thumbnail',
        keyId: 'key_123',
        keySecret: 'priv_abc',
        expiration: '3600s',
      }),
    );
  });

  it('serves the video even when only the poster token fails to sign', async () => {
    signPlaybackId.mockImplementation(
      async (_id: string, config?: { type?: string }) => {
        if (config?.type === 'thumbnail') throw new Error('boom');
        return 'video-token';
      },
    );

    const result = await resolvePlayback('mux', 'playback123', muxCreds);
    if (result.status !== 'ready') throw new Error('expected ready');

    // A missing poster is an honest `null`, not a thrown PlaybackError that
    // would take the whole (perfectly playable) video down with it.
    expect(result.url).toBe(
      'https://stream.mux.com/playback123.m3u8?token=video-token',
    );
    expect(result.poster).toBeNull();
  });

  it('resolves an available Synthesia video to its download URL', async () => {
    getVideoDetails.mockResolvedValue(availableVideo);
    getVideoExpiry.mockReturnValue(3599);

    const result = await resolvePlayback(
      'synthesia',
      'video-ref-1',
      synthesiaCreds,
    );
    if (result.status !== 'ready') throw new Error('expected ready');

    expect(getVideoDetails).toHaveBeenCalledWith('video-ref-1', 'sk_test_123');
    expect(result).toEqual({
      status: 'ready',
      url: availableVideo.download,
      kind: 'file',
      expiresInSeconds: 3599,
      poster: null,
      captions: null,
    });
  });

  it('carries a real poster and captions track through from Synthesia', async () => {
    // The only test in this file where `poster`/`captions` are non-null —
    // every other fixture leaves them null, which is the accessibility
    // constraint's blind spot: null passes trivially whether or not the
    // mapping is actually wired.
    getVideoDetails.mockResolvedValue({
      ...availableVideo,
      thumbnail: {
        ...availableVideo.thumbnail,
        image: 'https://cdn.synthesia.io/thumb.jpg',
      },
      captions: {
        ...availableVideo.captions,
        vtt: 'https://cdn.synthesia.io/captions.vtt',
      },
    });
    getVideoExpiry.mockReturnValue(600);

    const result = await resolvePlayback(
      'synthesia',
      'video-ref-1',
      synthesiaCreds,
    );
    if (result.status !== 'ready') throw new Error('expected ready');

    expect(result.poster).toBe('https://cdn.synthesia.io/thumb.jpg');
    expect(result.captions).toEqual({
      vtt: 'https://cdn.synthesia.io/captions.vtt',
    });
  });

  it('plays a Synthesia video that has no captions field at all', async () => {
    // Synthesia omits `captions` outright for some finished videos. Requiring
    // the field made such a video fail `isVideoAvailable`, so it surfaced as
    // VIDEO_NOT_AVAILABLE — unplayable, rather than merely uncaptioned.
    const { captions: _absent, ...noCaptionsField } = availableVideo;
    getVideoDetails.mockResolvedValue(noCaptionsField);
    getVideoExpiry.mockReturnValue(600);

    const result = await resolvePlayback(
      'synthesia',
      'video-ref-1',
      synthesiaCreds,
    );

    if (result.status !== 'ready') throw new Error('expected ready');
    expect(result.url).toBe(availableVideo.download);
    expect(result.captions).toBeNull();
  });

  it('classifies an .m3u8 download URL as hls', async () => {
    getVideoDetails.mockResolvedValue({
      ...availableVideo,
      download: 'https://cdn.synthesia.io/video.m3u8',
    });
    getVideoExpiry.mockReturnValue(120);

    const result = await resolvePlayback(
      'synthesia',
      'video-ref-1',
      synthesiaCreds,
    );
    if (result.status !== 'ready') throw new Error('expected ready');

    expect(result.kind).toBe('hls');
  });

  it('clamps an already-expired Synthesia URL to a zero TTL', async () => {
    getVideoDetails.mockResolvedValue(availableVideo);
    getVideoExpiry.mockReturnValue(-120);

    const result = await resolvePlayback(
      'synthesia',
      'video-ref-1',
      synthesiaCreds,
    );
    if (result.status !== 'ready') throw new Error('expected ready');

    // The field promises "seconds remaining"; a negative would make every
    // consumer's arithmetic wrong rather than merely stale.
    expect(result.expiresInSeconds).toBe(0);
  });

  it('passes through a null TTL when the URL carries no expiry', async () => {
    getVideoDetails.mockResolvedValue(availableVideo);
    getVideoExpiry.mockReturnValue(null);

    const result = await resolvePlayback(
      'synthesia',
      'video-ref-1',
      synthesiaCreds,
    );
    if (result.status !== 'ready') throw new Error('expected ready');

    expect(result.expiresInSeconds).toBeNull();
  });

  it('reports a still-rendering Synthesia video as rendering, not an error', async () => {
    getVideoDetails.mockResolvedValue({ id: 'vid_1', status: 'in_progress' });

    // A video mid-render is not a failure — the previous behavior of
    // throwing VIDEO_NOT_AVAILABLE here made the admin preview show an error
    // for a perfectly normal, temporary state.
    const result = await resolvePlayback(
      'synthesia',
      'video-ref-1',
      synthesiaCreds,
    );

    expect(result).toEqual({ status: 'rendering' });
  });

  it.each([
    ['error' as const],
    ['rejected' as const],
    [null],
  ])('reports a Synthesia video with status %s as failed', async (status) => {
    getVideoDetails.mockResolvedValue({ id: 'vid_1', status });

    const result = await resolvePlayback(
      'synthesia',
      'video-ref-1',
      synthesiaCreds,
    );

    expect(result).toEqual({ status: 'failed' });
  });

  describe('failure classification', () => {
    /** Resolves to the PlaybackError `resolvePlayback` threw. */
    async function codeFor(thrown: unknown) {
      getVideoDetails.mockRejectedValue(thrown);
      try {
        await resolvePlayback('synthesia', 'video-ref-1', synthesiaCreds);
      } catch (error) {
        return error;
      }
      throw new Error('expected resolvePlayback to reject');
    }

    it.each([
      401, 403,
    ])('reports a refused Synthesia key as PROVIDER_AUTH_REJECTED on %i', async (status) => {
      const error = await codeFor(new SynthesiaRequestError(status));

      // This is the distinction the whole feature turns on: only this code
      // tells the admin their key is dead rather than their video.
      expect(error).toBeInstanceOf(PlaybackError);
      expect((error as PlaybackError).code).toBe('PROVIDER_AUTH_REJECTED');
      expect((error as PlaybackError).message).toContain(String(status));
    });

    it('reports a missing Synthesia video as VIDEO_NOT_AVAILABLE, not a key problem', async () => {
      const error = await codeFor(new SynthesiaRequestError(404));

      expect((error as PlaybackError).code).toBe('VIDEO_NOT_AVAILABLE');
    });

    it('reports a Synthesia outage as PROVIDER_UNAVAILABLE', async () => {
      const error = await codeFor(new SynthesiaRequestError(503));

      expect((error as PlaybackError).code).toBe('PROVIDER_UNAVAILABLE');
    });

    it('reports a network failure as PROVIDER_UNAVAILABLE', async () => {
      const error = await codeFor(new TypeError('fetch failed'));

      expect((error as PlaybackError).code).toBe('PROVIDER_UNAVAILABLE');
    });

    it('preserves the underlying failure as the cause', async () => {
      const underlying = new SynthesiaRequestError(401);
      const error = await codeFor(underlying);

      expect((error as PlaybackError).cause).toBe(underlying);
    });

    it('reports an unusable Mux signing key as PROVIDER_AUTH_REJECTED', async () => {
      signPlaybackId.mockRejectedValue(new Error('invalid key format'));

      const error = await resolvePlayback('mux', 'pb1', muxCreds).catch(
        (e) => e,
      );

      expect(error).toBeInstanceOf(PlaybackError);
      expect((error as PlaybackError).code).toBe('PROVIDER_AUTH_REJECTED');
    });
  });
});

describe('validateCredentials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns ok when Mux signing succeeds', async () => {
    signPlaybackId.mockResolvedValue('token');

    const result = await validateCredentials('mux', muxCreds);

    expect(result).toEqual({ ok: true });
    expect(signPlaybackId).toHaveBeenCalledWith('validation', {
      keyId: 'key_123',
      keySecret: 'priv_abc',
      expiration: '30s',
      type: 'video',
    });
  });

  it('returns ok:false with the thrown message when Mux signing fails', async () => {
    signPlaybackId.mockRejectedValue(new Error('bad signing key'));

    const result = await validateCredentials('mux', muxCreds);

    expect(result).toEqual({ ok: false, error: 'bad signing key' });
  });

  it('returns ok when Synthesia responds 200', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    const result = await validateCredentials('synthesia', synthesiaCreds);

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.synthesia.io/v2/videos?limit=1',
      expect.objectContaining({
        headers: { Accept: 'application/json', Authorization: 'sk_test_123' },
      }),
    );
  });

  it('returns ok:false with the status when Synthesia responds 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401 }),
    );

    const result = await validateCredentials('synthesia', synthesiaCreds);

    expect(result).toEqual({ ok: false, error: 'Synthesia returned 401' });
  });
});

describe('classifying a Synthesia failure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not claim unreachability when Synthesia answered unreadably', async () => {
    // getVideoDetails only throws SynthesiaRequestError for a non-OK status,
    // so anything else — a ZodError above all — means the API responded and
    // we could not parse it. Reporting that as "could not reach" sends whoever
    // is debugging to the network instead of the schema, which is exactly the
    // wrong direction and nearly cost a day.
    getVideoDetails.mockRejectedValue(new Error('invalid_type at download'));

    const error = await resolvePlayback(
      'synthesia',
      'video-1',
      synthesiaCreds,
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(PlaybackError);
    expect((error as PlaybackError).code).toBe(
      'PROVIDER_RESPONSE_UNRECOGNISED',
    );
    expect((error as PlaybackError).message).not.toMatch(/could not reach/i);
  });

  it('still reports a genuine network failure as unreachable', async () => {
    // A fetch that never landed throws TypeError; that one IS transient and
    // retrying is the right response.
    getVideoDetails.mockRejectedValue(new TypeError('fetch failed'));

    const error = await resolvePlayback(
      'synthesia',
      'video-1',
      synthesiaCreds,
    ).catch((e: unknown) => e);

    expect((error as PlaybackError).code).toBe('PROVIDER_UNAVAILABLE');
  });

  it('keeps a refused credential distinct from both', async () => {
    getVideoDetails.mockRejectedValue(new SynthesiaRequestError(401));

    const error = await resolvePlayback(
      'synthesia',
      'video-1',
      synthesiaCreds,
    ).catch((e: unknown) => e);

    expect((error as PlaybackError).code).toBe('PROVIDER_AUTH_REJECTED');
  });
});
