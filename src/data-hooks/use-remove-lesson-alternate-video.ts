import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AlternateLang } from '#/lib/video-languages';
import { dataKeys } from './keys';

/** Detach a lesson's translated video for one language, then refetch what shows it. */
export function useRemoveLessonAlternateVideo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      lessonId,
      lang,
    }: {
      lessonId: number;
      lang: AlternateLang;
    }) => {
      const res = await fetch(
        `/api/admin/lessons/${lessonId}/alternate-videos`,
        {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ lang }),
        },
      );
      if (!res.ok) throw new Error(`Failed to remove language (${res.status})`);
    },
    onSuccess: (_data, { lessonId }) => {
      queryClient.invalidateQueries({
        queryKey: dataKeys.lessonAlternateVideos(lessonId),
      });
      queryClient.invalidateQueries({
        queryKey: dataKeys.lessonPlaybacks(lessonId),
      });
    },
  });
}
