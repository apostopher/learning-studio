import { useQuery } from '@tanstack/react-query';
import type { LessonMaterialGeneration } from '#/types';
import { LessonMaterialGenerationSchema } from '#/types';
import { dataKeys } from './keys';

/**
 * Load a lesson's saved material as form values, or null if none. Maps the DB
 * row (nullable columns) into the LessonMaterialGeneration shape.
 */
export function useLessonMaterial(lessonId: number) {
  return useQuery<LessonMaterialGeneration | null>({
    queryKey: dataKeys.lessonMaterial(lessonId),
    staleTime: 60 * 1000,
    queryFn: async () => {
      const res = await fetch(`/api/admin/lessons/${lessonId}/material`);
      if (!res.ok) {
        throw new Error(`Failed to load lesson material (${res.status})`);
      }
      const row = (await res.json()) as Record<string, unknown> | null;
      if (!row) return null;
      return LessonMaterialGenerationSchema.parse({
        text: row.text ?? '',
        keyPoints: row.keyPoints ?? [],
        proTips: row.proTips ?? '',
        quiz: row.quiz ?? [],
        links: row.links ?? [],
        assignments: row.assignments ?? '',
        jobOfTheDay: row.jobOfTheDay ?? '',
      });
    },
  });
}
