import { useMutation, useQueryClient } from '@tanstack/react-query';
import { dataKeys } from './keys';

/**
 * Delete a lesson outright — from the library and from every course teaching
 * it, cascading its progress rows.
 *
 * Takes no course id, and invalidates the two ORG-level keys rather than one
 * course's board. That is not a simplification: a lesson now belongs to the
 * org and can sit in many courses, so there is no single board to refresh.
 * Both keys are needed — the editor board loses the placements, and the
 * library loses the card (and every other card's "in N courses" badge is
 * unaffected, but the deleted one has to go).
 */
export function useDeleteLesson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (lessonId: number) => {
      const res = await fetch(`/api/admin/lessons/${lessonId}`, {
        method: 'DELETE',
      });
      // A 403 is a refusal, not a failure, and "please try again" would be a
      // lie: authority over a lesson's existence follows its DISCIPLINE (see
      // `requireLessonContentPermission`), so retrying changes nothing.
      if (res.status === 403) {
        throw new Error(
          'You cannot delete this lesson. Deleting one needs authority over its discipline, or an org-wide admin role.',
        );
      }
      if (!res.ok) throw new Error(`Failed to delete lesson (${res.status})`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dataKeys.editorBoard() });
      queryClient.invalidateQueries({ queryKey: dataKeys.orgLibrary() });
    },
  });
}
