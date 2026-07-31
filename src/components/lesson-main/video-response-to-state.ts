import { isVideoAvailable, isVideoNotReady, type VideoResponse } from '#/types';
import type { TrackProps, VideoFetchState } from './types';

const vttToTracks = (vtt: string | null): TrackProps[] =>
  vtt
    ? [
        {
          src: vtt,
          srcLang: 'en',
          label: 'English',
          kind: 'subtitles',
          default: true,
        },
      ]
    : [];

export const videoResponseToState = (
  v: VideoResponse | undefined,
  onRetry: () => void,
): VideoFetchState => {
  if (!v) return { status: 'fetching' };
  if (isVideoAvailable(v)) {
    if (!v.download) {
      return { status: 'error', message: 'Video is unavailable', onRetry };
    }
    return {
      status: 'ready',
      src: v.download,
      // Mirrors resolve.server.ts's Synthesia branch: a Synthesia download
      // is HLS only when it's a manifest URL, otherwise a plain file.
      kind: v.download.endsWith('.m3u8') ? 'hls' : 'file',
      poster: v.thumbnail.image ?? undefined,
      tracks: vttToTracks(v.captions.vtt),
      captionsUnavailable: !v.captions.vtt,
      onRetry,
    };
  }
  if (isVideoNotReady(v)) {
    if (v.status === 'in_progress') return { status: 'rendering' };
    return {
      status: 'error',
      message: 'This video failed to render',
      onRetry,
    };
  }
  return { status: 'error', message: 'Unexpected video response', onRetry };
};
