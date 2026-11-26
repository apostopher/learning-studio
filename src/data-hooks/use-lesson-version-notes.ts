import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SetLessonVersionNotesInput } from '#/lib/admin-schemas';
import { dataKeys } from './keys';

const url = (lessonId: number) =>
  `/api/admin/lessons/${lessonId}/version-notes`;

/** The notes saved for one version of a lesson; '' when there are none. */
export function useLessonVersionNotes(lessonId: number, version: string) {
  return useQuery({
    queryKey: dataKeys.lessonVersionNotes(lessonId, version),
    queryFn: async (): Promise<string> => {
      const res = await fetch(
        `${url(lessonId)}?version=${encodeURIComponent(version)}`,
      );
      if (!res.ok)
        throw new Error(`Could not load the version notes (${res.status})`);
      const body = (await res.json()) as { notes: string };
      return body.notes;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Save the notes for one version. Registered under the Save button's key, so
 * the button spins while they go.
 */
export function useSaveLessonVersionNotes(lessonId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: dataKeys.lessonSave(lessonId),
    mutationFn: async (input: SetLessonVersionNotesInput) => {
      const res = await fetch(url(lessonId), {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok)
        throw new Error(`Could not save the version notes (${res.status})`);
    },
    onSuccess: (_data, { version, notes }) => {
      queryClient.setQueryData(
        dataKeys.lessonVersionNotes(lessonId, version),
        notes.trim() === '' ? '' : notes,
      );
    },
  });
}
