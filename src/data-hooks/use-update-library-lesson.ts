import { useMutation } from '@tanstack/react-query';
import type { RenameLessonInput } from '#/lib/admin-schemas';
import { dataKeys } from './keys';
import { useSettleContentWrite } from './lesson-content-write';

const failure = (res: Response) =>
  res.status === 403
    ? 'Only an admin or a subject expert of this lesson’s discipline can edit it.'
    : `Could not save the lesson (${res.status})`;

const patchLesson = (lessonId: number, body: Record<string, unknown>) =>
  fetch(`/api/admin/lessons/${lessonId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

/**
 * Rename a library lesson from the org-level editor. The name is content, so
 * it may carry a new version.
 *
 * The lesson-level sibling of `useUpdateLesson`, which takes a `courseId` to
 * pick the one course board to refetch. A lesson is org-owned and can be taught by several courses
 * at once, so from `/admin/editor` there is no single board to name.
 *
 * Guarded by `requireLessonContentPermission`, so a discipline SME may do this
 * to their own lessons and an admin to any (RBAC rules 2, 3 and 6).
 */
export function useRenameLibraryLesson(lessonId: number) {
  const settle = useSettleContentWrite(lessonId);
  return useMutation({
    mutationKey: dataKeys.lessonContentWrite(lessonId),
    mutationFn: async (input: RenameLessonInput) => {
      const res = await patchLesson(lessonId, input);
      if (!res.ok) throw new Error(failure(res));
    },
    onSuccess: (_data, { version }) => settle(version),
  });
}
