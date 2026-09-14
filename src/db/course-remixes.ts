// src/db/course-remixes.ts
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import { db } from '#/db';
import { invalidateCourseDetailsCache } from '#/db/course-cache';
import { courseModuleIds } from '#/db/course-modules';
import { getCourseSlugForCourseId } from '#/db/lesson-access';
import {
  courseModulesTable,
  courseOrgsTable,
  courseRemixesTable,
  coursesTable,
  lessonsTable,
  moduleDependenciesTable,
  moduleLessonsTable,
  modulesTable,
} from '#/db/schema';
import type { CourseLessonDependency } from '#/types';

export type RemixResult =
  | { ok: true; moduleCount: number }
  | { ok: false; reason: 'self' | 'not-found' | 'already-remixed' }
  | {
      /**
       * One of the source's OWNED modules gates on a module the source only
       * BORROWS. See `remixCourse` — the one-hop rule.
       */
      ok: false;
      reason: 'source-depends-on-borrowed';
      sourceName: string;
      modules: Array<{ slug: string; name: string }>;
    };

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
 * The `tx` handed to a `db.transaction` callback — what `modulesGatingOnBorrowed`
 * reads through so it runs under `remixCourse`'s lock.
 */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Which of a source's OWNED modules gate on something the source only
 * BORROWS — a module-level gate naming a borrowed module's slug, or a
 * lesson-level gate naming a lesson placed in a borrowed module. Those gates
 * would resolve to nothing one hop further; see `remixCourse`.
 *
 * "Borrowed" is the source's membership minus what it owns: a gate naming a
 * slug that is on NEITHER list (a module deleted since, say) is already
 * inert in the source and stays inert in the remixer, so it is not counted.
 */
async function modulesGatingOnBorrowed(
  tx: Tx,
  sourceCourseId: number,
  owned: Array<{ moduleId: number; slug: string; name: string }>,
): Promise<Array<{ slug: string; name: string }>> {
  const ownedIds = owned.map((m) => m.moduleId);
  const moduleGates = await tx
    .select({
      moduleId: moduleDependenciesTable.moduleId,
      dependsOn: moduleDependenciesTable.dependsOn,
    })
    .from(moduleDependenciesTable)
    .where(inArray(moduleDependenciesTable.moduleId, ownedIds));
  const lessonGates = await tx
    .select({
      moduleId: moduleLessonsTable.moduleId,
      dependsOn: moduleLessonsTable.dependsOn,
    })
    .from(moduleLessonsTable)
    .where(inArray(moduleLessonsTable.moduleId, ownedIds));
  // Membership (`courseModuleIds`) minus ownership — the modules on the
  // source's board that it does not own — with every lesson placed in them.
  // LEFT joins: a borrowed module with no lessons still names a module slug.
  const borrowed = await tx
    .select({ moduleSlug: modulesTable.slug, lessonSlug: lessonsTable.slug })
    .from(modulesTable)
    .leftJoin(
      moduleLessonsTable,
      eq(moduleLessonsTable.moduleId, modulesTable.id),
    )
    .leftJoin(lessonsTable, eq(lessonsTable.id, moduleLessonsTable.lessonId))
    .where(
      and(
        inArray(modulesTable.id, courseModuleIds(sourceCourseId)),
        ne(modulesTable.courseId, sourceCourseId),
      ),
    );
  const borrowedModuleSlugs = new Set(borrowed.map((b) => b.moduleSlug));
  const borrowedLessonSlugs = new Set(
    borrowed.flatMap((b) => (b.lessonSlug ? [b.lessonSlug] : [])),
  );

  const gatingModuleIds = new Set<number>();
  for (const gate of moduleGates) {
    if ((gate.dependsOn ?? []).some((slug) => borrowedModuleSlugs.has(slug)))
      gatingModuleIds.add(gate.moduleId);
  }
  for (const gate of lessonGates) {
    const deps = (gate.dependsOn ?? []) as CourseLessonDependency[];
    if (deps.some((d) => borrowedLessonSlugs.has(d.lessonSlug)))
      gatingModuleIds.add(gate.moduleId);
  }
  return owned
    .filter((m) => gatingModuleIds.has(m.moduleId))
    .map((m) => ({ slug: m.slug, name: m.name }));
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
 * The one-hop rule has a consequence for prerequisites (final review, #6).
 * An owned module MAY gate on a module its course only borrows — that is
 * the ITPS→flagship use, and `updateModuleDependencies` offers the whole
 * board — but the borrowed module does not travel on a further hop, so in
 * a remixer that gate would name nothing: `resolveDependency` drops a gate
 * it cannot resolve, and the remixer fails OPEN. The spec's "prerequisites
 * survive by construction" therefore holds only while no exported module
 * gates on a borrowed one, and this refuses the remix when one does —
 * module-level gates (`module_dependencies`) and lesson-level gates
 * (`module_lessons.depends_on` naming a lesson in a borrowed module) alike,
 * since both fail open the same way. Refused BEFORE the link row, so a
 * refusal writes nothing; the remedy (un-remix in the source, or drop the
 * gate) is the route's to name.
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
    const [source] = await tx
      .select({ id: coursesTable.id, name: coursesTable.name })
      .from(coursesTable)
      .where(eq(coursesTable.id, input.sourceCourseId))
      .for('update');
    if (!source) return { ok: false, reason: 'not-found' };

    const owned = await tx
      .select({
        moduleId: modulesTable.id,
        slug: modulesTable.slug,
        name: modulesTable.name,
        rank: courseModulesTable.rank,
      })
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

    // The one-hop check, before anything is written. Read under the lock so
    // a gate added in the source while this runs is either seen here or
    // serialised behind the commit.
    if (owned.length > 0) {
      const offending = await modulesGatingOnBorrowed(
        tx,
        input.sourceCourseId,
        owned,
      );
      if (offending.length > 0) {
        return {
          ok: false,
          reason: 'source-depends-on-borrowed',
          sourceName: source.name,
          modules: offending,
        };
      }
    }

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
    // Lock the SOURCE course row before reading or writing anything else —
    // the same row `remixCourse` and `createModule` lock, for the same
    // reason: a module being created in the source reads "who remixes this
    // source" under that lock and appends to each remixer. Serialised here,
    // the create either sees the link row gone (and skips this remixer) or
    // commits first (and its placement is among those deleted below). Not
    // serialised, it could append one borrowed module to a rail that no
    // longer remixes anything.
    await tx
      .select({ id: coursesTable.id })
      .from(coursesTable)
      .where(eq(coursesTable.id, input.sourceCourseId))
      .for('update');

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

/** How many courses borrow from `sourceCourseId` — what `deleteCourse` refuses on. */
export async function countRemixers(sourceCourseId: number): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(courseRemixesTable)
    .where(eq(courseRemixesTable.sourceCourseId, sourceCourseId));
  return Number(row?.n ?? 0);
}
