import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type CoursePersonaSelection,
  coursePersonaSelectionSchema,
} from '#/lib/admin-schemas';
import { dataKeys } from './keys';
import { PersonaRequestError } from './use-personas';

async function readError(res: Response, fallback: string): Promise<never> {
  let message = fallback;
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === 'string') message = body.error;
  } catch {
    // Non-JSON body (e.g. the plain "Forbidden") — keep the fallback.
  }
  throw new PersonaRequestError(message, res.status);
}

/**
 * Which persona this course is pinned to for the active org.
 *
 * `personaId: null` means no course-level override, so the org default
 * applies — a legitimate state, not a missing value. `linked: false` means the
 * course isn't a member of the active org at all.
 */
export function useCoursePersona(courseId: number) {
  return useQuery({
    queryKey: dataKeys.coursePersona(courseId),
    queryFn: async (): Promise<CoursePersonaSelection> => {
      const res = await fetch(`/api/admin/courses/${courseId}/persona`);
      if (!res.ok) {
        await readError(
          res,
          `Failed to load persona selection (${res.status})`,
        );
      }
      return coursePersonaSelectionSchema.parse(await res.json());
    },
    staleTime: 30_000,
  });
}

/**
 * Pin this course to a persona, or pass `null` to follow the org default.
 *
 * Optimistic, because the radio's checked state is driven by this query:
 * waiting for the server would mean the dot only moves after a PUT *and* a
 * refetch have both completed, which reads as a broken control rather than a
 * slow one. The write is a single boolean-ish field with no server-side
 * derivation, so the predicted state is exactly what comes back.
 */
export function useSetCoursePersona(courseId: number) {
  const queryClient = useQueryClient();
  const key = dataKeys.coursePersona(courseId);

  return useMutation({
    mutationFn: async (personaId: number | null) => {
      const res = await fetch(`/api/admin/courses/${courseId}/persona`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personaId }),
      });
      if (!res.ok) await readError(res, 'Could not update the persona');
    },
    onMutate: async (personaId) => {
      // Cancel first: an in-flight refetch that resolves after this would
      // overwrite the optimistic value with pre-mutation data.
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<CoursePersonaSelection>(key);
      queryClient.setQueryData<CoursePersonaSelection>(key, (old) =>
        old ? { ...old, personaId } : { linked: true, personaId },
      );
      return { previous };
    },
    onError: (_error, _personaId, context) => {
      // Roll back to exactly what was there, so a rejected write (e.g. an
      // unpublished persona) doesn't leave the radio lying about the state.
      if (context?.previous !== undefined) {
        queryClient.setQueryData(key, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
      // The persona list carries `usedByCourses`, which this just changed —
      // and that text is server-derived, so it can only settle on a refetch.
      queryClient.invalidateQueries({ queryKey: dataKeys.personas() });
    },
  });
}
