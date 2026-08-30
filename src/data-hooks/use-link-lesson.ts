import { useMutation, useQueryClient } from '@tanstack/react-query';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its hook test.
import { dataKeys } from './keys';

/**
 * Link an existing library lesson into a module.
 *
 * Invalidates BOTH the editor board and the library: linking changes the
 * course's board (the lesson now appears there) *and* the library's "in N
 * courses" badge count for that lesson. Invalidating only one leaves the
 * other showing a stale count with nothing to tell the admin it's wrong.
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
        throw new Error('This course already teaches this lesson');
      }
      if (!res.ok) throw new Error(`Failed to link lesson (${res.status})`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dataKeys.editorBoard() });
      queryClient.invalidateQueries({ queryKey: dataKeys.orgLibrary() });
    },
  });
}
