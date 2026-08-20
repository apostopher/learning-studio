import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import type { CourseStaffMember } from '#/db/course-staff';
import {
  type SetCourseStaffInput,
  setCourseStaffInputSchema,
} from '#/lib/admin-schemas';
import { dataKeys } from './keys';

/** Error carrying the HTTP status, so a 403 can be told apart from a genuine failure. */
export class CourseStaffRequestError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'CourseStaffRequestError';
    this.status = status;
  }
}

const courseStaffMemberSchema = z.object({
  userId: z.string(),
  email: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  roles: z.array(z.string()),
});
const courseStaffListSchema = z.array(courseStaffMemberSchema);

async function readError(res: Response, fallback: string): Promise<never> {
  let message = fallback;
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === 'string') message = body.error;
  } catch {
    // Non-JSON body (e.g. the plain "Forbidden") — keep the fallback.
  }
  throw new CourseStaffRequestError(message, res.status);
}

/**
 * Everyone staffed on this course.
 *
 * `null` means the actor cannot see this course's roster — `staff:read` is
 * course-scoped, so the route context (global permissions only) can't decide
 * this locally. The panel is rendered optimistically and this is how it
 * learns to hide, matching `useCourseBoard`'s 404-means-null treatment.
 */
export function useCourseStaff(courseId: number) {
  return useQuery({
    queryKey: dataKeys.courseStaff(courseId),
    queryFn: async (): Promise<CourseStaffMember[] | null> => {
      const res = await fetch(`/api/admin/courses/${courseId}/staff`);
      if (res.status === 403) return null;
      if (!res.ok) {
        throw new CourseStaffRequestError(
          `Failed to load course staff (${res.status})`,
          res.status,
        );
      }
      return courseStaffListSchema.parse(await res.json());
    },
    staleTime: 30_000,
  });
}

/**
 * Assign a course-scoped role. Also enrols the appointee server-side — see
 * `putCourseStaffHandler`.
 *
 * No optimistic update, matching this file's siblings: the server both
 * validates the role and may refuse the write (e.g. an SME appointing
 * another SME), so predicting the roster here risks showing a member who was
 * never actually added.
 */
export function useAssignCourseStaff(courseId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SetCourseStaffInput) => {
      const res = await fetch(`/api/admin/courses/${courseId}/staff`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(setCourseStaffInputSchema.parse(input)),
      });
      if (!res.ok) await readError(res, 'Could not assign that role');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: dataKeys.courseStaff(courseId),
      });
    },
  });
}

/**
 * Remove a course-scoped role. Deliberately does not un-enrol — see
 * `deleteCourseStaffHandler`.
 */
export function useRemoveCourseStaff(courseId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SetCourseStaffInput) => {
      const res = await fetch(`/api/admin/courses/${courseId}/staff`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(setCourseStaffInputSchema.parse(input)),
      });
      if (!res.ok) await readError(res, 'Could not remove that role');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: dataKeys.courseStaff(courseId),
      });
    },
  });
}
