import type { VideoCaption } from '#/components/video-player/types';
import { labelForLang, type VideoLang } from '#/lib/video-languages';

/** A provider's single caption file as the player's caption list, labelled
 * with the language actually playing (captions are in the video's language). */
export function captionsForPlayback(
  captions: { vtt: string } | null,
  lang: VideoLang,
): VideoCaption[] {
  return captions
    ? [{ src: captions.vtt, lang, label: labelForLang(lang) }]
    : [];
}
