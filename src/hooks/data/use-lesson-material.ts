import { useAtomValue } from 'jotai';
import { lessonMaterialAtomFamily } from '#/atoms/lesson-material';

export const useLessonMaterial = (lessonSlug?: string) =>
  useAtomValue(lessonMaterialAtomFamily(lessonSlug ?? ''));
