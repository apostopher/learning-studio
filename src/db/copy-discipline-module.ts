import { and, asc, eq, gt, ne, sql } from 'drizzle-orm';
import { db } from '#/db';
import { createModule, reorderModule } from '#/db/admin';
import { invalidateCourseDetailsCache } from '#/db/course-cache';
import { getCourseSlugsForModuleId } from '#/db/lesson-access';
import {
  changeMembership,
  getCourseIdsShowingModule,
  lockModuleOwner,
} from '#/db/lesson-versions';
import { getCourseIdsForLessons } from '#/db/placements';
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
   * Lessons the course already teaches, left where they are: a course may
   * teach a lesson once (`linkLesson`'s 'duplicate'), and that rule holds here
   * too. Named so the admin is told exactly which ones did not come along.
   */
  skipped: { id: number; name: string }[];
  /** Snapshots taken for the placed lessons, for the caller to index. */
  createdVersionIds: number[];
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
 * Returns null when the discipline module does not exist in an org this
 * course belongs to — to the caller that is simply "not found".
 */
export async function copyDisciplineModuleIntoCourse(input: {
  courseId: number;
  disciplineModuleId: number;
  afterModuleId: number | null;
  /** Bring only this lesson (see `copyDisciplineModuleInputSchema`). */
  onlyLessonId?: number;
}): Promise<CopiedModule | null> {
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
        eq(disciplineModulesTable.id, input.disciplineModuleId),
        eq(courseOrgsTable.courseId, input.courseId),
      ),
    )
    .limit(1);
  if (!source) return null;

  const rows = await db
    .select({
      id: lessonsTable.id,
      name: lessonsTable.name,
      libraryRank: lessonsTable.libraryRank,
    })
    .from(lessonsTable)
    .where(
      input.onlyLessonId === undefined
        ? eq(lessonsTable.disciplineModuleId, source.id)
        : and(
            eq(lessonsTable.disciplineModuleId, source.id),
            eq(lessonsTable.id, input.onlyLessonId),
          ),
    );
  // A named lesson that is not in this module is a stale or forged request,
  // not "an empty module" — create nothing.
  if (input.onlyLessonId !== undefined && rows.length === 0) return null;
  const lessons = rows
    .map((r) => ({
      ...r,
      libraryRank: r.libraryRank === null ? null : Number(r.libraryRank),
    }))
    .sort(byLibraryOrder);

  // Membership, not ownership — the same test `linkLesson` applies, so a
  // lesson the course shows through a borrowed module counts as taught.
  const teaching = await getCourseIdsForLessons(lessons.map((l) => l.id));
  const taught = (id: number) =>
    (teaching.get(id) ?? []).includes(input.courseId);
  const toPlace = lessons.filter((l) => !taught(l.id));
  const skipped = lessons
    .filter((l) => taught(l.id))
    .map(({ id, name }) => ({ id, name }));

  const module = await createModule({
    courseId: input.courseId,
    name: source.name,
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
        () =>
          tx.insert(moduleLessonsTable).values(
            toPlace.map((lesson, i) => ({
              moduleId: module.id,
              lessonId: lesson.id,
              rank: String(i + 1),
              dependsOn: [],
            })),
          ),
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
