import { useAtomValue } from 'jotai';
import { lessonPlaybackAtomFamily } from '#/atoms/lesson-video';
import type { LessonRef } from '#/lib/lesson-ref';

/**
 * No `lang` argument: the atom reads `videoLanguageAtom` itself, so every
 * caller for a lesson shares ONE query observer (and one request) whatever
 * the language — see `lessonPlaybackAtomFamily`'s comment for why that is
 * what keeps the player mounted across a switch.
 */
export const useLessonVideo = (lesson: LessonRef) =>
  useAtomValue(lessonPlaybackAtomFamily(lesson));
