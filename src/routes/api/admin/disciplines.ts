import { createFileRoute } from '@tanstack/react-router';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its route test.
import { listDisciplineStaffByOrg } from '#/db/discipline-staff';
import { createDiscipline, listDisciplines } from '#/db/disciplines';
import { getActiveOrgId } from '#/lib/active-org.server';
import { ForbiddenError, requireAdmin } from '#/lib/admin-functions.server';
import { createDisciplineInputSchema } from '#/lib/discipline-schemas';
import { requireDisciplineCreation } from '#/lib/permissions.server';

/**
 * `requireAdmin`, and deliberately NOT `requireDisciplinePermission`.
 *
 * Every route in this family administers WHO may author, which is an org-level
 * act, not an authoring one. The distinction is the codebase's own — see
 * `migrate-staff-roles.ts:76-80`: "admin is deliberately NOT granted
 * structure/content. Senior staff administer the university and do not author
 * its syllabi; an admin who needs to edit a course assigns themselves as a
 * subject-expert." Read in the other direction, that is exactly this guard: a
 * subject expert authors and does not administer. Guarding these routes on
 * discipline-scoped authority would let an SME appoint a peer — or themselves
 * — on the discipline they already hold, and the "an admin hires the experts"
 * rule would hold only until the first expert was hired. It would also let
 * them create and destroy disciplines, which is the shape of the org itself.
 *
 * `requireDisciplinePermission` is therefore never imported here. Its absence
 * is the guarantee; a test asserts it stays absent.
 */
async function guard(
  request: Request,
): Promise<{ userId: string; roles: string[] } | Response> {
  try {
    return await requireAdmin(request.headers);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return new Response('Forbidden', { status: 403 });
    }
    throw error;
  }
}

/**
 * Every discipline in the org, each with its lesson count and its subject
 * experts, plus how many lessons are filed under no discipline at all.
 *
 * The unfiled count is on this payload and not a separate request because it
 * is the same question asked of the same table: a lesson with no discipline is
 * admin-only by design (`requireLessonContentPermission` falls back to
 * `requireAdmin` when `disciplineId` is null), so the number is the size of a
 * queue only the person reading this screen can clear.
 *
 * The roster ships WITH the listing rather than being fetched per discipline:
 * this screen draws every discipline's experts at once, and a per-discipline
 * request would be an N+1 across the page's only read.
 */
export async function getDisciplinesHandler(
  request: Request,
): Promise<Response> {
  const actor = await guard(request);
  if (actor instanceof Response) return actor;

  const orgId = getActiveOrgId();
  const [listing, staffByDiscipline] = await Promise.all([
    listDisciplines(orgId),
    listDisciplineStaffByOrg(orgId),
  ]);

  return Response.json({
    disciplines: listing.disciplines.map((discipline) => ({
      ...discipline,
      // A discipline nobody staffs gets an empty list, not a missing key —
      // the client renders "No subject experts yet" off this, and `undefined`
      // would make an unstaffed discipline indistinguishable from a bug.
      staff: staffByDiscipline.get(discipline.id) ?? [],
    })),
    unfiledLessonCount: listing.unfiledLessonCount,
  });
}

/**
 * Create a discipline in the active org.
 *
 * The one handler in this file that is NOT `requireAdmin` — RBAC rule 1 admits
 * a course manager and a subject expert here too. Naming a new subject is
 * cheap and reversible by its author, so it does not need the org-level floor
 * that the rest of this family keeps.
 *
 * Everything else stays admin-only, and the split is deliberate: the response
 * carries `staff: []` because appointing experts is a separate,
 * `requireAdmin` write (`disciplines.$disciplineId.staff.ts`). A non-admin can
 * therefore name a discipline but cannot staff it — including cannot staff
 * themselves onto it, which is what stops discipline creation from becoming a
 * back door to authoring authority.
 */
export async function postDisciplineHandler(
  request: Request,
): Promise<Response> {
  try {
    await requireDisciplineCreation(request.headers);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return new Response('Forbidden', { status: 403 });
    }
    throw error;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = createDisciplineInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await createDiscipline(getActiveOrgId(), parsed.data.name);
  if (!result.ok) {
    // 409 plus the field name, so the inline name input owns the message
    // rather than a toast leaving the offending field unmarked — the same
    // contract `postPersonaHandler` uses.
    return Response.json(
      { error: 'A discipline with this name already exists', field: 'name' },
      { status: 409 },
    );
  }
  return Response.json(
    { ...result.discipline, lessonCount: 0, staff: [] },
    {
      status: 201,
    },
  );
}

export const Route = createFileRoute('/api/admin/disciplines')({
  server: {
    handlers: {
      GET: ({ request }) => getDisciplinesHandler(request),
      POST: ({ request }) => postDisciplineHandler(request),
    },
  },
});
