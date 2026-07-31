import { Video } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { PlaybackResult } from '#/lib/video-providers/resolve.server';

interface VideoPreviewProps {
  playback: PlaybackResult | null;
  /**
   * Called when the media request for an HLS manifest is refused with 401/403.
   *
   * This is the only way a revoked Mux signing key ever surfaces: Mux JWTs are
   * signed locally on our server, so `resolvePlayback` succeeds and only Mux's
   * own edge rejects the token. Caveat: it relies on hls.js exposing the
   * response status, so it does not fire on browsers playing HLS natively
   * (Safari), where the media error carries no status.
   */
  onForbidden?: () => void;
}

/**
 * 16:9 admin preview player.
 *
 * This is a presentational component, but it owns a `useEffect`: attaching
 * hls.js to a `<video>` element (and tearing the instance down on unmount or
 * when `playback` changes) is imperative DOM/media wiring that JSX cannot
 * express declaratively. The project's presentational-component rules
 * explicitly carve out this case ("may use refs for direct DOM manipulation,
 * such as for animations") — a media player is the same category of concern.
 */
export const VideoPreview = ({ playback, onForbidden }: VideoPreviewProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Held in a ref so an inline arrow from the caller cannot land in the effect
  // below's dependency list — that would tear down and re-attach hls.js on
  // every parent render.
  const onForbiddenRef = useRef(onForbidden);
  useEffect(() => {
    onForbiddenRef.current = onForbidden;
  }, [onForbidden]);

  // Destructured so the effect depends on the URL rather than the object's
  // identity: playback is re-resolved on a timer to keep the signed URL alive,
  // and remounting the player on a refetch that returned the same URL would
  // reset the viewer's position for nothing.
  //
  // A `playback` that is still rendering or failed carries no `url`/`kind` —
  // treated the same as "nothing to play yet" here.
  const url = playback?.status === 'ready' ? playback.url : null;
  const kind = playback?.status === 'ready' ? playback.kind : null;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !url || !kind) return;

    if (kind === 'file') {
      video.src = url;
      return () => {
        video.removeAttribute('src');
        video.load();
      };
    }

    // kind === 'hls'. Safari (and other WebKit-based browsers) can play HLS
    // natively via the <video> element — no library needed there.
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url;
      return () => {
        video.removeAttribute('src');
        video.load();
      };
    }

    // Everywhere else: lazy-load hls.js so it never lands in the main bundle.
    let destroyed = false;
    let hls: import('hls.js').default | undefined;

    import('hls.js').then(({ default: Hls }) => {
      if (destroyed || !videoRef.current || !Hls.isSupported()) return;
      hls = new Hls();
      hls.on(Hls.Events.ERROR, (_event, data) => {
        const status = data.response?.code;
        if (status === 401 || status === 403) onForbiddenRef.current?.();
      });
      hls.loadSource(url);
      hls.attachMedia(videoRef.current);
    });

    return () => {
      destroyed = true;
      hls?.destroy();
    };
  }, [url, kind]);

  if (!playback || playback.status !== 'ready') {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-lg bg-gray-3">
        <Video className="h-10 w-10 text-gray-8" aria-hidden="true" />
      </div>
    );
  }

  return (
    // biome-ignore lint/a11y/useMediaCaption: admin preview of source video, no caption track available.
    <video
      ref={videoRef}
      controls
      playsInline
      className="aspect-video w-full rounded-lg bg-gray-12"
    />
  );
};
