import { useAtomValue } from 'jotai';
import { lessonVideoAtomFamily } from '#/atoms/lesson-video';

export const useLessonVideo = (videoId?: string) =>
  useAtomValue(lessonVideoAtomFamily(videoId ?? ''));
