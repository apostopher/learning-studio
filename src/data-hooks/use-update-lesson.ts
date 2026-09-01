import { useMutation, useQueryClient } from '@tanstack/react-query';
import { dataKeys } from './keys';

/** Rename a lesson, then refetch the course board. */
export function useUpdateLesson(courseId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { lessonId: number; name: string }) => {
      const res = await fetch(`/api/admin/lessons/${input.lessonId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: input.name }),
      });
      if (!res.ok) throw new Error(`Failed to update lesson (${res.status})`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: dataKeys.courseBoard(courseId),
      });
      // The org editor draws the same lesson, so an edit made here must
      // reach it too. Added when that second reader shipped — before it,
      // one course board was the only place a lesson appeared.
      queryClient.invalidateQueries({ queryKey: dataKeys.editorBoard() });
      queryClient.invalidateQueries({ queryKey: dataKeys.orgLibrary() });
    },
  });
}
