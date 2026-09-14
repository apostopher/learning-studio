import { useMutation, useQueryClient } from '@tanstack/react-query';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its test.
import type { ProviderId } from '#/lib/admin-schemas';
import { dataKeys } from './keys';

/**
 * Attach a provider video reference to a lesson, then refetch everything
 * that draws it.
 *
 * `courseId` is the course whose board opened the dialog, or `null` from the
 * library's "Edit lesson" dialog, which has no course in hand. A video is a
 * property of the LESSON — org-owned, taught by any number of courses — so
 * its `isConfigured` flips on every card at once: the library pane, the org
 * editor's rail and every course board. With a course named, that course's
 * board and posters are refreshed precisely; without one, by prefix.
 */
export function useSetLessonVideo(courseId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      lessonId: number;
      provider: ProviderId;
      ref: string;
    }) => {
      const res = await fetch(`/api/admin/lessons/${input.lessonId}/video`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          provider: input.provider,
          ref: input.ref,
        }),
      });
      if (!res.ok)
        throw new Error(`Failed to set lesson video (${res.status})`);
    },
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({
        queryKey:
          courseId === null
            ? dataKeys.courseBoards()
            : dataKeys.courseBoard(courseId),
      });
      queryClient.invalidateQueries({ queryKey: dataKeys.orgLibrary() });
      queryClient.invalidateQueries({ queryKey: dataKeys.editorBoard() });
      // The prefix, not this course's entry: a new video is a new video in
      // every course teaching the lesson.
      queryClient.invalidateQueries({
        queryKey: dataKeys.lessonPlaybacks(input.lessonId),
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
    },
  });
}
