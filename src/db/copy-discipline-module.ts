import { and, asc, eq, gt, ne, type SQL, sql } from 'drizzle-orm';
import { db } from '#/db';
import { createModule, reorderModule } from '#/db/admin';
import { invalidateCourseDetailsCache } from '#/db/course-cache';
import {
  getCourseSlugsForModuleId,
  lessonBelongsToCourseOrg,
} from '#/db/lesson-access';
import {
  changeMembership,
  getCourseIdsShowingModule,
  lessonsOnRail,
  lockModuleOwner,
  releaseHiddenPins,
} from '#/db/lesson-versions';
import {
  courseModulesTable,
  courseOrgsTable,
  disciplineModulesTable,
  disciplinesTable,
  lessonsTable,
  moduleLessonsTable,
} from '#/db/schema';
import type { BoardModule } from '#/lib/admin-schemas';
import { byLibraryOrder } from '#/lib/library-rank';

export interface CopiedModule {
  module: BoardModule;
  /** Lessons placed in the new module, in library order. */
  placedLessonIds: number[];
  /**
   * Lessons the course already teaches where the rail shows them, left where
   * they are: `linkLesson`'s 'duplicate' holds here too. Named so the admin is told exactly which ones did not come along.
   */
  skipped: { id: number; name: string }[];
  /** Snapshots taken for the placed lessons, for the caller to index. */
  createdVersionIds: number[];
}

interface CopySource {
  courseId: number;
  /** Null for a lesson that is in no library module. */
  disciplineModuleId: number | null;
  /** Bring only this lesson (see `copyDisciplineModuleInputSchema`). */
  onlyLessonId?: number;
}

/**
 * The new module's name and the lessons it would hold. A lesson in no library
 * module lends the module its own name.
 */
async function readSource({
  courseId,
  disciplineModuleId,
  onlyLessonId,
}: CopySource) {
  const lessonsWhere = (where: SQL | undefined) =>
    db
      .select({
        id: lessonsTable.id,
        name: lessonsTable.name,
        libraryRank: lessonsTable.libraryRank,
      })
      .from(lessonsTable)
      .where(where);

  if (disciplineModuleId === null) {
    if (onlyLessonId === undefined) return null;
    if (!(await lessonBelongsToCourseOrg(onlyLessonId, courseId))) return null;
    const rows = await lessonsWhere(eq(lessonsTable.id, onlyLessonId));
    return rows[0] ? { name: rows[0].name, rows } : null;
  }

  // Scoped to the course's orgs: a discipline module of another org is
  // indistinguishable from one that does not exist.
  const [source] = await db
    .select({
      id: disciplineModulesTable.id,
      name: disciplineModulesTable.name,
    })
    .from(disciplineModulesTable)
    .innerJoin(
      disciplinesTable,
      eq(disciplinesTable.id, disciplineModulesTable.disciplineId),
    )
    .innerJoin(
      courseOrgsTable,
      eq(courseOrgsTable.orgId, disciplinesTable.orgId),
    )
    .where(
      and(
        eq(disciplineModulesTable.id, disciplineModuleId),
        eq(courseOrgsTable.courseId, courseId),
      ),
    )
    .limit(1);
  if (!source) return null;
  const inModule = eq(lessonsTable.disciplineModuleId, source.id);
  const rows = await lessonsWhere(
    onlyLessonId === undefined
      ? inModule
      : and(inModule, eq(lessonsTable.id, onlyLessonId)),
  );
  // A named lesson that is not in this module is a stale or forged request,
  // not "an empty module" — create nothing.
  if (onlyLessonId !== undefined && rows.length === 0) return null;
  return { name: source.name, rows };
}

/**
 * Copy a discipline (library) module into a course: a NEW course module with
 * the same name, holding the discipline module's lessons in library order.
 *
 * A one-time copy, not a link: later changes to the discipline module do not
 * flow into the course, and the course module is edited like any other. The
 * lessons themselves are org-owned and are PLACED, never duplicated — the
 * same placement `linkLesson` writes for a single dragged lesson.
 *
 * Free, like a module made with the + button (`createModule` writes
 * `requiredSubscriptions: []`); paid access is set afterwards on the module.
 *
 * `afterModuleId` positions it after that module on THIS course's rail;
 * null appends it at the end (`createModule`'s own placement).
 *
 * Returns null when the discipline module (or the named lesson) does not exist
 * in an org this course belongs to — to the caller that is simply "not found"
 * — and 'duplicate' when the one named lesson is already taught here.
 */
export async function copyDisciplineModuleIntoCourse(
  input: CopySource & { afterModuleId: number | null },
): Promise<CopiedModule | 'duplicate' | null> {
  const source = await readSource(input);
  if (!source) return null;
  const { name, rows } = source;
  const lessons = rows
    .map((r) => ({
      ...r,
      libraryRank: r.libraryRank === null ? null : Number(r.libraryRank),
    }))
    .sort(byLibraryOrder);

  // The same test `linkLesson` applies.
  const taught = await lessonsOnRail(
    db,
    input.courseId,
    lessons.map((l) => l.id),
  );
  const toPlace = lessons.filter((l) => !taught.has(l.id));
  const skipped = lessons
    .filter((l) => taught.has(l.id))
    .map((l) => ({ id: l.id, name: l.name }));
  // The module exists only for this lesson: without it, an empty one.
  if (input.onlyLessonId !== undefined && toPlace.length === 0)
    return 'duplicate';

  const module = await createModule({
    courseId: input.courseId,
    name,
  });

  if (input.afterModuleId !== null) {
    // The module that currently follows `afterModuleId` on this course's
    // rail (the new one, appended last by `createModule`, excluded). With
    // none, `afterModuleId` was already last and the append stands.
    const afterRank = sql`(select ${courseModulesTable.rank} from ${courseModulesTable} where ${courseModulesTable.courseId} = ${input.courseId} and ${courseModulesTable.moduleId} = ${input.afterModuleId})`;
    const [next] = await db
      .select({ moduleId: courseModulesTable.moduleId })
      .from(courseModulesTable)
      .where(
        and(
          eq(courseModulesTable.courseId, input.courseId),
          ne(courseModulesTable.moduleId, module.id),
          gt(courseModulesTable.rank, afterRank),
        ),
      )
      .orderBy(asc(courseModulesTable.rank))
      .limit(1);
    if (next) {
      const moved = await reorderModule({
        courseId: input.courseId,
        moduleId: module.id,
        prevModuleId: input.afterModuleId,
        nextModuleId: next.moduleId,
      });
      if (moved) module.rank = moved.rank;
    }
  }

  let createdVersionIds: number[] = [];
  if (toPlace.length > 0) {
    ({ createdVersionIds } = await db.transaction(async (tx) => {
      await lockModuleOwner(tx, input.courseId);
      return changeMembership(
        tx,
        {
          courseIds: await getCourseIdsShowingModule(tx, module.id),
          lessonIds: toPlace.map((l) => l.id),
        },
        async () => {
          await releaseHiddenPins(
            tx,
            module.id,
            toPlace.map((l) => l.id),
          );
          await tx.insert(moduleLessonsTable).values(
            toPlace.map((lesson, i) => ({
              moduleId: module.id,
              lessonId: lesson.id,
              rank: String(i + 1),
              dependsOn: [],
            })),
          );
        },
      );
    }));
    // Every course showing the module — the owner and any course remixing
    // it — just gained lessons.
    const slugs = await getCourseSlugsForModuleId(module.id);
    await Promise.all(slugs.map((slug) => invalidateCourseDetailsCache(slug)));
  }

  return {
    module,
    placedLessonIds: toPlace.map((l) => l.id),
    skipped,
    createdVersionIds,
  };
}
