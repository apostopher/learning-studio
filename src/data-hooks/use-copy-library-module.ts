import { useMutation, useQueryClient } from '@tanstack/react-query';
// `#/` not `@/`: vitest cannot resolve the `@/` alias.
import {
  type CopyDisciplineModuleInput,
  copiedModuleSchema,
} from '#/lib/admin-schemas';
import { dataKeys } from './keys';

/**
 * Copy a library (discipline) module, or one lesson of it, into a course as a
 * new module — the editor's drag of either onto a course column.
 *
 * Invalidates the editor board (the new module), every per-course board
 * (the same prefix `useLinkLesson` uses, for the same stale-30s reason) and
 * the library (each placed lesson's "in N courses" count just went up).
 */
export function useCopyLibraryModule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      vars: CopyDisciplineModuleInput & { courseId: number },
    ) => {
      const res = await fetch(
        `/api/admin/courses/${vars.courseId}/modules/from-library`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            disciplineModuleId: vars.disciplineModuleId,
            afterModuleId: vars.afterModuleId,
            onlyLessonId: vars.onlyLessonId,
          }),
        },
      );
      if (res.status === 409)
        throw new Error('This course already teaches this lesson');
      if (!res.ok) throw new Error(`Failed to add the module (${res.status})`);
      return copiedModuleSchema.parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dataKeys.editorBoard() });
      queryClient.invalidateQueries({ queryKey: dataKeys.courseBoards() });
      queryClient.invalidateQueries({ queryKey: dataKeys.orgLibrary() });
    },
  });
}
