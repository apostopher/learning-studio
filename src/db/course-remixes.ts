// src/db/course-remixes.ts
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '#/db';
import { invalidateCourseDetailsCache } from '#/db/course-cache';
import { getCourseSlugForCourseId } from '#/db/lesson-access';
import {
  courseModulesTable,
  courseOrgsTable,
  courseRemixesTable,
  coursesTable,
  modulesTable,
} from '#/db/schema';

export type RemixResult =
  | { ok: true; moduleCount: number }
  | { ok: false; reason: 'self' | 'not-found' | 'already-remixed' };

export type UnremixResult =
  | { ok: true; moduleCount: number }
  | { ok: false; reason: 'not-found' };

/**
 * True when every id names a course in `orgId` — the editor's tenant boundary
 * (`getOrgEditorBoard` joins `course_orgs` for the same reason). Without
 * this, an admin (who bypasses `structure`) could remix a course from another
 * deployment's org into their own, or un-remix one out of it.
 */
async function coursesAreInOrg(orgId: number, ids: number[]): Promise<boolean> {
  const rows = await db
    .select({ courseId: courseOrgsTable.courseId })
    .from(courseOrgsTable)
    .where(
      and(
        eq(courseOrgsTable.orgId, orgId),
        inArray(courseOrgsTable.courseId, ids),
      ),
    );
  const found = new Set(rows.map((r) => r.courseId));
  return ids.every((id) => found.has(id));
}

/**
 * Remix `sourceCourseId` into `courseId`: write the link row, then place every
 * module the source OWNS onto the remixer's rail, appended after its current
 * last module in the source's own order.
 *
 * OWNS — `modules.course_id` — not "is placed in the source": a source that
 * has itself remixed something does not pass those borrowed modules along.
 * One hop only (spec: no transitivity), which is also what makes A⇄B a pair
 * of flat lists rather than a recursion.
 *
 * Ordering joins the source's placements for rank only: an owned module with
 * no placement in its own course is not on the source's board either and is
 * left out here too. `onConflictDoNothing` on the placement insert is the
 * backstop for a module somehow already placed in the remixer — the unique
 * (course_id, module_id) index would otherwise fail the whole transaction.
 */
export async function remixCourse(input: {
  orgId: number;
  courseId: number;
  sourceCourseId: number;
  actorId: string | null;
}): Promise<RemixResult> {
  if (input.courseId === input.sourceCourseId)
    return { ok: false, reason: 'self' };
  if (
    !(await coursesAreInOrg(input.orgId, [
      input.courseId,
      input.sourceCourseId,
    ]))
  ) {
    return { ok: false, reason: 'not-found' };
  }

  const result = await db.transaction(async (tx): Promise<RemixResult> => {
    // Lock the SOURCE course row before reading or writing anything else.
    // `createModule` takes the same lock (on the same row, by course id)
    // before it reads who remixes the source — so a remix committing here
    // and a module being created in the source now serialise on that row:
    // whichever transaction commits second sees the other's effect, instead
    // of a remix racing a create and permanently missing the module (or a
    // create racing a remix and never appending to the just-added remixer).
    await tx
      .select({ id: coursesTable.id })
      .from(coursesTable)
      .where(eq(coursesTable.id, input.sourceCourseId))
      .for('update');

    const linked = await tx
      .insert(courseRemixesTable)
      .values({
        courseId: input.courseId,
        sourceCourseId: input.sourceCourseId,
        createdBy: input.actorId,
      })
      .onConflictDoNothing()
      .returning({ id: courseRemixesTable.id });
    if (linked.length === 0) return { ok: false, reason: 'already-remixed' };

    const owned = await tx
      .select({ moduleId: modulesTable.id, rank: courseModulesTable.rank })
      .from(modulesTable)
      .innerJoin(
        courseModulesTable,
        and(
          eq(courseModulesTable.moduleId, modulesTable.id),
          eq(courseModulesTable.courseId, input.sourceCourseId),
        ),
      )
      .where(eq(modulesTable.courseId, input.sourceCourseId))
      .orderBy(asc(courseModulesTable.rank), asc(modulesTable.id));

    const [{ maxRank }] = await tx
      .select({ maxRank: sql<string | null>`max(${courseModulesTable.rank})` })
      .from(courseModulesTable)
      .where(eq(courseModulesTable.courseId, input.courseId));
    const base = maxRank === null ? 0 : Number(maxRank);

    if (owned.length > 0) {
      await tx
        .insert(courseModulesTable)
        .values(
          owned.map((m, i) => ({
            courseId: input.courseId,
            moduleId: m.moduleId,
            rank: String(base + i + 1),
          })),
        )
        .onConflictDoNothing();
    }
    return { ok: true, moduleCount: owned.length };
  });

  if (result.ok) {
    // The remixer's learner payload just changed shape; the source's did not.
    await invalidateCourseDetailsCache(
      await getCourseSlugForCourseId(input.courseId),
    );
  }
  return result;
}

/**
 * Undo a remix: drop the link, then every placement in the remixer of a
 * module the source OWNS. The remixer's own modules — and anything it
 * borrowed from a different source — are untouched, which the WHERE's owner
 * subquery guarantees.
 */
export async function unremixCourse(input: {
  orgId: number;
  courseId: number;
  sourceCourseId: number;
}): Promise<UnremixResult> {
  if (
    !(await coursesAreInOrg(input.orgId, [
      input.courseId,
      input.sourceCourseId,
    ]))
  ) {
    return { ok: false, reason: 'not-found' };
  }

  const result = await db.transaction(async (tx): Promise<UnremixResult> => {
    const unlinked = await tx
      .delete(courseRemixesTable)
      .where(
        and(
          eq(courseRemixesTable.courseId, input.courseId),
          eq(courseRemixesTable.sourceCourseId, input.sourceCourseId),
        ),
      )
      .returning({ id: courseRemixesTable.id });
    if (unlinked.length === 0) return { ok: false, reason: 'not-found' };

    // The owner filter is a `sql` fragment rather than a builder subquery:
    // it is over the OWNER column, which has no membership-style helper
    // (`courseModuleIds` answers "placed in", the wrong question here), and a
    // fragment renders standalone so the WHERE can be pinned as text.
    const removed = await tx
      .delete(courseModulesTable)
      .where(
        and(
          eq(courseModulesTable.courseId, input.courseId),
          sql`${courseModulesTable.moduleId} in (select ${modulesTable.id} from ${modulesTable} where ${modulesTable.courseId} = ${input.sourceCourseId})`,
        ),
      )
      .returning({ id: courseModulesTable.id });
    return { ok: true, moduleCount: removed.length };
  });

  if (result.ok) {
    await invalidateCourseDetailsCache(
      await getCourseSlugForCourseId(input.courseId),
    );
  }
  return result;
}

/** The courses `courseId` borrows from. */
export async function getRemixSourceIds(courseId: number): Promise<number[]> {
  const rows = await db
    .select({ sourceCourseId: courseRemixesTable.sourceCourseId })
    .from(courseRemixesTable)
    .where(eq(courseRemixesTable.courseId, courseId));
  return rows.map((r) => r.sourceCourseId);
}

/** The courses borrowing from `sourceCourseId`. */
export async function getRemixerCourseIds(
  sourceCourseId: number,
): Promise<number[]> {
  const rows = await db
    .select({ courseId: courseRemixesTable.courseId })
    .from(courseRemixesTable)
    .where(eq(courseRemixesTable.sourceCourseId, sourceCourseId));
  return rows.map((r) => r.courseId);
}

/** How many courses borrow from `sourceCourseId` — what `deleteCourse` refuses on. */
export async function countRemixers(sourceCourseId: number): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(courseRemixesTable)
    .where(eq(courseRemixesTable.sourceCourseId, sourceCourseId));
  return Number(row?.n ?? 0);
}
