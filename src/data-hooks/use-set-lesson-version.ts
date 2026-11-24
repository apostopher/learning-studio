import { useMutation } from '@tanstack/react-query';
import type { SetLessonVersionInput } from '#/lib/admin-schemas';
import { dataKeys } from './keys';
import { throwIfWriteFailed, useSettleContentWrite } from './version-conflict';

/** Change a lesson's version alone. */
export function useSetLessonVersion(lessonId: number) {
  const settle = useSettleContentWrite(lessonId);
  return useMutation({
    mutationKey: dataKeys.lessonSave(lessonId),
    mutationFn: async (input: SetLessonVersionInput) => {
      const res = await fetch(`/api/admin/lessons/${lessonId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      await throwIfWriteFailed(
        res,
        `Could not save the version (${res.status})`,
      );
    },
    onSuccess: (_data, { version }) => settle.saved(version),
    onError: settle.failed,
  });
}
