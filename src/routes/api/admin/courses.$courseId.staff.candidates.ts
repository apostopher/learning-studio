import { createFileRoute } from '@tanstack/react-router';
import { searchStaffCandidates } from '#/db/users';
import { ForbiddenError } from '#/lib/admin-functions.server';
import { STAFF_CANDIDATE_MIN_QUERY } from '#/lib/admin-schemas';
import { requireCoursePermission } from '#/lib/permissions.server';

function parseCourseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * People who could be appointed to this course's staff, by search term.
 *
 * Exists because the person picker used to be fed by `/api/admin/users`, which
 * requires `user:read` — and `requirePermission` keeps an admin floor. A
 * subject expert holds no global role, so that request 403'd, the roster came
 * back `undefined`, and `?? []` turned it into an empty picker: the form
 * rendered, offered nobody, and said nothing. Spec §5's "an SME assigns a
 * course-manager on their own courses" was unreachable, silently.
 *
 * Guarded on `staff:create` for THIS course — the same authority that permits
 * the appointment itself, so the lookup can never be narrower or wider than
 * the act it feeds.
 *
 * A search term is required, and checked only after the guard: this is a
 * larger audience than the People screen (anyone staffing any one course), and
 * "hand me every account" is not a question a course-scoped role should be
 * able to ask. The guard runs first so an unauthorised caller learns nothing
 * about the parameters.
 */
export async function getCourseStaffCandidatesHandler(
  request: Request,
  courseIdRaw: string,
): Promise<Response> {
  const courseId = parseCourseId(courseIdRaw);
  if (courseId === null) {
    return Response.json({ error: 'Invalid course id' }, { status: 400 });
  }

  try {
    await requireCoursePermission(request.headers, courseId, 'staff', 'create');
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return new Response('Forbidden', { status: 403 });
    }
    throw error;
  }

  const query = (new URL(request.url).searchParams.get('q') ?? '').trim();
  if (query.length < STAFF_CANDIDATE_MIN_QUERY) {
    return Response.json(
      {
        error: `Type at least ${STAFF_CANDIDATE_MIN_QUERY} characters to search for a person.`,
      },
      { status: 400 },
    );
  }

  return Response.json(await searchStaffCandidates(query));
}

export const Route = createFileRoute(
  '/api/admin/courses/$courseId/staff/candidates',
)({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        getCourseStaffCandidatesHandler(request, params.courseId),
    },
  },
});
