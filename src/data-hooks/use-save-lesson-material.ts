import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { LessonMaterialGeneration } from '#/types';
import { dataKeys } from './keys';

/** Persist edited lesson material, then refetch the material query. */
export function useSaveLessonMaterial(lessonId: number) {
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, LessonMaterialGeneration>({
    mutationFn: async (values) => {
      const res = await fetch(`/api/admin/lessons/${lessonId}/material`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        throw new Error(`Failed to save lesson material (${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: dataKeys.lessonMaterial(lessonId),
      });
    },
  });
}
