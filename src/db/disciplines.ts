import { and, asc, count, eq, isNull } from 'drizzle-orm';
import { db } from '#/db';
import { disciplinesTable, lessonsTable } from '#/db/schema';
import { slugify } from '#/lib/slugify';

export type DisciplineSummary = {
  id: number;
  name: string;
  slug: string;
  /**
   * Lessons whose `discipline_id` points here — the number that decides
   * whether a delete can succeed, so it is counted with NO org filter. A
   * lesson from another org pointing at this discipline would still block the
   * delete at the foreign key, and a count that quietly excluded it would
   * promise a deletion the database refuses.
   */
  lessonCount: number;
};

export type DisciplineListing = {
  disciplines: DisciplineSummary[];
  /**
   * Lessons in this org with no discipline at all — the library's "Untitled"
   * column. Admin-only by design (`requireLessonContentPermission` falls back
   * to `requireAdmin` for a null discipline), so this is the size of the
   * triage queue only an admin can work through.
   */
  unfiledLessonCount: number;
};

export type DisciplineRecord = { id: number; name: string; slug: string };

export type DisciplineWriteResult =
  | { ok: true; discipline: DisciplineRecord }
  | { ok: false; reason: 'duplicate-name' }
  | { ok: false; reason: 'not-found' };

export type DisciplineDeleteResult =
  | { ok: true }
  | { ok: false; reason: 'not-found' }
  | { ok: false; reason: 'has-lessons'; lessonCount: number };

/** Postgres unique-violation — `disciplines.slug` is the only unique index here. */
function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  if ((error as { code?: unknown }).code === '23505') return true;
  const cause = (error as { cause?: unknown }).cause;
  return Boolean(
    cause &&
      typeof cause === 'object' &&
      (cause as { code?: unknown }).code === '23505',
  );
}

/** Postgres foreign-key violation — `lessons.discipline_id` is `on delete no action`. */
function isForeignKeyViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  if ((error as { code?: unknown }).code === '23503') return true;
  const cause = (error as { cause?: unknown }).cause;
  return Boolean(
    cause &&
      typeof cause === 'object' &&
      (cause as { code?: unknown }).code === '23503',
  );
}

/**
 * Every discipline in the org with the number of lessons filed under it, plus
 * the number of lessons filed under nothing.
 *
 * A LEFT join with `count(lessons.id)`, not an inner one: a discipline with no
 * lessons is the normal state of a discipline that was just created, and an
 * inner join would make it disappear from the very screen that created it.
 * Counting a COLUMN rather than `count()` is what makes the empty case come
 * back as 0 instead of 1 — `count(*)` over a left join counts the null row.
 *
 * The unfiled count is a separate query rather than a `filter`ed aggregate on
 * the same one: those lessons join to no discipline row at all, so there is no
 * group for them to land in.
 */
export async function listDisciplines(
  orgId: number,
): Promise<DisciplineListing> {
  const disciplines = await db
    .select({
      id: disciplinesTable.id,
      name: disciplinesTable.name,
      slug: disciplinesTable.slug,
      lessonCount: count(lessonsTable.id),
    })
    .from(disciplinesTable)
    .leftJoin(lessonsTable, eq(lessonsTable.disciplineId, disciplinesTable.id))
    .where(eq(disciplinesTable.orgId, orgId))
    .groupBy(disciplinesTable.id, disciplinesTable.name, disciplinesTable.slug)
    .orderBy(asc(disciplinesTable.name));

  const [unfiled] = await db
    .select({ value: count() })
    .from(lessonsTable)
    .where(
      and(eq(lessonsTable.orgId, orgId), isNull(lessonsTable.disciplineId)),
    );

  return {
    disciplines,
    unfiledLessonCount: unfiled?.value ?? 0,
  };
}

/**
 * Does this org own this discipline? The row, or null.
 *
 * THE single definition of "this deployment administers that discipline",
 * shared by every write that needs it: `deleteDiscipline` here, and both staff
 * writes in `discipline-staff.ts`. One definition on purpose — an ownership
 * predicate copied per call site is a predicate that gets tightened in three
 * places and forgotten in a fourth.
 *
 * It answers a question the id alone cannot: `disciplines.id` is a global
 * serial and `user_profiles` has no org column, so without this check any
 * user is grantable on any discipline in the database, and a `disciplineId`
 * that exists nowhere reaches the INSERT and raises an uncaught foreign-key
 * violation — a bad request body reading as a 500. Both are the failure
 * `assignDisciplineStaff` already refuses for an unknown `userId`; this is the
 * same rule applied to the other id in the same body.
 */
export async function findDisciplineInOrg(
  orgId: number,
  disciplineId: number,
): Promise<{ id: number } | null> {
  const [row] = await db
    .select({ id: disciplinesTable.id })
    .from(disciplinesTable)
    .where(
      and(
        eq(disciplinesTable.id, disciplineId),
        eq(disciplinesTable.orgId, orgId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Lessons currently filed under this discipline.
 *
 * Deliberately not org-scoped — see `DisciplineSummary.lessonCount`. This is
 * the number the delete refusal quotes, so it has to be the number the foreign
 * key will act on.
 */
export async function countLessonsInDiscipline(
  disciplineId: number,
): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(lessonsTable)
    .where(eq(lessonsTable.disciplineId, disciplineId));
  return row?.value ?? 0;
}

/**
 * Create a discipline in the org, with a slug derived from its name.
 *
 * `disciplines.slug` is globally unique (not per-org), so the duplicate is
 * reported rather than raised — the same treatment `createPersona` gives a
 * colliding name, and for the same reason: a name someone typed is a bad
 * request, not a server fault.
 *
 * A name that slugifies to nothing (punctuation or a non-Latin script alone)
 * would otherwise insert an empty slug and take the unique slot for every
 * later such name. It is reported as a duplicate too — the message the route
 * builds tells the admin to pick a different name either way, which is the
 * only action available.
 */
export async function createDiscipline(
  orgId: number,
  name: string,
): Promise<DisciplineWriteResult> {
  const slug = slugify(name);
  if (slug === '') return { ok: false, reason: 'duplicate-name' };

  try {
    const [row] = await db
      .insert(disciplinesTable)
      .values({ orgId, name, slug })
      .returning({
        id: disciplinesTable.id,
        name: disciplinesTable.name,
        slug: disciplinesTable.slug,
      });
    return { ok: true, discipline: row };
  } catch (error) {
    if (isUniqueViolation(error))
      return { ok: false, reason: 'duplicate-name' };
    throw error;
  }
}

/**
 * Rename a discipline. The NAME only — the slug minted at creation stays put.
 *
 * The slug is this row's stable identifier: `getOrgLibrary` ships it with every
 * library column, and re-deriving it on every rename would silently invalidate
 * anything keyed on it while looking like a cosmetic edit. Personas take the
 * same line (`renamePersona` writes `name` and nothing else).
 *
 * Scoped by `orgId` as well as id, so an id belonging to another org reads as
 * "not found" rather than being renamed across an org boundary.
 */
export async function renameDiscipline(
  orgId: number,
  disciplineId: number,
  name: string,
): Promise<DisciplineWriteResult> {
  const [row] = await db
    .update(disciplinesTable)
    .set({ name, updatedAt: new Date() })
    .where(
      and(
        eq(disciplinesTable.orgId, orgId),
        eq(disciplinesTable.id, disciplineId),
      ),
    )
    .returning({
      id: disciplinesTable.id,
      name: disciplinesTable.name,
      slug: disciplinesTable.slug,
    });
  return row
    ? { ok: true, discipline: row }
    : { ok: false, reason: 'not-found' };
}

/**
 * Delete a discipline — but only once it holds no lessons.
 *
 * `lessons.discipline_id` is `on delete no action`, so a discipline with
 * lessons cannot be deleted at all: the database raises a foreign-key
 * violation that no caller catches and the admin sees a 500. The choice made
 * here is to REFUSE rather than to reassign: silently moving a subject
 * expert's lessons into the admin-only "Untitled" queue (the only other
 * automatic option, since nothing can pick a new discipline for them) would
 * revoke that SME's authorship of every one of them as a side effect of an
 * unrelated click. So the caller is told the count and asked to empty the
 * column first, which they can do by dragging the lessons in the library
 * editor.
 *
 * Counted BEFORE the delete rather than only catching the violation, so the
 * refusal can name the number and — the part that matters — so no DELETE is
 * ever issued for a discipline that has lessons. The catch is a backstop for
 * the race where a lesson is filed here between the count and the delete; it
 * re-counts so the message it produces is as truthful as the first one.
 *
 * `discipline_staff` is `on delete cascade`, so deleting an EMPTY discipline
 * takes its SME assignments with it. That is correct — there is no subject
 * left to be expert in — and is why the confirm on the screen names them.
 */
export async function deleteDiscipline(
  orgId: number,
  disciplineId: number,
): Promise<DisciplineDeleteResult> {
  // Ownership BEFORE the count, and this ordering is the whole point of the
  // two being separate queries. `countLessonsInDiscipline` is deliberately not
  // org-scoped (it has to match what the foreign key will act on), so counting
  // first and reporting `has-lessons` would answer a caller who named ANOTHER
  // org's discipline with that discipline's exact lesson count — a 409
  // disclosing the size of a curriculum this deployment does not administer,
  // where an unowned id must read as "not found".
  if ((await findDisciplineInOrg(orgId, disciplineId)) === null) {
    return { ok: false, reason: 'not-found' };
  }

  const lessonCount = await countLessonsInDiscipline(disciplineId);
  if (lessonCount > 0) return { ok: false, reason: 'has-lessons', lessonCount };

  try {
    const deleted = await db
      .delete(disciplinesTable)
      .where(
        and(
          eq(disciplinesTable.orgId, orgId),
          eq(disciplinesTable.id, disciplineId),
        ),
      )
      .returning({ id: disciplinesTable.id });
    // Still scoped by org as well as id even though ownership was just
    // resolved: the two reads are not one transaction, and a WHERE that says
    // what the caller is entitled to is cheaper than reasoning about the gap.
    return deleted.length > 0
      ? { ok: true }
      : { ok: false, reason: 'not-found' };
  } catch (error) {
    if (!isForeignKeyViolation(error)) throw error;
    return {
      ok: false,
      reason: 'has-lessons',
      lessonCount: await countLessonsInDiscipline(disciplineId),
    };
  }
}
