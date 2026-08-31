import { createFileRoute } from '@tanstack/react-router';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its route test.
import {
  assignDisciplineStaff,
  removeDisciplineStaff,
} from '#/db/discipline-staff';
import { getActiveOrgId } from '#/lib/active-org.server';
import { ForbiddenError, requireAdmin } from '#/lib/admin-functions.server';
import { setDisciplineStaffInputSchema } from '#/lib/discipline-schemas';

/**
 * `requireAdmin`. Appointing a subject expert is an ORG-level act.
 *
 * This is the guard the whole task turns on, so it is worth stating what it
 * refuses. `requireDisciplinePermission` — the guard that decides who may edit
 * a lesson — would admit the discipline's own SME here, and an SME who can
 * write `discipline_staff` can appoint a peer to their own discipline, or
 * re-appoint themselves after being removed. Role assignment would be
 * self-propagating and the "an admin hires the experts" rule would survive
 * exactly as far as the first hire.
 *
 * The codebase already reasons this way in the other direction:
 * `migrate-staff-roles.ts:76-80` withholds `content` from `admin` because
 * "senior staff administer the university and do not author its syllabi." The
 * two halves are the same rule — administering and authoring are separate
 * authorities, and neither implies the other. An admin who wants to author
 * grants themselves a row here, which is precisely the record `assigned_by`
 * keeps.
 *
 * Contrast `courses.$courseId.staff.ts`, which is course-SCOPED on purpose:
 * there, an SME may appoint a course MANAGER (an assistant, strictly less
 * authority) but never a peer. There is no lesser role on a discipline —
 * `DISCIPLINE_SCOPED_ROLES` has one member — so there is no equivalent
 * appointment for an SME to make, and no asymmetric role rail to compute. The
 * guard is the whole policy.
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

function parseDisciplineId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function parseBody(
  request: Request,
): Promise<
  | { ok: true; userId: string; role: 'subject-expert' }
  | { ok: false; res: Response }
> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return {
      ok: false,
      res: Response.json({ error: 'Invalid JSON body' }, { status: 400 }),
    };
  }
  const parsed = setDisciplineStaffInputSchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      res: Response.json({ error: parsed.error.flatten() }, { status: 400 }),
    };
  }
  return { ok: true, userId: parsed.data.userId, role: parsed.data.role };
}

/**
 * Grant `subject-expert` on this discipline.
 *
 * `assignedBy` is the acting admin's user id as resolved by `requireAdmin`
 * from the SESSION — never a value from the request body. An audit column an
 * unprivileged caller can populate records fiction, and this one is the only
 * record of who let a given person into a discipline.
 */
export async function putDisciplineStaffHandler(
  request: Request,
  disciplineIdRaw: string,
): Promise<Response> {
  const actor = await guard(request);
  if (actor instanceof Response) return actor;

  const disciplineId = parseDisciplineId(disciplineIdRaw);
  if (disciplineId === null) {
    return Response.json({ error: 'Invalid discipline id' }, { status: 400 });
  }

  const body = await parseBody(request);
  if (!body.ok) return body.res;

  const result = await assignDisciplineStaff({
    userId: body.userId,
    disciplineId,
    roleName: body.role,
    // The org this deployment administers, not anything the caller chose.
    // Without it, a `disciplineId` belonging to another org — or to no
    // discipline at all — is just an integer, and the row is written anyway.
    orgId: getActiveOrgId(),
    assignedBy: actor.userId,
  });
  if (!result.ok) {
    if (result.reason === 'unknown-discipline') {
      // 404 and NOT a 403, matching how the rest of this family answers an id
      // this org does not own (`renameDiscipline`, `deleteDiscipline`). The
      // caller is a verified admin of THIS org; the id is simply not one of
      // theirs. It is also the answer for an id that exists nowhere, which
      // would otherwise reach the INSERT and raise an uncaught foreign-key
      // violation — the 500 this route already refuses to give for an
      // unknown `userId`.
      return Response.json({ error: 'Discipline not found' }, { status: 404 });
    }
    if (result.reason === 'not-assignable') {
      return Response.json(
        { error: 'Role is not discipline-assignable' },
        { status: 400 },
      );
    }
    if (result.reason === 'unknown-user') {
      // 404, not the 500 the `discipline_staff.user_id` foreign key would
      // otherwise raise: a user id the directory does not know is a bad
      // request body, and must not read as a server fault.
      return Response.json({ error: 'User not found' }, { status: 404 });
    }
    return Response.json({ error: 'Role not found' }, { status: 404 });
  }
  return new Response(null, { status: 204 });
}

/**
 * Revoke `subject-expert` on this discipline.
 *
 * Org-scoped like the grant: an id belonging to another org is refused before
 * anything is deleted, because a revocation is destructive and immediate.
 *
 * No self-removal exemption, unlike `deleteCourseStaffHandler`. That exemption
 * exists so a professor can resign without an admin, and it is safe there
 * because the rail it skips is a peer-appointment rail. Here the guard is
 * `requireAdmin` outright: an SME cannot reach this handler at all, so there is
 * no "their own row" case to exempt. An admin who granted themselves a
 * discipline can still revoke it — they are an admin.
 */
export async function deleteDisciplineStaffHandler(
  request: Request,
  disciplineIdRaw: string,
): Promise<Response> {
  const actor = await guard(request);
  if (actor instanceof Response) return actor;

  const disciplineId = parseDisciplineId(disciplineIdRaw);
  if (disciplineId === null) {
    return Response.json({ error: 'Invalid discipline id' }, { status: 400 });
  }

  const body = await parseBody(request);
  if (!body.ok) return body.res;

  const result = await removeDisciplineStaff({
    userId: body.userId,
    disciplineId,
    roleName: body.role,
    orgId: getActiveOrgId(),
  });
  if (!result.ok) {
    // The only reason this write reports: an id this org does not own. A row
    // that was already gone is a silent success, exactly as before.
    return Response.json({ error: 'Discipline not found' }, { status: 404 });
  }
  return new Response(null, { status: 204 });
}

export const Route = createFileRoute(
  '/api/admin/disciplines/$disciplineId/staff',
)({
  server: {
    handlers: {
      PUT: ({ request, params }) =>
        putDisciplineStaffHandler(request, params.disciplineId),
      DELETE: ({ request, params }) =>
        deleteDisciplineStaffHandler(request, params.disciplineId),
    },
  },
});
