import { useMutation } from '@tanstack/react-query';
import type { LessonMaterialGeneration } from '#/types';
import { LessonMaterialGenerationSchema } from '#/types';

/** Upload a .docx and get back structured lesson material for review. */
export function useParseLessonMaterial() {
  return useMutation<LessonMaterialGeneration, Error, File>({
    mutationFn: async (file) => {
      const form = new FormData();
      form.append('file', file);
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
