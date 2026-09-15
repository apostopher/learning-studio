import { createFileRoute } from '@tanstack/react-router';
// `#/` not `@/`: see the sibling routes.
import { placeLessonInLibrary } from '#/db/discipline-modules';
import { findDisciplineInOrg } from '#/db/disciplines';
import { getDisciplineIdForLessonId } from '#/db/lesson-access';
import { getActiveOrgId } from '#/lib/active-org.server';
import { ForbiddenError } from '#/lib/admin-functions.server';
import { libraryPlacementInputSchema } from '#/lib/admin-schemas';
import {
  absentResourceResponse,
  requireLessonContentPermission,
} from '#/lib/permissions.server';

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * File a lesson into a discipline module, or back to Untitled, at a
 * position. Guarded on the LESSON's discipline — the shelf being
 * rearranged — never on the target module's: the writer refuses a module of
 * another discipline regardless, and the guard must not be satisfiable by
 * naming a module the actor happens to hold. A lesson with no discipline
 * (the org-level Untitled column) has no shelf and no modules: 404.
 */
export async function patchLibraryPlacementHandler(
  request: Request,
  lessonIdRaw: string,
): Promise<Response> {
  const lessonId = parseId(lessonIdRaw);
  if (lessonId === null)
    return Response.json({ error: 'Invalid lesson id' }, { status: 400 });
  const lookup = await getDisciplineIdForLessonId(lessonId);
  if (!lookup.found || lookup.disciplineId === null) {
    return absentResourceResponse(request.headers, 'Lesson not found');
  }
  if (!(await findDisciplineInOrg(getActiveOrgId(), lookup.disciplineId))) {
    return absentResourceResponse(request.headers, 'Lesson not found');
  }
  try {
    await requireLessonContentPermission(
      request.headers,
      lookup.disciplineId,
      'update',
    );
  } catch (error) {
    if (error instanceof ForbiddenError)
      return new Response('Forbidden', { status: 403 });
    throw error;
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = libraryPlacementInputSchema.safeParse(body);
  if (!parsed.success)
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const result = await placeLessonInLibrary({ lessonId, ...parsed.data });
  if (result.ok) return Response.json(result);
  if (result.reason === 'wrong-discipline') {
    return Response.json(
      {
        error: `This lesson is in ${result.lessonDiscipline}; that module is in ${result.moduleDiscipline}. Lessons stay in their discipline — file it into one of ${result.lessonDiscipline}’s modules.`,
      },
      { status: 400 },
    );
  }
  return new Response('Not found', { status: 404 });
}

export const Route = createFileRoute(
  '/api/admin/lessons/$lessonId/library-placement',
)({
  server: {
    handlers: {
      PATCH: ({ request, params }) =>
        patchLibraryPlacementHandler(request, params.lessonId),
    },
  },
});
