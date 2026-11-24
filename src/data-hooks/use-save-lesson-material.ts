import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SaveLessonMaterialInput } from '#/lib/admin-schemas';
import { dataKeys } from './keys';
import { throwIfWriteFailed, useSettleContentWrite } from './version-conflict';

/** Persist edited lesson material, then refetch the material query. */
export function useSaveLessonMaterial(lessonId: number) {
  const queryClient = useQueryClient();
  const settle = useSettleContentWrite(lessonId);
  return useMutation<unknown, Error, SaveLessonMaterialInput>({
    // Keyed so the Save button can read "in flight" with `useIsMutating`
    // without holding this mutation itself.
    mutationKey: dataKeys.lessonSave(lessonId),
    mutationFn: async (values) => {
      const res = await fetch(`/api/admin/lessons/${lessonId}/material`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(values),
      });
      await throwIfWriteFailed(
        res,
        `Failed to save lesson material (${res.status})`,
      );
      return res.json();
    },
    onSuccess: (_data, { version }) => {
      queryClient.invalidateQueries({
        queryKey: dataKeys.lessonMaterial(lessonId),
      });
      settle.saved(version);
    },
    onError: settle.failed,
  });
}
