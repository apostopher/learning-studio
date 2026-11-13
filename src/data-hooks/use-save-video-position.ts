import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { LessonRef } from '#/lib/lesson-ref';
import { dataKeys } from './keys';
import { saveJson } from './save-json';
import type { VideoProgress } from './use-video-progress';

export type SaveVideoPositionInput = LessonRef & {
  seconds: number;
  duration: number;
};

/**
 * Save where the learner is in a lesson's video. Fire-and-forget (beacon,
 * then keepalive fetch) so the save made as they navigate away or close the
 * tab still lands.
 *
 * The cached progress is updated up front: `useVideoProgress` has a 30s
 * `staleTime`, so reopening the lesson inside that window reads the cache
 * without refetching, and would otherwise resume from the old position.
 */
export function useSaveVideoPosition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveVideoPositionInput) =>
      saveJson({
        url: '/api/user/video-position',
        method: 'POST',
        body: input,
        fireAndForget: true,
      }),
    onMutate: ({ lessonSlug, seconds, duration }) => {
      queryClient.setQueryData<VideoProgress>(
        dataKeys.lessonProgress(lessonSlug),
        (prev) => (prev ? { ...prev, resume: { seconds, duration } } : prev),
      );
    },
  });
}
