import { beforeEach, describe, expect, it, vi } from 'vitest';
import { attachMedia } from '../attach-media';

// Stand-in for hls.js, injected via `attachMedia`'s `loadHls` test seam
// instead of `vi.mock('hls.js', …)` intercepting a real dynamic import.
//
// The `vi.mock` approach used to live here and was badly flaky: a genuine
// dynamic `import('hls.js')` — even of a vi.mock'd specifier — still goes
// through Vitest's module-runner/transform machinery, which measurably
// queues under full-suite parallel load. Raising `vi.waitFor`'s timeout
// from its 1000ms default to 5000ms did not fix it (one full-suite run out
// of several still failed with the assertion never firing); pre-warming
// the module cache in `beforeAll` reduced but did not eliminate it either
// (it recurred roughly 1 in 6 runs even in true isolation, no other test
// files running at all). Both symptoms point at real Vite/esbuild
// module-graph work with unpredictable latency under load, not something a
// bigger fixed budget reliably outraces.
//
// `loadHls` sidesteps that entirely: `Promise.resolve({ default: MockHls })`
// touches none of that machinery, so every test below needs exactly one
// microtask flush (`await Promise.resolve()`), never a wall-clock wait.
const hls = {
  on: vi.fn(),
  loadSource: vi.fn(),
  attachMedia: vi.fn(),
  destroy: vi.fn(),
};
const isSupported = vi.fn(() => true);

class MockHls {
  static isSupported = isSupported;
  static Events = { ERROR: 'hlsError' } as const;
  on = hls.on;
  loadSource = hls.loadSource;
  destroy = hls.destroy;
  attachMedia = hls.attachMedia;
}

// Cast, not a structural match: MockHls only implements the slice of the
// real Hls class that `attach-media.ts` actually touches, same as the
// vi.mock factory this replaced.
const loadHls = () =>
  Promise.resolve({
    default: MockHls as unknown as typeof import('hls.js').default,
  });

// Exactly one microtask hop separates `loadHls()` resolving from
// `attach-media.ts`'s `.then()` callback running — `loadHls()` returns an
// already-fulfilled promise, and `.then()` always schedules its reaction as
// a microtask even against a settled promise, never synchronously. Anything
// queued during the synchronous `attachMedia(...)` call above is strictly
// ahead of this `await`'s own continuation in the microtask queue (FIFO),
// so a single flush is sufficient and never racy.
const flushMicrotask = () => Promise.resolve();

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
    const teardown = attachMedia(
      video,
      'https://stream.mux.com/x.m3u8',
      'hls',
      undefined,
      loadHls,
    );

    expect(video.src).toBe('https://stream.mux.com/x.m3u8');
    expect(isSupported).not.toHaveBeenCalled();

    teardown();
    expect(video.removeAttribute).toHaveBeenCalledWith('src');
  });

  it('lazy-loads hls.js and attaches it when native HLS is unsupported', async () => {
    const video = makeVideo(false);
    attachMedia(
      video,
      'https://stream.mux.com/x.m3u8',
      'hls',
      undefined,
      loadHls,
    );
    await flushMicrotask();

    // The consumer here is hls.js itself: it must actually receive the
    // manifest URL and the video element, not just have attachMedia claim to
    // have started.
    expect(hls.loadSource).toHaveBeenCalledWith(
      'https://stream.mux.com/x.m3u8',
    );
    expect(hls.attachMedia).toHaveBeenCalledWith(video);
    // Never falls back to setting a native src the browser can't play.
    expect(video.src).toBe('');
  });

  it('destroys the hls.js instance on teardown', async () => {
    const video = makeVideo(false);
    const teardown = attachMedia(
      video,
      'https://stream.mux.com/x.m3u8',
      'hls',
      undefined,
      loadHls,
    );
    await flushMicrotask();
    expect(hls.attachMedia).toHaveBeenCalled();

    teardown();
    expect(hls.destroy).toHaveBeenCalledTimes(1);
  });

  it('does not attach a still-pending hls.js instance once torn down first', async () => {
    const video = makeVideo(false);
    const teardown = attachMedia(
      video,
      'https://stream.mux.com/x.m3u8',
      'hls',
      undefined,
      loadHls,
    );
    // Torn down before `loadHls()`'s `.then()` callback has run.
    teardown();
    await flushMicrotask();

    expect(hls.attachMedia).not.toHaveBeenCalled();
    expect(hls.destroy).not.toHaveBeenCalled();
  });

  it("forwards onError only for a 401/403 manifest rejection, passing hls.js's own fatal flag", async () => {
    const video = makeVideo(false);
    const onError = vi.fn();
    attachMedia(
      video,
      'https://stream.mux.com/x.m3u8',
      'hls',
      onError,
      loadHls,
    );
    await flushMicrotask();
    expect(hls.on).toHaveBeenCalled();

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
