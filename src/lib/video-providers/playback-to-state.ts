import type {
  TrackProps,
  VideoFetchState,
} from '#/components/lesson-main/types';
import {
  labelForLang,
  PRIMARY_VIDEO_LANG,
  type VideoLang,
} from '#/lib/video-languages';
import type { PlaybackResult } from './resolve.server';

type PlaybackWithLanguage = PlaybackResult & {
  lang?: VideoLang;
  languages?: VideoLang[];
};

/**
 * Playback → player state. Pure, and the only place a provider's absence of
 * captions turns into an empty track list — so that absence is visible in one
 * place rather than implied across the player.
 */
export const playbackToState = (
  result: PlaybackWithLanguage | undefined,
  onRetry: () => void,
): VideoFetchState => {
  if (!result) return { status: 'fetching' };
  // Narrowed via `!== 'ready'` rather than two `=== 'rendering'/'failed'`
  // checks: TS's control-flow analysis does not collapse a union member out
  // when its discriminant is itself a multi-value literal ('rendering' |
  // 'failed') and each value is excluded by a separate check — `result`
  // would stay typed as the full `PlaybackResult` union below.
  if (result.status !== 'ready') {
    return result.status === 'rendering'
      ? { status: 'rendering' }
      : { status: 'error', message: 'This video failed to render', onRetry };
  }
  const lang = result.lang ?? PRIMARY_VIDEO_LANG;
  const languages = result.languages ?? [PRIMARY_VIDEO_LANG];
  const tracks: TrackProps[] = result.captions
    ? [
        {
          src: result.captions.vtt,
          srcLang: lang,
          label: labelForLang(lang),
          kind: 'subtitles',
          default: true,
        },
      ]
    : [];
  return {
    status: 'ready',
    src: result.url,
    kind: result.kind,
    poster: result.poster ?? undefined,
    tracks,
    captionsUnavailable: result.captions === null,
    lang,
    languages,
    onRetry,
  };
};
