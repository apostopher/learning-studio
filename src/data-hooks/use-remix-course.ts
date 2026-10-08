import { useMutation, useQueryClient } from '@tanstack/react-query';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its test.
import { dataKeys } from './keys';

interface RemixVars {
  courseId: number;
  sourceCourseId: number;
}

async function readError(res: Response, fallback: string): Promise<Error> {
  const body = (await res.json().catch(() => null)) as {
    error?: unknown;
  } | null;
  return new Error(typeof body?.error === 'string' ? body.error : fallback);
}

/**
 * After either mutation the remixer's rail changed shape: the org editor
 * (`editorBoard`), that course's own board (`courseBoards` prefix — cheaper
 * than threading the id in), the courses list's module count, and the
 * remixer's posters. The poster map is per course and scoped to the lessons
 * the course showed when it was fetched, so without this every borrowed
 * lesson draws the grey tile for the map's 30-minute staleTime.
 */
function useInvalidateRemixReaders() {
  const queryClient = useQueryClient();
  return (_data: unknown, { courseId }: RemixVars) => {
    queryClient.invalidateQueries({ queryKey: dataKeys.editorBoard() });
    queryClient.invalidateQueries({ queryKey: dataKeys.courseBoards() });
    queryClient.invalidateQueries({ queryKey: dataKeys.adminCourses() });
    queryClient.invalidateQueries({
      queryKey: dataKeys.lessonPosters(courseId),
    });
  };
}

/** Remix `sourceCourseId` into `courseId` — a live link, undone by `useUnremixCourse`. */
export function useRemixCourse() {
  const invalidate = useInvalidateRemixReaders();
  return useMutation({
    mutationFn: async (vars: RemixVars): Promise<{ moduleCount: number }> => {
      const res = await fetch(`/api/admin/courses/${vars.courseId}/remixes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sourceCourseId: vars.sourceCourseId }),
      });
      if (!res.ok)
        throw await readError(res, `Failed to remix course (${res.status})`);
      return (await res.json()) as { moduleCount: number };
    },
    onSuccess: invalidate,
  });
}

export function useUnremixCourse() {
  const invalidate = useInvalidateRemixReaders();
  return useMutation({
    mutationFn: async (vars: RemixVars): Promise<{ moduleCount: number }> => {
      const res = await fetch(
        `/api/admin/courses/${vars.courseId}/remixes/${vars.sourceCourseId}`,
        { method: 'DELETE' },
      );
      if (!res.ok)
        throw await readError(res, `Failed to un-remix course (${res.status})`);
      return (await res.json()) as { moduleCount: number };
    },
    onSuccess: invalidate,
  });
}
