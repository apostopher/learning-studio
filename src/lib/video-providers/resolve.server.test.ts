import { beforeEach, describe, expect, it, vi } from 'vitest';

const { signPlaybackId } = vi.hoisted(() => ({
  signPlaybackId: vi.fn(),
}));

vi.mock('@mux/mux-node', () => ({
  default: vi.fn().mockImplementation(() => ({
    jwt: { signPlaybackId },
  })),
}));

const { getVideoDetails, getVideoExpiry } = vi.hoisted(() => ({
  getVideoDetails: vi.fn(),
  getVideoExpiry: vi.fn(),
}));

// Relative path, not `@/` — this repo's vitest (vite@7 peer, vs vite@8 in
// the app) does not resolve the `@/` tsconfig-paths alias at all, so
// resolve.server.ts's own imports were switched to relative paths too
// (mirroring the existing crypto.server.ts precedent) to make this
// module loadable under vitest in the first place.
vi.mock('../../integrations/synthesia/videos', () => ({
  getVideoDetails,
  getVideoExpiry,
}));

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

    // Real behavior: the returned URL embeds the ref and the signed token.
    expect(result.kind).toBe('hls');
    expect(result.url).toBe(
      'https://stream.mux.com/playback123.m3u8?token=signed-jwt-token',
    );
    expect(result.expiresAt).toEqual(expect.any(Number));

    // The exact option keys the implementation passes to the Mux SDK.
    expect(signPlaybackId).toHaveBeenCalledWith('playback123', {
      keyId: 'key_123',
      keySecret: 'priv_abc',
      expiration: '3600s',
      type: 'video',
    });
  });

  it('resolves an available Synthesia video to its download URL', async () => {
    getVideoDetails.mockResolvedValue(availableVideo);
    getVideoExpiry.mockReturnValue(3599);

    const result = await resolvePlayback(
      'synthesia',
      'video-ref-1',
      synthesiaCreds,
    );

    expect(getVideoDetails).toHaveBeenCalledWith('video-ref-1', 'sk_test_123');
    expect(result).toEqual({
      url: availableVideo.download,
      kind: 'file',
      expiresAt: 3599,
    });
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

    expect(result.kind).toBe('hls');
  });

  it('throws VIDEO_NOT_AVAILABLE when the Synthesia video is not ready', async () => {
    getVideoDetails.mockResolvedValue({ id: 'vid_1', status: 'in_progress' });

    await expect(
      resolvePlayback('synthesia', 'video-ref-1', synthesiaCreds),
    ).rejects.toThrow('VIDEO_NOT_AVAILABLE');
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
