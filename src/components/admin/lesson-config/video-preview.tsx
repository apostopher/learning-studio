import { Video } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { LessonPlayback } from '@/lib/admin-schemas';

interface VideoPreviewProps {
  playback: LessonPlayback | null;
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
export const VideoPreview = ({ playback }: VideoPreviewProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playback) return;

    if (playback.kind === 'file') {
      video.src = playback.url;
      return () => {
        video.removeAttribute('src');
        video.load();
      };
    }

    // kind === 'hls'. Safari (and other WebKit-based browsers) can play HLS
    // natively via the <video> element — no library needed there.
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = playback.url;
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
      hls.loadSource(playback.url);
      hls.attachMedia(videoRef.current);
    });

    return () => {
      destroyed = true;
      hls?.destroy();
    };
  }, [playback]);

  if (!playback) {
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
