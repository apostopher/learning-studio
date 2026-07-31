type HlsModule = { default: typeof import('hls.js').default };

/**
 * Attaches `src` to `video` according to `kind`, and returns a teardown
 * function that detaches it — call it on unmount or before re-attaching a
 * different source.
 *
 * Extracted from the admin preview (`video-preview.tsx`), which was the only
 * player that could handle Mux's HLS streams. Mux videos are HLS-only, so the
 * learner player needs the exact same handling — shared here so the two
 * players' HLS logic (and its hard-won caveats, preserved below) cannot
 * silently drift apart.
 *
 * `loadHls` is a test-only seam. Every production caller omits it and gets
 * the real lazy `import('hls.js')` below. `attach-media.test.ts` passes a
 * `() => Promise.resolve({ default: MockHls })` instead of relying on
 * `vi.mock('hls.js', …)` to intercept the real dynamic import — a genuine
 * dynamic import (even of a mocked specifier) still goes through Vitest's
 * module-runner/transform machinery, which measurably queues under
 * full-suite load and made that file badly flaky even after raising its
 * wait budget and pre-warming the module cache. Injecting the loader
 * removes that machinery from the test's critical path entirely, rather
 * than trying to out-wait it.
 */
export function attachMedia(
  video: HTMLVideoElement,
  src: string,
  kind: 'hls' | 'file',
  onError?: (fatal: boolean) => void,
  loadHls: () => Promise<HlsModule> = () => import('hls.js'),
): () => void {
  if (kind === 'file') {
    video.src = src;
    return () => {
      video.removeAttribute('src');
      video.load();
    };
  }

  // kind === 'hls'. Safari (and other WebKit-based browsers) can play HLS
  // natively via the <video> element — no library needed there.
  if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = src;
    return () => {
      video.removeAttribute('src');
      video.load();
    };
  }

  // Everywhere else: lazy-load hls.js so it never lands in the main bundle.
  let destroyed = false;
  let hls: import('hls.js').default | undefined;

  loadHls().then(({ default: Hls }) => {
    if (destroyed || !Hls.isSupported()) return;
    hls = new Hls();
    hls.on(Hls.Events.ERROR, (_event, data) => {
      // Mux rejects a *revoked but well-formed* signing key only when the
      // browser fetches the manifest: signing is local to our server, so
      // `resolvePlayback` succeeds and only Mux's own edge ever refuses the
      // token. This is the only place that failure is ever observable.
      // Caveat: it relies on hls.js exposing the response status, so it does
      // not fire on browsers playing HLS natively (Safari), where the media
      // error carries no status.
      const status = data.response?.code;
      if (status === 401 || status === 403) onError?.(data.fatal);
    });
    hls.loadSource(src);
    hls.attachMedia(video);
  });

  return () => {
    destroyed = true;
    hls?.destroy();
  };
}
