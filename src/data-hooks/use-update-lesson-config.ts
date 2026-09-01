import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { CourseBoard, UpdateLessonConfigInput } from '@/lib/admin-schemas';
import { dataKeys } from './keys';

/**
 * Patch a lesson's Config-tab settings (availability / access / debrief).
 * Optimistically flips the value in the course-board cache so the toggle
 * responds instantly; rolls back with a toast on error.
 *
 * **Both `onSettled` and `onError` wait for the last mutation in flight.** The
 * board's quickshot chips are meant to be tapped in a run — level, then paid,
 * then debrief — and an unconditional invalidation makes that visibly wrong:
 * the first request settles, refetches, and the server has not yet taken the
 * second write, so the chip snaps back to its old value before jumping forward
 * again. `onError` had the mirror of the same bug, restoring a snapshot taken
 * before a later tap and silently discarding it.
 *
 * `isMutating` counts this mutation too, so `=== 1` means "I am the last one".
 * When others are still in flight, their trailing settle reconciles everything.
 */
export function useUpdateLessonConfig(courseId: number) {
  const queryClient = useQueryClient();
  const mutationKey = dataKeys.updateLessonConfig(courseId);
  const isLastInFlight = () => queryClient.isMutating({ mutationKey }) === 1;
  return useMutation({
    mutationKey,
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
      // Restoring mid-run would wipe a later tap's optimistic value along with
      // the failed one. The trailing invalidation corrects the board instead.
      if (context?.previous && isLastInFlight()) {
        queryClient.setQueryData(
          dataKeys.courseBoard(courseId),
          context.previous,
        );
      }
      toast.error("Couldn't update setting");
    },
    onSettled: () => {
      if (!isLastInFlight()) return;
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
