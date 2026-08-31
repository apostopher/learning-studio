import { and, eq } from 'drizzle-orm';
import { db } from '#/db';
import {
  disciplineStaffTable,
  disciplinesTable,
  userProfileTable,
  userRolesTable,
} from '#/db/schema';
import { isDisciplineScopedRole } from '#/lib/discipline-schemas';

/**
 * The roles this person holds ON this discipline. Empty for everyone else.
 *
 * Mirrors `getCourseRoleNames` exactly, scoped to `discipline_staff` instead
 * of `course_staff`. Runs on every lesson-content request once a lesson
 * resolves to a non-null discipline, which is why
 * `discipline_staff_user_discipline_idx` exists.
 */
export async function getDisciplineRoleNames(
  userId: string,
  disciplineId: number,
): Promise<string[]> {
  const rows = await db
    .select({ name: userRolesTable.name })
    .from(disciplineStaffTable)
    .innerJoin(
      userRolesTable,
      eq(userRolesTable.id, disciplineStaffTable.roleId),
    )
    .where(
      and(
        eq(disciplineStaffTable.userId, userId),
        eq(disciplineStaffTable.disciplineId, disciplineId),
      ),
    );
  return rows.map((r) => r.name);
}

/**
 * Staff on ANY discipline.
 *
 * Mirrors `isAnyCourseStaff` exactly, scoped to `discipline_staff` instead of
 * `course_staff`. Two callers, both computing a "staff anywhere" union:
 * `permissions.server.ts`'s `isStaffAnywhere` (server-side guards) and
 * `auth-context.server.ts`'s `resolveStaffing` (the router context's
 * `isStaffAnywhere` field, which gates `/admin` shell entry).
 *
 * Both must check this table as well as `course_staff`: a user can legitimately
 * hold a `discipline_staff` row and zero `course_staff` rows (the two tables
 * are deliberately independent — see `migrate-discipline-staff.ts`'s doc
 * comment on why there is no backfill linking them), so checking one alone
 * makes a discipline-only SME read as a stranger everywhere it is asked —
 * refused at any route gated on "is staff somewhere" (the docx-parse floor,
 * the `/admin` shell) even though `requireLessonContentPermission` would
 * correctly admit them once a lesson id resolves their discipline.
 *
 * NOT for anything that turns on a specific GRANT — same caveat as
 * `isAnyCourseStaff`. Resolve that with `requireDisciplinePermission` for a
 * known discipline.
 */
export async function isAnyDisciplineStaff(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: disciplineStaffTable.id })
    .from(disciplineStaffTable)
    .where(eq(disciplineStaffTable.userId, userId))
    .limit(1);
  return row !== undefined;
}

export type DisciplineStaffMember = {
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  roles: string[];
};

export type AssignDisciplineStaffInput = {
  userId: string;
  disciplineId: number;
  roleName: string;
  assignedBy: string;
};

/**
 * Everyone staffed on any discipline in the org, grouped by discipline id.
 *
 * One query for the whole screen rather than `listCourseStaff`'s one-per-scope
 * shape: the admin surface lists every discipline at once with its experts
 * inline, so a per-discipline call would be an N+1 across the page's only
 * read. The scope filter is `disciplines.org_id`, not a list of ids passed in —
 * the ids would be a second copy of the same org scope, able to drift from the
 * listing they were derived from.
 *
 * A discipline with no experts gets no key at all; the caller defaults a
 * missing id to `[]` rather than dropping the discipline, the same contract
 * `getCourseCountsForLessons` uses.
 */
export async function listDisciplineStaffByOrg(
  orgId: number,
): Promise<Map<number, DisciplineStaffMember[]>> {
  const rows = await db
    .select({
      disciplineId: disciplineStaffTable.disciplineId,
      userId: disciplineStaffTable.userId,
      email: userProfileTable.email,
      firstName: userProfileTable.firstName,
      lastName: userProfileTable.lastName,
      role: userRolesTable.name,
    })
    .from(disciplineStaffTable)
    .innerJoin(
      disciplinesTable,
      eq(disciplinesTable.id, disciplineStaffTable.disciplineId),
    )
    .innerJoin(
      userRolesTable,
      eq(userRolesTable.id, disciplineStaffTable.roleId),
    )
    .innerJoin(
      userProfileTable,
      eq(userProfileTable.userId, disciplineStaffTable.userId),
    )
    .where(eq(disciplinesTable.orgId, orgId));

  const byDiscipline = new Map<number, DisciplineStaffMember[]>();
  for (const row of rows) {
    const members = byDiscipline.get(row.disciplineId) ?? [];
    const existing = members.find((m) => m.userId === row.userId);
    if (existing) {
      existing.roles.push(row.role);
    } else {
      members.push({
        userId: row.userId,
        email: row.email,
        firstName: row.firstName,
        lastName: row.lastName,
        roles: [row.role],
      });
    }
    byDiscipline.set(row.disciplineId, members);
  }
  return byDiscipline;
}

/**
 * Grant a discipline-scoped role. Idempotent — re-granting the same role is a
 * no-op, via the `(user_id, discipline_id, role_id)` unique index.
 *
 * The role guard is the point of this function, and it mirrors
 * `assignCourseStaff`'s exactly. `requireDisciplinePermission` unions an
 * actor's global roles with their `discipline_staff` roles and asks
 * `getUserPermissions` for the combined set — which answers `Set(['*'])` the
 * moment `owner` appears in the list. A `discipline_staff` row naming `owner`
 * or `admin` would therefore hand out unconditional authority that merely
 * LOOKS discipline-scoped. Refusing anything outside `DISCIPLINE_SCOPED_ROLES`
 * here closes that at the write, not only at whichever route happens to call
 * it — and it refuses before any query runs, so a bad role name never reaches
 * the database at all.
 *
 * An unknown `userId` is reported rather than raised, for the same reason
 * `assignCourseStaff` reports it: `discipline_staff.user_id` is a foreign key
 * into `user_profiles`, and letting the constraint fire turns a bad request
 * body into a 500.
 */
export async function assignDisciplineStaff(
  input: AssignDisciplineStaffInput,
): Promise<
  | { ok: true }
  | { ok: false; reason: 'not-found' | 'not-assignable' | 'unknown-user' }
> {
  if (!isDisciplineScopedRole(input.roleName)) {
    return { ok: false, reason: 'not-assignable' };
  }

  const [role] = await db
    .select({ id: userRolesTable.id })
    .from(userRolesTable)
    .where(eq(userRolesTable.name, input.roleName))
    .limit(1);
  if (!role) return { ok: false, reason: 'not-found' };

  const [profile] = await db
    .select({ id: userProfileTable.id })
    .from(userProfileTable)
    .where(eq(userProfileTable.userId, input.userId))
    .limit(1);
  if (!profile) return { ok: false, reason: 'unknown-user' };

  await db
    .insert(disciplineStaffTable)
    .values({
      userId: input.userId,
      disciplineId: input.disciplineId,
      roleId: role.id,
      // The audit trail the schema comment asks for: who appointed this
      // expert. Always the acting admin's own id from the resolved session,
      // never anything the request body supplied.
      assignedBy: input.assignedBy,
    })
    .onConflictDoNothing({
      target: [
        disciplineStaffTable.userId,
        disciplineStaffTable.disciplineId,
        disciplineStaffTable.roleId,
      ],
    });
  return { ok: true };
}

/**
 * Revoke one discipline-scoped role from one person. Silent when the row is
 * already gone, matching `removeCourseStaff`.
 *
 * All three columns are in the WHERE. Dropping any one of them would widen
 * this into "revoke this person everywhere", "revoke everyone here", or
 * "revoke every role this person holds here" — none of which any caller asks
 * for, and each of which is unrecoverable.
 */
export async function removeDisciplineStaff(
  userId: string,
  disciplineId: number,
  roleName: string,
): Promise<void> {
  const [role] = await db
    .select({ id: userRolesTable.id })
    .from(userRolesTable)
    .where(eq(userRolesTable.name, roleName))
    .limit(1);
  if (!role) return;

  await db
    .delete(disciplineStaffTable)
    .where(
      and(
        eq(disciplineStaffTable.userId, userId),
        eq(disciplineStaffTable.disciplineId, disciplineId),
        eq(disciplineStaffTable.roleId, role.id),
      ),
    );
}
