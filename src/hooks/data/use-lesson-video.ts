import { useAtomValue } from 'jotai';
import { lessonPlaybackAtomFamily } from '#/atoms/lesson-video';
import type { LessonRef } from '#/lib/lesson-ref';

export const useLessonVideo = (lesson: LessonRef) =>
  useAtomValue(lessonPlaybackAtomFamily(lesson));
