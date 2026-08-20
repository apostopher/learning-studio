import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  COURSE_SCOPED_ROLES,
  type SetCourseStaffInput,
  STAFF_CANDIDATE_MIN_QUERY,
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

/**
 * The roster together with what this actor may grant on this course.
 *
 * `assignableRoles` is server-computed (see `assignableCourseRoles`): the rule
 * is asymmetric — an admin may appoint either role, a subject expert only a
 * course manager — and the router context carries global roles only, so the
 * client cannot derive it without re-implementing the policy that the write
 * guard already owns.
 */
const courseStaffResponseSchema = z.object({
  staff: z.array(courseStaffMemberSchema),
  assignableRoles: z.array(z.enum(COURSE_SCOPED_ROLES)),
  /** Whether the per-member Remove control may render at all. */
  canRemove: z.boolean(),
});
export type CourseStaffResponse = z.infer<typeof courseStaffResponseSchema>;

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
 * Everyone staffed on this course, plus the roles this actor may grant here.
 *
 * `null` means the actor cannot see this course's roster — `staff:read` is
 * course-scoped, so the route context (global permissions only) can't decide
 * this locally. The panel is rendered optimistically and this is how it
 * learns to hide, matching `useCourseBoard`'s 404-means-null treatment.
 */
export function useCourseStaff(courseId: number) {
  return useQuery({
    queryKey: dataKeys.courseStaff(courseId),
    queryFn: async (): Promise<CourseStaffResponse | null> => {
      const res = await fetch(`/api/admin/courses/${courseId}/staff`);
      if (res.status === 403) return null;
      if (!res.ok) {
        throw new CourseStaffRequestError(
          `Failed to load course staff (${res.status})`,
          res.status,
        );
      }
      return courseStaffResponseSchema.parse(await res.json());
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

const staffCandidateSchema = z.object({
  userId: z.string(),
  email: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
});
export type StaffCandidate = z.infer<typeof staffCandidateSchema>;

/**
 * People who may be appointed to this course's staff, by search term.
 *
 * Not `useAdminUsers`. That hook fetches `/api/admin/users`, which requires
 * `user:read` — a permission with an admin floor that a subject expert cannot
 * hold. It answered 403, `data` was `undefined`, and the picker silently
 * offered nobody. This route is guarded on `staff:create` for this course:
 * exactly the authority that permits the appointment being made.
 *
 * Disabled below the minimum term rather than debounced: the request only ever
 * fires for a search the server would accept, and React Query caches per term,
 * so retyping a prefix costs nothing.
 */
export function useCourseStaffCandidates(courseId: number, query: string) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: dataKeys.courseStaffCandidates(courseId, trimmed),
    queryFn: async (): Promise<StaffCandidate[]> => {
      const res = await fetch(
        `/api/admin/courses/${courseId}/staff/candidates?q=${encodeURIComponent(trimmed)}`,
      );
      if (!res.ok) {
        await readError(res, 'Could not search for people');
      }
      return staffCandidateSchema.array().parse(await res.json());
    },
    enabled: trimmed.length >= STAFF_CANDIDATE_MIN_QUERY,
    staleTime: 30_000,
  });
}
