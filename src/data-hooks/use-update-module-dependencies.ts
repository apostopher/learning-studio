import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { CourseBoard } from '@/lib/admin-schemas';
import { dataKeys } from './keys';

/** Thrown for a 409 so `onError` can tell a lost race from a real failure. */
class DependencyCycleError extends Error {}

/**
 * Replace a module's prerequisites, optimistically patching the course board so
 * the chips settle instantly; rolls back with a toast on error.
 *
 * The whole array is sent, never a delta — so the mutations are serialized per
 * module via `scope`. Without it, adding three chips quickly fires three
 * overlapping PATCHes and whichever lands last wins, which can persist a state
 * the admin passed through rather than the one they chose.
 */
export function useUpdateModuleDependencies(courseId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    scope: { id: `module-dependencies-${courseId}` },
    mutationFn: async (input: { moduleId: number; dependsOn: string[] }) => {
      const res = await fetch(`/api/admin/modules/${input.moduleId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dependsOn: input.dependsOn }),
      });
      if (res.status === 409) {
        throw new DependencyCycleError('Would create a dependency loop');
      }
      if (!res.ok) {
        throw new Error(`Failed to update dependencies (${res.status})`);
      }
    },
    onMutate: async (input) => {
      const key = dataKeys.courseBoard(courseId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<CourseBoard>(key);
      if (previous) {
        queryClient.setQueryData<CourseBoard>(key, {
          ...previous,
          modules: previous.modules.map((m) =>
            m.id === input.moduleId ? { ...m, dependsOn: input.dependsOn } : m,
          ),
        });
      }
      return { previous };
    },
    onError: (error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          dataKeys.courseBoard(courseId),
          context.previous,
        );
      }
      toast.error(
        error instanceof DependencyCycleError
          ? 'That would create a loop — someone else may have changed dependencies. Reloading the latest.'
          : "Couldn't update dependencies",
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: dataKeys.courseBoard(courseId),
      });
    },
  });
}
