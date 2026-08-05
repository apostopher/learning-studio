import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ProviderId } from '@/lib/admin-schemas';
import { dataKeys } from './keys';

/** Attach a provider video reference to a lesson, then refetch the board + playback + posters. */
export function useSetLessonVideo(courseId: number) {
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
        queryKey: dataKeys.courseBoard(courseId),
      });
      queryClient.invalidateQueries({
        queryKey: dataKeys.lessonPlayback(input.lessonId),
      });
      // Without this the board's tile flips to a play button on refetch but
      // its poster stays grey for the full 30-minute lessonPosters staleTime
      // — the exact moment an admin looks to confirm the attach worked.
      queryClient.invalidateQueries({
        queryKey: dataKeys.lessonPosters(courseId),
      });
    },
  });
}
