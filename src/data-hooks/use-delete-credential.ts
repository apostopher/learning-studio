import { useMutation, useQueryClient } from '@tanstack/react-query';
import { dataKeys } from './keys';

/** Remove a course's video-provider credential. */
export function useDeleteCredential(courseId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (provider: string) => {
      const res = await fetch(
        `/api/admin/courses/${courseId}/credentials/${provider}`,
        { method: 'DELETE' },
      );
      if (!res.ok)
        throw new Error(`Failed to delete credential (${res.status})`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: dataKeys.courseCredentials(courseId),
      });
    },
  });
}
