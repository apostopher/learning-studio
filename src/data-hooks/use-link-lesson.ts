import { useMutation, useQueryClient } from '@tanstack/react-query';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its hook test.
import { invalidateCourseLessons } from './invalidate-course-lessons';
import { dataKeys } from './keys';

/**
 * Link an existing library lesson into a module. One removed and added back is
 * how a course updates it.
 */
export function useLinkLesson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { moduleId: number; lessonId: number }) => {
      const res = await fetch(`/api/admin/modules/${vars.moduleId}/lessons`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lessonId: vars.lessonId }),
      });
      if (res.status === 409) {
        // Read the route's own explanation rather than duplicating its
        // string here — two copies of the same sentence drift the moment
        // either one is edited.
        const body = (await res.json().catch(() => null)) as {
          error?: unknown;
        } | null;
        const message =
          typeof body?.error === 'string'
            ? body.error
            : 'This course already teaches this lesson';
        throw new Error(message);
      }
      if (!res.ok) throw new Error(`Failed to link lesson (${res.status})`);
      return res.json();
    },
    onSuccess: (_data, { lessonId }) => {
      invalidateCourseLessons(queryClient);
      queryClient.invalidateQueries({
        queryKey: dataKeys.lessonPlaybacks(lessonId),
      });
    },
  });
}
