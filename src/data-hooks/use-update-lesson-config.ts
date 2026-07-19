import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { CourseBoard, UpdateLessonConfigInput } from '@/lib/admin-schemas';
import { dataKeys } from './keys';

/**
 * Patch a lesson's Config-tab settings (availability / access / debrief).
 * Optimistically flips the value in the course-board cache so the toggle
 * responds instantly; rolls back with a toast on error.
 */
export function useUpdateLessonConfig(courseId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      lessonId: number;
      patch: UpdateLessonConfigInput;
    }) => {
      const res = await fetch(`/api/admin/lessons/${input.lessonId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input.patch),
      });
      if (!res.ok) {
        throw new Error(`Failed to update lesson config (${res.status})`);
      }
    },
    onMutate: async (input) => {
      const key = dataKeys.courseBoard(courseId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<CourseBoard>(key);
      if (previous) {
        queryClient.setQueryData<CourseBoard>(key, {
          ...previous,
          modules: previous.modules.map((m) => ({
            ...m,
            lessons: m.lessons.map((l) =>
              l.id === input.lessonId ? { ...l, ...input.patch } : l,
            ),
          })),
        });
      }
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          dataKeys.courseBoard(courseId),
          context.previous,
        );
      }
      toast.error("Couldn't update setting");
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: dataKeys.courseBoard(courseId),
      });
    },
  });
}
