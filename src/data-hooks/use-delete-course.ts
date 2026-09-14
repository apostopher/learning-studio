import { useMutation, useQueryClient } from '@tanstack/react-query';
import { dataKeys } from './keys';

/**
 * Error carrying the HTTP status and, for the one refusal with a number
 * attached, the remixer count — read off the JSON body, not parsed back out
 * of the sentence (see `DisciplineRequestError` for the reasoning).
 */
export class CourseRequestError extends Error {
  status: number;
  remixerCount?: number;
  constructor(message: string, status: number, remixerCount?: number) {
    super(message);
    this.name = 'CourseRequestError';
    this.status = status;
    this.remixerCount = remixerCount;
  }
}

/** Delete a course (modules and lessons cascade), then refetch the course list. */
export function useDeleteCourse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (courseId: number) => {
      const res = await fetch(`/api/admin/courses/${courseId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
          remixerCount?: number;
        } | null;
        throw new CourseRequestError(
          body?.error ?? `Failed to delete course (${res.status})`,
          res.status,
          body?.remixerCount,
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dataKeys.adminCourses() });
      // The org editor's rail draws the same courses. Without this its column
      // keeps the old name (or keeps a deleted course) until the board's own
      // staleTime elapses.
      queryClient.invalidateQueries({ queryKey: dataKeys.editorBoard() });
    },
  });
}
