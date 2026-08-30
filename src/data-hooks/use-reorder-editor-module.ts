import { useMutation, useQueryClient } from '@tanstack/react-query';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its test.
import { dataKeys } from './keys';

interface ReorderVars {
  moduleId: number;
  prevModuleId: number | null;
  nextModuleId: number | null;
}

/**
 * Reorder a module within its own course, from the knowledge editor.
 *
 * Same route as `useReorderModule`, keyed to the org-wide `editorBoard`
 * rather than one course's `courseBoard` — see `useMovePlacement` for why the
 * editor cannot reuse the course-scoped hook.
 */
export function useReorderEditorModule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: ReorderVars) => {
      const res = await fetch(`/api/admin/modules/${vars.moduleId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prevModuleId: vars.prevModuleId,
          nextModuleId: vars.nextModuleId,
        }),
      });
      if (!res.ok) throw new Error(`Failed to reorder module (${res.status})`);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: dataKeys.editorBoard() });
    },
  });
}
