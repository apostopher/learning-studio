import { createFileRoute } from '@tanstack/react-router';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its route test.
import { searchStaffCandidates } from '#/db/users';
import { ForbiddenError, requireAdmin } from '#/lib/admin-functions.server';
import { STAFF_CANDIDATE_MIN_QUERY } from '#/lib/admin-schemas';

/**
 * People who could be appointed a subject expert, by search term.
 *
 * A route of its own rather than reusing `/api/admin/users`, for the reason
 * `courses.$courseId.staff.candidates.ts` gives: that endpoint is guarded on
 * `user:read`, a separately grantable permission an admin may legitimately not
 * hold. It would 403, `data` would be `undefined`, `?? []` would turn it into
 * an empty picker, and the form would render, offer nobody, and say nothing.
 * Guarded on `requireAdmin` instead — exactly the authority that permits the
 * appointment this search feeds.
 *
 * NOT keyed by discipline id, unlike its course-scoped sibling. That one is
 * `requireCoursePermission(courseId, 'staff', 'create')`, so the id is
 * load-bearing: it decides whether the caller may search at all. Here the
 * guard is org-level, so a discipline id in the path would be a parameter
 * nothing reads — a lie about what is being checked.
 *
 * A search term is required, and checked only AFTER the guard, so an
 * unauthorised caller learns nothing about the parameters.
 */
export async function getDisciplineStaffCandidatesHandler(
  request: Request,
): Promise<Response> {
  try {
    await requireAdmin(request.headers);
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

export const Route = createFileRoute('/api/admin/discipline-staff-candidates')({
  server: {
    handlers: {
      GET: ({ request }) => getDisciplineStaffCandidatesHandler(request),
    },
  },
});
