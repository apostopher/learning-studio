import { useMutation, useQueryClient } from '@tanstack/react-query';
import { dataKeys } from './keys';

/**
 * Rename a library lesson, or change its availability, from the org-level
 * editor.
 *
 * The lesson-level sibling of `useUpdateLesson`/`useUpdateLessonConfig`, which
 * both take a `courseId` — used only to pick the course board to refetch. A
 * lesson is org-owned and can be taught by several courses at once, so from
 * `/admin/editor` there is no single board to name: this invalidates the two
 * queries that screen actually reads, and the per-course board keys are left
 * to refetch on their own next mount.
 *
 * Both fields go to the same `PATCH /api/admin/lessons/:id`, in two separate
 * requests, because the route parses its body as a discriminated shape — the
 * config schema is `.strict()` and rejects `name`, and the rename schema
 * rejects everything else. Sending only what changed is therefore not an
 * optimisation but the contract.
 *
 * Guarded by `requireLessonContentPermission`, so a discipline SME may do this
 * to their own lessons and an admin to any (RBAC rules 2, 3 and 6).
 */
export function useUpdateLibraryLesson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      lessonId: number;
      name?: string;
      isAvailable?: boolean;
    }) => {
      const patches: Record<string, unknown>[] = [];
      if (input.name !== undefined) patches.push({ name: input.name });
      if (input.isAvailable !== undefined) {
        patches.push({ isAvailable: input.isAvailable });
      }

      for (const patch of patches) {
        const res = await fetch(`/api/admin/lessons/${input.lessonId}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(patch),
        });
        if (!res.ok) {
          throw new Error(
            res.status === 403
              ? 'Only an admin or a subject expert of this lesson’s discipline can edit it.'
              : `Could not save the lesson (${res.status})`,
          );
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dataKeys.orgLibrary() });
      // The right-hand rail shows the same lesson's name and availability
      // chip, so it goes stale on exactly the same writes.
      queryClient.invalidateQueries({ queryKey: dataKeys.editorBoard() });
      // The PREFIX, not one course. This write changes data the per-course
      // board renders, and a lesson can sit in many courses — the editor
      // links straight across to `/admin/$courseId/editor`, whose
      // `useCourseBoard` has a 30s staleTime, so a board visited moments ago
      // is still *fresh* and shows the old value for the rest of that mount.
      // `useDeleteLesson` reasoned this through first; the same applies here.
      queryClient.invalidateQueries({ queryKey: dataKeys.courseBoards() });
    },
  });
}
