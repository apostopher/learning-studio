import { useMutation, useQueryClient } from '@tanstack/react-query';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its test.
import { dataKeys } from './keys';

const FORBIDDEN =
  "Only an admin or one of this discipline's subject experts can organise it.";

/** The server's own sentence when it sent one; the discipline sentence for a bare 403; else a coded fallback. */
async function readError(res: Response, fallback: string): Promise<never> {
  let message = res.status === 403 ? FORBIDDEN : fallback;
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === 'string') message = body.error;
  } catch {
    // Non-JSON body (the plain "Forbidden") — keep the sentence above.
  }
  throw new Error(message);
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

/**
 * Discipline modules are library furniture: every write here changes only
 * the org library query. Nothing invalidates a course board or a learner
 * payload, because nothing about a course changed.
 */
function useLibraryMutation<TVars>(
  request: (vars: TVars) => Promise<Response>,
  fallback: string,
  when: 'success' | 'settled',
) {
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: dataKeys.orgLibrary() });
  return useMutation({
    mutationFn: async (vars: TVars) => {
      const res = await request(vars);
      if (!res.ok) await readError(res, fallback);
    },
    // Drag commits refetch on SETTLED: after a failed move the optimistic
    // preview has been rolled back to a guess, and the refetch is the
    // truth — the same reasoning as `useMovePlacement`. Creates, renames and
    // deletes made no optimistic change, so success is enough.
    ...(when === 'settled'
      ? { onSettled: invalidate }
      : { onSuccess: invalidate }),
  });
}

export function useCreateDisciplineModule() {
  return useLibraryMutation(
    (vars: { disciplineId: number; name: string }) =>
      fetch(
        `/api/admin/disciplines/${vars.disciplineId}/modules`,
        json('POST', { name: vars.name }),
      ),
    'Could not create that module',
    'success',
  );
}

export function useRenameDisciplineModule() {
  return useLibraryMutation(
    (vars: { moduleId: number; name: string }) =>
      fetch(
        `/api/admin/discipline-modules/${vars.moduleId}`,
        json('PATCH', { name: vars.name }),
      ),
    'Could not rename that module',
    'success',
  );
}

export function useReorderDisciplineModule() {
  return useLibraryMutation(
    (vars: {
      moduleId: number;
      prevModuleId: number | null;
      nextModuleId: number | null;
    }) =>
      fetch(
        `/api/admin/discipline-modules/${vars.moduleId}`,
        json('PATCH', {
          prevModuleId: vars.prevModuleId,
          nextModuleId: vars.nextModuleId,
        }),
      ),
    'Could not reorder that module',
    'settled',
  );
}

export function useDeleteDisciplineModule() {
  return useLibraryMutation(
    (vars: { moduleId: number }) =>
      fetch(`/api/admin/discipline-modules/${vars.moduleId}`, {
        method: 'DELETE',
      }),
    'Could not delete that module',
    'success',
  );
}

export function usePlaceLibraryLesson() {
  return useLibraryMutation(
    (vars: {
      lessonId: number;
      disciplineModuleId: number | null;
      prevLessonId: number | null;
      nextLessonId: number | null;
    }) =>
      fetch(
        `/api/admin/lessons/${vars.lessonId}/library-placement`,
        json('PATCH', {
          disciplineModuleId: vars.disciplineModuleId,
          prevLessonId: vars.prevLessonId,
          nextLessonId: vars.nextLessonId,
        }),
      ),
    'Could not move that lesson',
    'settled',
  );
}
