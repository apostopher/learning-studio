import { useMutation, useQueryClient } from '@tanstack/react-query';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its test.
import type { SetLessonVideoInput } from '#/lib/admin-schemas';
import { dataKeys } from './keys';
import { useSettleContentWrite } from './lesson-content-write';

/**
 * Attach a provider video reference to a lesson's working copy, then refetch
 * everything that draws it: the library, its posters and, for the version that
 * may come with it, every board.
 */
export function useSetLessonVideo(lessonId: number) {
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
      if (!res.ok)
        throw new Error(`Failed to set lesson video (${res.status})`);
    },
    onSuccess: (_data, { version }) => {
      queryClient.invalidateQueries({
        queryKey: dataKeys.lessonVideo(lessonId),
      });
      // The prefix: the working copy is previewed through any course.
      queryClient.invalidateQueries({
        queryKey: dataKeys.lessonPlaybacks(lessonId),
      });
      // A replaced video has different captions — or, off Mux, none from us.
      queryClient.invalidateQueries({
        queryKey: dataKeys.lessonCaptionsAll(lessonId),
      });
      // Without this the card's tile flips to its video state on refetch but
      // its poster stays grey for the full 30-minute lessonPosters staleTime
      // — the exact moment an admin looks to confirm the attach worked.
      queryClient.invalidateQueries({
        queryKey: dataKeys.allLessonPosters(),
      });
      settle(version);
    },
  });
}
