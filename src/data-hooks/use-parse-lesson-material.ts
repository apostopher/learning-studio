import { useMutation } from '@tanstack/react-query';
import type { LessonMaterialGeneration } from '#/types';
import { LessonMaterialGenerationSchema } from '#/types';

/**
 * Upload a .docx and get back structured lesson material for review.
 *
 * Takes the target `lessonId` (matching `useSaveLessonMaterial`'s shape) and
 * sends it alongside the file: the server guards this exactly the way it
 * guards the save that follows — same lesson, same
 * `requireLessonContentPermission` — so parsing is never permitted for a
 * lesson the caller could not go on to save.
 */
export function useParseLessonMaterial(lessonId: number) {
  return useMutation<LessonMaterialGeneration, Error, File>({
    mutationFn: async (file) => {
      const form = new FormData();
      form.append('file', file);
      form.append('lessonId', String(lessonId));
      const res = await fetch('/api/admin/lesson-material/parse', {
        method: 'POST',
        body: form,
      });
      if (!res.ok) {
        throw new Error(`Failed to parse lesson material (${res.status})`);
      }
      return LessonMaterialGenerationSchema.parse(await res.json());
    },
  });
}
