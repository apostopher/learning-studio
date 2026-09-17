import { atomWithStorage } from 'jotai/utils';
import { PRIMARY_VIDEO_LANG, type VideoLang } from '#/lib/video-languages';

/**
 * The learner's video language, across every lesson. A lesson that lacks the
 * chosen language plays English without touching this — the next lesson
 * that has it uses it.
 */
export const videoLanguageAtom = atomWithStorage<VideoLang>(
  'video-language',
  PRIMARY_VIDEO_LANG,
);
