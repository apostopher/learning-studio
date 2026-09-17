import {
  type AlternateVideo,
  orderedLanguages,
  PRIMARY_VIDEO_LANG,
  type VideoLang,
} from '#/lib/video-languages';
import type { ProviderId } from './types';

export type VideoSelection = {
  provider: ProviderId;
  ref: string;
  /** The language actually chosen — `en` when the request had no match. */
  lang: VideoLang;
  /** Every language this lesson can play, `en` first. */
  languages: VideoLang[];
};

/**
 * Pure: the video to resolve for a requested language. A request for a
 * language the lesson does not carry is not an error — the learner's
 * preference is global and most lessons will lack most languages — so it
 * falls back to the primary and says so via `lang`, and the menu the client
 * renders from `languages` shows what was actually on offer.
 */
export function selectVideoForLang({
  primary,
  alternates,
  requested,
}: {
  primary: { provider: ProviderId; ref: string };
  alternates: readonly AlternateVideo[];
  requested: VideoLang;
}): VideoSelection {
  const languages = orderedLanguages(alternates.map((a) => a.lang));
  const hit =
    requested === PRIMARY_VIDEO_LANG
      ? undefined
      : alternates.find((a) => a.lang === requested);
  if (hit) {
    return { provider: hit.provider, ref: hit.ref, lang: hit.lang, languages };
  }
  return { ...primary, lang: PRIMARY_VIDEO_LANG, languages };
}
