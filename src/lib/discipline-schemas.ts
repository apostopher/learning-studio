import { z } from 'zod';
import { SUBJECT_EXPERT_ROLE } from '#/lib/admin-schemas';

/**
 * Wire schemas for the org-level discipline admin surface.
 *
 * A separate module from `admin-schemas.ts` rather than an addition to it:
 * that file was under concurrent review when this task landed. It is also a
 * defensible split on its own terms — everything here is read only by the four
 * `/api/admin/disciplines*` routes and the one screen that drives them,
 * whereas `admin-schemas.ts` is the shared vocabulary of the whole admin tree.
 * `SUBJECT_EXPERT_ROLE` is imported, never re-declared: the role name is a
 * literal that guards compare, and a second copy is a second thing to keep in
 * step.
 */

/**
 * The roles that may be held ON a discipline — exactly one, today.
 *
 * The discipline-scoped mirror of `COURSE_SCOPED_ROLES`, and it exists for the
 * same reason that list does: `requireDisciplinePermission` unions an actor's
 * global roles with their `discipline_staff` roles and hands the union to
 * `getUserPermissions`, which answers `Set(['*'])` the instant `owner` appears
 * anywhere in it. A `discipline_staff` row naming `owner` (or `admin`) would
 * therefore mint unconditional authority through a door meant only for a
 * subject expert. `assignDisciplineStaff` refuses anything outside this list
 * at the write, so no route can open that door by forgetting to check.
 *
 * `course-manager` is deliberately absent: that role is about course
 * STRUCTURE (modules, ordering, placement), which is course-scoped work with
 * no discipline to scope it to. A discipline grants authority over lesson
 * CONTENT — see `DISCIPLINE_SCOPED_ENTITIES`, which is `['content']` alone.
 */
export const DISCIPLINE_SCOPED_ROLES = [SUBJECT_EXPERT_ROLE] as const;
export type DisciplineScopedRole = (typeof DISCIPLINE_SCOPED_ROLES)[number];

export function isDisciplineScopedRole(
  name: string,
): name is DisciplineScopedRole {
  return (DISCIPLINE_SCOPED_ROLES as readonly string[]).includes(name);
}

/** Trimmed, non-empty, and short enough to render in a column header. */
const disciplineName = z.string().trim().min(1).max(120);

export const createDisciplineInputSchema = z.object({ name: disciplineName });
export type CreateDisciplineInput = z.infer<typeof createDisciplineInputSchema>;

export const renameDisciplineInputSchema = z.object({ name: disciplineName });
export type RenameDisciplineInput = z.infer<typeof renameDisciplineInputSchema>;

/**
 * One grant or revocation on one discipline.
 *
 * `role` rides in the body even though the enum has a single member, matching
 * `setCourseStaffInputSchema`. It makes the write self-describing in a log and
 * means the day a second discipline-scoped role exists, the wire shape does
 * not change under every caller at once.
 */
export const setDisciplineStaffInputSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(DISCIPLINE_SCOPED_ROLES),
});
export type SetDisciplineStaffInput = z.infer<
  typeof setDisciplineStaffInputSchema
>;
