import { useAtomValue } from 'jotai';
import { lessonMaterialAtomFamily } from '#/atoms/lesson-material';
import type { LessonRef } from '#/lib/lesson-ref';

export const useLessonMaterial = (lesson: LessonRef) =>
  useAtomValue(lessonMaterialAtomFamily(lesson));
