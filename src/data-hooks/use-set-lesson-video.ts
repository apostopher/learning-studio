import { useMutation, useQueryClient } from '@tanstack/react-query';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its test.
import type { SetLessonVideoInput } from '#/lib/admin-schemas';
import { dataKeys } from './keys';
import { throwIfWriteFailed, useSettleContentWrite } from './version-conflict';

/**
 * Attach a provider video reference to a lesson, then refetch everything
 * that draws it.
 *
 * `courseId` is the course whose board opened the dialog, or `null` from the
 * library's "Edit lesson" dialog, which has no course in hand. A video is a
 * property of the LESSON — org-owned, taught by any number of courses — so
 * the library, the org editor's rail and every course board refetch. Posters
 * refresh for the named course only; without one, by prefix.
 */
export function useSetLessonVideo(courseId: number | null, lessonId: number) {
  const queryClient = useQueryClient();
  const settle = useSettleContentWrite(lessonId);
  return useMutation({
    mutationKey: dataKeys.lessonContentWrite(lessonId),
    mutationFn: async (input: SetLessonVideoInput) => {
      const res = await fetch(`/api/admin/lessons/${lessonId}/video`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      await throwIfWriteFailed(
        res,
        `Failed to set lesson video (${res.status})`,
      );
    },
    onSuccess: (_data, { version }) => {
      queryClient.invalidateQueries({
        queryKey: dataKeys.lessonVideo(lessonId),
      });
      // The prefix, not this course's entry: a new video is a new video in
      // every course teaching the lesson.
      queryClient.invalidateQueries({
        queryKey: dataKeys.lessonPlaybacks(lessonId),
      });
      // A replaced video has different captions — or, off Mux, none from us.
      queryClient.invalidateQueries({
        queryKey: dataKeys.lessonCaptionsAll(lessonId),
      });
      // Without this the board's tile flips to a play button on refetch but
      // its poster stays grey for the full 30-minute lessonPosters staleTime
      // — the exact moment an admin looks to confirm the attach worked.
      queryClient.invalidateQueries({
        queryKey:
          courseId === null
            ? dataKeys.allLessonPosters()
            : dataKeys.lessonPosters(courseId),
      });
      settle.saved(version);
    },
    onError: settle.failed,
  });
}
