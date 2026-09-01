import { createFileRoute } from '@tanstack/react-router';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its route test.
import { findDisciplineInOrg } from '#/db/disciplines';
import { createLibraryLesson } from '#/db/library-lessons';
import { getActiveOrgId } from '#/lib/active-org.server';
import { ForbiddenError } from '#/lib/admin-functions.server';
import { createLessonInputSchema } from '#/lib/admin-schemas';
import {
  absentResourceResponse,
  requireLessonContentPermission,
} from '#/lib/permissions.server';
import { parseDisciplineId } from './disciplines.$disciplineId';

/**
 * Who may write a lesson into this discipline: an ADMIN, or a SUBJECT EXPERT
 * of this particular discipline. Nobody else — not a course manager, not a
 * staffer on some other discipline.
 *
 * That is `requireLessonContentPermission` exactly, and it is written as one
 * call rather than a union here BECAUSE the admin half lives inside the guard
 * (see `requireScopedPermission`'s admin bypass, RBAC rule 3). An earlier
 * revision of this route hand-rolled `requireAdmin || scoped check` locally,
 * which was correct then and would now be a second copy of a rule the
 * chokepoint already enforces — the kind of copy that gets tightened in one
 * place and forgotten in the other.
 *
 * Ownership is settled BEFORE the guard and its absence reported through
 * `absentResourceResponse`: `disciplines.id` is a global serial, so without
 * the org check any id in the database would be writable, and a bare 404 would
 * confirm to a stranger which ids exist.
 */
async function guard(
  request: Request,
  disciplineId: number,
): Promise<Response | null> {
  try {
    await requireLessonContentPermission(
      request.headers,
      disciplineId,
      'create',
    );
    return null;
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return new Response('Forbidden', { status: 403 });
    }
    throw error;
  }
}

/**
 * Create a lesson filed under one discipline — the library's own "add lesson",
 * as opposed to `POST /api/admin/modules/:moduleId/lessons`, which creates a
 * lesson into a course's module.
 */
export async function postDisciplineLessonHandler(
  request: Request,
  disciplineIdRaw: string,
): Promise<Response> {
  const disciplineId = parseDisciplineId(disciplineIdRaw);
  if (disciplineId === null) {
    return Response.json({ error: 'Invalid discipline id' }, { status: 400 });
  }

  const orgId = getActiveOrgId();
  const owned = await findDisciplineInOrg(orgId, disciplineId);
  if (!owned) {
    return absentResourceResponse(request.headers, 'Discipline not found');
  }

  const denied = await guard(request, disciplineId);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = createLessonInputSchema.strict().safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const lesson = await createLibraryLesson({
    orgId,
    disciplineId,
    name: parsed.data.name,
  });
  return Response.json(lesson, { status: 201 });
}

export const Route = createFileRoute(
  '/api/admin/disciplines/$disciplineId/lessons',
)({
  server: {
    handlers: {
      POST: ({ request, params }) =>
        postDisciplineLessonHandler(request, params.disciplineId),
    },
  },
});
