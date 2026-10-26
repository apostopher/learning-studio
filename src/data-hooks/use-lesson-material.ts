import { useQuery } from '@tanstack/react-query';
import type { MaterialExtraTab } from '#/lib/flagship-course';
import type { LessonMaterialGeneration } from '#/types';
import { LessonMaterialGenerationSchema } from '#/types';
import { dataKeys } from './keys';

export type AdminLessonMaterial = {
  /** Which closing field the form offers — Job of the Day or TEST THIS!. */
  extraTab: MaterialExtraTab;
  /** Saved material as form values, or null if none is saved yet. */
  values: LessonMaterialGeneration | null;
};

/**
 * Load a lesson's saved material as form values, plus its closing tab. Maps
 * the DB row (nullable columns) into the LessonMaterialGeneration shape.
 */
export function useLessonMaterial(lessonId: number) {
  return useQuery<AdminLessonMaterial>({
    queryKey: dataKeys.lessonMaterial(lessonId),
    staleTime: 60 * 1000,
    queryFn: async () => {
      const res = await fetch(`/api/admin/lessons/${lessonId}/material`);
      if (!res.ok) {
        throw new Error(`Failed to load lesson material (${res.status})`);
      }
      const body = (await res.json()) as {
        extraTab: MaterialExtraTab;
        material: Record<string, unknown> | null;
      };
      const row = body.material;
      return {
        extraTab: body.extraTab,
        values: row
          ? LessonMaterialGenerationSchema.parse({
              text: row.text ?? '',
              keyPoints: row.keyPoints ?? [],
              proTips: row.proTips ?? '',
              quiz: row.quiz ?? [],
              links: row.links ?? [],
              assignments: row.assignments ?? '',
              jobOfTheDay: row.jobOfTheDay ?? '',
              testThis: row.testThis ?? [],
            })
          : null,
      };
    },
  });
}
