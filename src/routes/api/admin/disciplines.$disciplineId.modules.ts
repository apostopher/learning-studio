import { createFileRoute } from '@tanstack/react-router';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its route test.
import { createDisciplineModule } from '#/db/discipline-modules';
import { findDisciplineInOrg } from '#/db/disciplines';
import { getActiveOrgId } from '#/lib/active-org.server';
import { ForbiddenError } from '#/lib/admin-functions.server';
import { createDisciplineModuleInputSchema } from '#/lib/admin-schemas';
import {
  absentResourceResponse,
  requireLessonContentPermission,
} from '#/lib/permissions.server';

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Add a module to a discipline's shelf. Same ordering as the sibling
 * `disciplines.$disciplineId.lessons.ts`: ownership BEFORE the guard so an
 * unowned id reads as not found, then `requireLessonContentPermission` —
 * the one chokepoint for "who may change this discipline's content".
 */
export async function postDisciplineModuleHandler(
  request: Request,
  disciplineIdRaw: string,
): Promise<Response> {
  const disciplineId = parseId(disciplineIdRaw);
  if (disciplineId === null)
    return Response.json({ error: 'Invalid discipline id' }, { status: 400 });
  if (!(await findDisciplineInOrg(getActiveOrgId(), disciplineId))) {
    return absentResourceResponse(request.headers, 'Discipline not found');
  }
  try {
    await requireLessonContentPermission(
      request.headers,
      disciplineId,
      'create',
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
  const parsed = createDisciplineModuleInputSchema.safeParse(body);
  if (!parsed.success)
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  return Response.json(
    await createDisciplineModule(disciplineId, parsed.data.name),
    { status: 201 },
  );
}

export const Route = createFileRoute(
  '/api/admin/disciplines/$disciplineId/modules',
)({
  server: {
    handlers: {
      POST: ({ request, params }) =>
        postDisciplineModuleHandler(request, params.disciplineId),
    },
  },
});
