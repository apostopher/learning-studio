import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { OtherVideoId } from '#/types';
import { dataKeys } from './keys';

/** Attach (or replace) a lesson's video for one language, then refetch what shows it. */
export function useSetLessonAlternateVideo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      lessonId,
      ...entry
    }: { lessonId: number } & OtherVideoId) => {
      const res = await fetch(
        `/api/admin/lessons/${lessonId}/alternate-videos`,
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(entry),
        },
      );
      if (!res.ok) throw new Error(`Failed to add language (${res.status})`);
    },
    onSuccess: (_data, { lessonId }) => {
      queryClient.invalidateQueries({
        queryKey: dataKeys.lessonAlternateVideos(lessonId),
      });
      // The languages list rides on every course's playback for this lesson.
      queryClient.invalidateQueries({
        queryKey: dataKeys.lessonPlaybacks(lessonId),
      });
    },
  });
}
