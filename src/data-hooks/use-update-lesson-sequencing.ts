import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { CourseBoard } from '@/lib/admin-schemas';
import { dataKeys } from './keys';

/**
 * Turn a module's derived lesson chain on or off.
 *
 * Optimistic against the course board so the toggle and every derived "after:"
 * line under it settle together — the chain is computed from this flag, so a
 * lagging toggle would leave the rows below it describing the previous state.
 *
 * Serialized per module for the same reason `useUpdateModuleDependencies` is:
 * the whole value is sent, so overlapping writes can persist a state the admin
 * only passed through.
 */
export function useUpdateModuleSequential(courseId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    scope: { id: `module-sequencing-${courseId}` },
    mutationFn: async (input: {
      moduleId: number;
      sequentialLessons: boolean;
    }) => {
      const res = await fetch(`/api/admin/modules/${input.moduleId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sequentialLessons: input.sequentialLessons }),
      });
      if (!res.ok) {
        throw new Error(`Failed to update sequencing (${res.status})`);
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
            m.id === input.moduleId
              ? { ...m, sequentialLessons: input.sequentialLessons }
              : m,
          ),
        });
      }
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          dataKeys.courseBoard(courseId),
          context.previous,
        );
      }
      toast.error("Couldn't update lesson order");
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: dataKeys.courseBoard(courseId),
      });
    },
  });
}

/**
 * Replace one lesson's explicit prerequisites.
 *
 * Sends slugs only. `moduleSlug` is neither sent nor stored: lesson slugs are
 * globally unique, so it is redundant for lookup, and a stored one goes stale
 * the moment the lesson moves module — which is how gates used to disappear
 * with nothing to indicate it.
 *
 * No cycle error to handle, unlike the module equivalent. Expansion drops
 * every edge pointing at a later lesson, so a loop cannot be formed by any
 * combination of writes.
 */
export function useUpdateLessonDependencies(courseId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    scope: { id: `lesson-dependencies-${courseId}` },
    mutationFn: async (input: { lessonId: number; dependsOn: string[] }) => {
      const res = await fetch(`/api/admin/lessons/${input.lessonId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ courseId, dependsOn: input.dependsOn }),
      });
      if (!res.ok) {
        throw new Error(`Failed to update prerequisites (${res.status})`);
      }
    },
    onMutate: async (input) => {
      const key = dataKeys.courseBoard(courseId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<CourseBoard>(key);
      if (previous) {
        queryClient.setQueryData<CourseBoard>(key, {
          ...previous,
          modules: previous.modules.map((m) => ({
            ...m,
            lessons: m.lessons.map((l) =>
              l.id === input.lessonId
                ? {
                    ...l,
                    dependsOn: input.dependsOn.map((lessonSlug) => ({
                      lessonSlug,
                    })),
                  }
                : l,
            ),
          })),
        });
      }
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          dataKeys.courseBoard(courseId),
          context.previous,
        );
      }
      toast.error("Couldn't update prerequisites");
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: dataKeys.courseBoard(courseId),
      });
    },
  });
}
