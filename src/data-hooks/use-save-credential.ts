import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SaveCredentialInput } from '@/lib/admin-schemas';
import { dataKeys } from './keys';

/** Save (create or replace) a course's video-provider credential. */
export function useSaveCredential(courseId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveCredentialInput) => {
      const res = await fetch(`/api/admin/courses/${courseId}/credentials`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error ?? 'Failed to save credential');
      }
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: dataKeys.courseCredentials(courseId),
      });
      // Fixing a wrong provider credential should re-fetch posters too — the
      // old credential likely produced no posters (or wrong ones) for the
      // board's tiles.
      queryClient.invalidateQueries({
        queryKey: dataKeys.lessonPosters(courseId),
      });
    },
  });
}
