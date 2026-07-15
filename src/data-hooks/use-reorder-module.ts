import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CourseBoard } from '@/lib/admin-schemas';
import { dataKeys } from './keys';

interface ReorderVars {
  moduleId: number;
  prevModuleId: number | null;
  nextModuleId: number | null;
}

/** Reorder a module (optimistic), persisting an averaged rank server-side. */
export function useReorderModule(courseId: number) {
  const queryClient = useQueryClient();
  const key = dataKeys.courseBoard(courseId);
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
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<CourseBoard | null>(key);
      queryClient.setQueryData<CourseBoard | null>(key, (old) => {
        if (!old) return old;
        const modules = [...old.modules];
        const from = modules.findIndex((m) => m.id === vars.moduleId);
        if (from === -1) return old;
        const [moved] = modules.splice(from, 1);
        const to =
          vars.prevModuleId == null
            ? 0
            : modules.findIndex((m) => m.id === vars.prevModuleId) + 1;
        modules.splice(to, 0, moved);
        return { ...old, modules };
      });
      return { previous };
    },
    onError: (_error, _vars, ctx) => {
      if (ctx?.previous !== undefined) {
        queryClient.setQueryData(key, ctx.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
    },
  });
}
