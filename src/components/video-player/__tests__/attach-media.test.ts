import { beforeEach, describe, expect, it, vi } from 'vitest';

const { hls, isSupported } = vi.hoisted(() => ({
  hls: {
    on: vi.fn(),
    loadSource: vi.fn(),
    attachMedia: vi.fn(),
    destroy: vi.fn(),
  },
  isSupported: vi.fn(() => true),
}));

vi.mock('hls.js', () => {
  class MockHls {
    static isSupported = isSupported;
    static Events = { ERROR: 'hlsError' };
    on = hls.on;
    loadSource = hls.loadSource;
    destroy = hls.destroy;
    // Computed key: this repo's vi.mock hoisting transform otherwise
    // conflates a class-field named `attachMedia` with this file's own
    // `import { attachMedia } from '../attach-media'` and throws
    // "Cannot access '__vi_import_0__' before initialization" — the string
    // key sidesteps that false match while still producing a real
    // `attachMedia` method, which is what the hls.js API (and the
    // `attachMedia` under test, which calls it) actually requires.
    ['attachMedia'] = hls.attachMedia;
  }
  return { default: MockHls };
});

import { attachMedia } from '../attach-media';

// A plain fake shaped like the slice of HTMLVideoElement attachMedia
// actually touches — not a rendered component, per this repo's testing
// constraint that any component calling `useEffect` crashes
// @testing-library/react's render(). attachMedia itself is a plain
// function, so it's exercised directly against this fake instead.
const makeVideo = (canPlayHlsNatively: boolean) => {
  let src = '';
  return {
    get src() {
      return src;
    },
    set src(value: string) {
      src = value;
    },
    removeAttribute: vi.fn(),
    load: vi.fn(),
    canPlayType: vi.fn((type: string) =>
      type === 'application/vnd.apple.mpegurl' && canPlayHlsNatively
        ? 'maybe'
        : '',
    ),
  } as unknown as HTMLVideoElement;
};

describe('attachMedia', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isSupported.mockReturnValue(true);
  });

  it('sets src directly for kind=file, and its teardown clears it', () => {
    const video = makeVideo(false);
    const teardown = attachMedia(video, 'https://cdn/v.mp4', 'file');

    expect(video.src).toBe('https://cdn/v.mp4');

    teardown();
    expect(video.removeAttribute).toHaveBeenCalledWith('src');
    expect(video.load).toHaveBeenCalledTimes(1);
  });

  it('sets src directly for kind=hls when the browser plays HLS natively (Safari)', () => {
    const video = makeVideo(true);
    const teardown = attachMedia(video, 'https://stream.mux.com/x.m3u8', 'hls');

    expect(video.src).toBe('https://stream.mux.com/x.m3u8');
    expect(isSupported).not.toHaveBeenCalled();

    teardown();
    expect(video.removeAttribute).toHaveBeenCalledWith('src');
  });

  it('lazy-loads hls.js and attaches it when native HLS is unsupported', async () => {
    const video = makeVideo(false);
    attachMedia(video, 'https://stream.mux.com/x.m3u8', 'hls');

    // The consumer here is hls.js itself: it must actually receive the
    // manifest URL and the video element, not just have attachMedia claim to
    // have started.
    await vi.waitFor(() => expect(hls.loadSource).toHaveBeenCalled());
    expect(hls.loadSource).toHaveBeenCalledWith(
      'https://stream.mux.com/x.m3u8',
    );
    expect(hls.attachMedia).toHaveBeenCalledWith(video);
    // Never falls back to setting a native src the browser can't play.
    expect(video.src).toBe('');
  });

  it('destroys the hls.js instance on teardown', async () => {
    const video = makeVideo(false);
    const teardown = attachMedia(video, 'https://stream.mux.com/x.m3u8', 'hls');
    await vi.waitFor(() => expect(hls.attachMedia).toHaveBeenCalled());

    teardown();
    expect(hls.destroy).toHaveBeenCalledTimes(1);
  });

  it('does not attach a still-pending hls.js instance once torn down first', async () => {
    const video = makeVideo(false);
    const teardown = attachMedia(video, 'https://stream.mux.com/x.m3u8', 'hls');
    // Torn down before the dynamic import of hls.js resolves.
    teardown();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(hls.attachMedia).not.toHaveBeenCalled();
    expect(hls.destroy).not.toHaveBeenCalled();
  });

  it("forwards onError only for a 401/403 manifest rejection, passing hls.js's own fatal flag", async () => {
    const video = makeVideo(false);
    const onError = vi.fn();
    attachMedia(video, 'https://stream.mux.com/x.m3u8', 'hls', onError);
    await vi.waitFor(() => expect(hls.on).toHaveBeenCalled());

    const [, handler] = hls.on.mock.calls[0] as [
      string,
      (event: string, data: unknown) => void,
    ];

    // A revoked-but-well-formed Mux key: the only case this ever fires for.
    handler('hlsError', { fatal: true, response: { code: 403 } });
    expect(onError).toHaveBeenCalledWith(true);

    onError.mockClear();
    // Some other fatal hls.js error (e.g. a network blip) is not a rejection
    // and must not be reported as one.
    handler('hlsError', { fatal: true, response: { code: 500 } });
    expect(onError).not.toHaveBeenCalled();
  });
});
