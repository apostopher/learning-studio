import { createFileRoute } from '@tanstack/react-router';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its route test.
import { findDisciplineInOrg } from '#/db/disciplines';
import { getDisciplineLessonPosters } from '#/db/library-posters';
import { getActiveOrgId } from '#/lib/active-org.server';
import { ForbiddenError } from '#/lib/admin-functions.server';
import { UNTITLED_DISCIPLINE_ID } from '#/lib/dnd-ids';
import {
  absentResourceResponse,
  requireLessonContentPermission,
} from '#/lib/permissions.server';

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id >= 0 ? id : null;
}

/**
 * Poster frames for a discipline's shelf — the library-pane twin of
 * `courses.$courseId.lesson-posters`. `UNTITLED_DISCIPLINE_ID` (0) names the
 * org-level Untitled bag, whose guard is the admin check
 * `requireLessonContentPermission(null)` already encodes; a real discipline
 * is org-checked first (an unowned id reads as not found) and then guarded
 * on its content:read, the same ordering as the sibling discipline routes.
 *
 * No 404 for "no posters": `{}` is a real answer, as on the course route.
 */
export async function getDisciplineLessonPostersHandler(
  request: Request,
  disciplineIdRaw: string,
): Promise<Response> {
  const parsed = parseId(disciplineIdRaw);
  if (parsed === null)
    return Response.json({ error: 'Invalid discipline id' }, { status: 400 });
  const disciplineId = parsed === UNTITLED_DISCIPLINE_ID ? null : parsed;
  const orgId = getActiveOrgId();
  if (
    disciplineId !== null &&
    !(await findDisciplineInOrg(orgId, disciplineId))
  ) {
    return absentResourceResponse(request.headers, 'Discipline not found');
  }
  try {
    await requireLessonContentPermission(request.headers, disciplineId, 'read');
  } catch (error) {
    if (error instanceof ForbiddenError)
      return new Response('Forbidden', { status: 403 });
    throw error;
  }
  return Response.json(await getDisciplineLessonPosters(orgId, disciplineId));
}

export const Route = createFileRoute(
  '/api/admin/disciplines/$disciplineId/lesson-posters',
)({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        getDisciplineLessonPostersHandler(request, params.disciplineId),
    },
  },
});
