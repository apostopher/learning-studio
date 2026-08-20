import { useQuery } from '@tanstack/react-query';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// reached by the course page's component test.
import { adminCourseSummarySchema } from '#/lib/admin-schemas';
import { dataKeys } from './keys';

/**
 * Error carrying the HTTP status, so a refusal can be told from a failure.
 *
 * The endpoint answers 403 — never an empty list — for someone with neither
 * `course:read` nor a `course_staff` row, because `[]` would read as "no
 * courses exist". Without the status the page could only say "please try
 * again", which is the same lie wearing a different hat: retrying will never
 * work, and a locked state has to give its reason.
 */
export class AdminCoursesRequestError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'AdminCoursesRequestError';
    this.status = status;
  }
}

/**
 * The courses this actor may see: the whole catalogue with `course:read`,
 * otherwise the ones they are staffed on. The server decides which — the
 * response shape is the same either way, so nothing here branches.
 */
export function useAdminCourses() {
  return useQuery({
    queryKey: dataKeys.adminCourses(),
    queryFn: async () => {
      const res = await fetch('/api/admin/courses');
      if (!res.ok) {
        throw new AdminCoursesRequestError(
          `Failed to load courses (${res.status})`,
          res.status,
        );
      }
      return adminCourseSummarySchema.array().parse(await res.json());
    },
    staleTime: 60_000,
    // Retrying a refusal cannot succeed, and each attempt delays the
    // explanation the page owes the reader.
    retry: (failureCount, error) =>
      error instanceof AdminCoursesRequestError && error.status === 403
        ? false
        : failureCount < 1,
  });
}
