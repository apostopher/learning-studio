import { useAtomValue } from 'jotai';
import { lessonPlaybackAtomFamily } from '#/atoms/lesson-video';
import type { LessonRef } from '#/lib/lesson-ref';
import { PRIMARY_VIDEO_LANG, type VideoLang } from '#/lib/video-languages';

export const useLessonVideo = (
  lesson: LessonRef,
  lang: VideoLang = PRIMARY_VIDEO_LANG,
) => useAtomValue(lessonPlaybackAtomFamily({ ...lesson, lang }));
