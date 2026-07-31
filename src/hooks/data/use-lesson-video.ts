import { useAtomValue } from 'jotai';
import { lessonPlaybackAtomFamily } from '#/atoms/lesson-video';

export const useLessonVideo = (lessonSlug?: string) =>
  useAtomValue(lessonPlaybackAtomFamily(lessonSlug ?? ''));
